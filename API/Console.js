"use strict";

const net = require("node:net");

/**
 * Synapse Z Console Output Types (matches synapsezapi.rs RS API):
 * 0: print
 * 1: info
 * 2: warn
 * 3: error
 */
const OUTPUT_TYPES = {
    PRINT: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

const MAIN_PIPE_RETRY_MS = 1000;
const MAIN_NAME_GRACE_MS = 300;
const POLL_INTERVAL_MS = 100;
const BATCH_IDLE_MS = 60;
const BATCH_MAX_WAIT_MS = 2000;
const RESPONSE_TIMEOUT_MS = 1500;
const SESSION_CONNECT_RETRY_MS = 250;
const SESSION_CONNECT_MAX_TRIES = 20;
const MAX_BUFFER_BYTES = 1 << 20;

// A data message always starts with one of these prefixes (synapsezapi.rs
// console_output_internal parses exactly these two shapes).
const MESSAGE_START_RE = /output \d+ |error /g;

/**
 * Manages live named-pipe console redirection for an individual Roblox session.
 * Pure Node.js implementation — connects to \\.\pipe\synz-{PID} with net sockets,
 * no external helper binary required.
 *
 * Wire protocol (mirrors the official synapsezapi.rs client):
 *   1. Connect to the main pipe, send "new" (one message), receive the full
 *      session pipe path as raw bytes; the server then closes the connection.
 *   2. Connect to the session pipe and poll: write the command count ("1")
 *      and the command ("read") as two separate pipe messages. The server
 *      answers with a numeric message count followed by that many raw data
 *      messages ("output <type> <content>" / "error <content>").
 *
 * Node sockets read pipes in byte mode while the game's server is message-mode,
 * so message boundaries are not handed to us. Two things keep this safe:
 *   - Writes are serialized through flush callbacks (libuv would otherwise be
 *     free to gather "1" and "read" into a single WriteFile, which the server
 *     would read as one malformed message and desync).
 *   - Requests are strictly paced: one outstanding request, never while the
 *     socket still has unflushed bytes, next request only after the previous
 *     response batch went idle — so response batches never interleave and the
 *     server queue is never flooded.
 * Batch parsing splits messages at their known start patterns and validates
 * the result against the server-provided count (exact when they agree,
 * best-effort merge when message content itself contains a start pattern).
 */
class SynapseConsole {
    /**
     * @param {number} pid - Process ID of the attached Roblox instance
     * @param {object} [options]
     * @param {function(number, number, string): void} [options.onOutput] - Callback: (pid, outputType, content)
     */
    constructor(pid, options = {}) {
        this.pid = Number(pid);
        this.mainPipeName = `\\\\.\\pipe\\synz-${this.pid}`;
        this.sessionPipeName = null;
        this.mainSocket = null;
        this.sessionSocket = null;
        this.pollTimer = null;
        this.batchTimer = null;
        this.retryTimer = null;
        this.mainNameTimer = null;
        this.sessionRetryTimer = null;
        this.isActive = false;
        this.destroyed = false;
        this.sessionEverConnected = false;
        this.readState = "idle"; // idle -> awaiting -> collecting -> idle
        this.lastRequestAt = 0;
        this.batchStartedAt = 0;
        this.mainBuffer = Buffer.alloc(0);
        this.sessionBuffer = Buffer.alloc(0);
        this.onOutput = typeof options.onOutput === "function" ? options.onOutput : null;
    }

    /**
     * Starts console redirection for this session.
     */
    start() {
        if (this.isActive || this.destroyed || !this.pid) return;
        this.isActive = true;
        this._connectMainPipe();
    }

    // ── Main pipe handshake ─────────────────────────────────────────────────

    _connectMainPipe() {
        if (!this.isActive || this.destroyed || this.sessionPipeName) return;

        let socket;
        try {
            socket = net.createConnection(this.mainPipeName);
        } catch (_) {
            this._scheduleMainPipeRetry();
            return;
        }
        this.mainSocket = socket;
        this.mainBuffer = Buffer.alloc(0);

        socket.once("connect", () => {
            // Single write = single pipe message. Never queue other writes in
            // the same tick or libuv may gather them into one message.
            try { socket.write("new"); } catch (_) {}
        });

        socket.on("data", (chunk) => this._handleMainData(chunk));
        // 'close' always follows 'error'; both are handled below
        socket.on("error", () => {});
        socket.on("close", () => {
            if (this.mainSocket === socket) this.mainSocket = null;
            // The server closes the connection right after sending the session
            // pipe name — that close is the natural end of the response.
            this._resolveMainName(true);
            if (!this.sessionPipeName) this._scheduleMainPipeRetry();
        });
    }

    _scheduleMainPipeRetry() {
        if (this.destroyed || !this.isActive || this.sessionPipeName) return;
        if (this.retryTimer) return;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            if (this.isActive && !this.destroyed && !this.sessionPipeName) {
                this._connectMainPipe();
            }
        }, MAIN_PIPE_RETRY_MS);
    }

    _handleMainData(chunk) {
        this.mainBuffer = Buffer.concat([this.mainBuffer, chunk]);
        if (this.mainBuffer.length > MAX_BUFFER_BYTES) {
            this.mainBuffer = Buffer.alloc(0);
            return;
        }
        this._resolveMainName(false);
    }

    _resolveMainName(force) {
        if (this.sessionPipeName || !this.mainBuffer.length || !this.isActive || this.destroyed) return;

        const text = this.mainBuffer.toString("utf8");
        const nullIdx = text.indexOf("\0");
        if (nullIdx === -1 && !force) {
            // No terminator yet — the server usually closes the connection to
            // signal the end, which resolves via the 'close' handler. The grace
            // timer covers servers that keep the connection open.
            if (!this.mainNameTimer) {
                this.mainNameTimer = setTimeout(() => {
                    this.mainNameTimer = null;
                    this._resolveMainName(true);
                }, MAIN_NAME_GRACE_MS);
            }
            return;
        }

        const raw = nullIdx === -1 ? text : text.slice(0, nullIdx);
        this.mainBuffer = Buffer.alloc(0);
        if (this.mainNameTimer) {
            clearTimeout(this.mainNameTimer);
            this.mainNameTimer = null;
        }

        const clean = raw.replace(/\0/g, "").trim();
        if (!clean) return;

        this.sessionPipeName = clean.startsWith("\\\\.\\pipe\\")
            ? clean
            : `\\\\.\\pipe\\${clean}`;

        if (this.mainSocket) {
            try { this.mainSocket.destroy(); } catch (_) {}
            this.mainSocket = null;
        }

        this._connectSessionPipe();
    }

    // ── Session pipe ────────────────────────────────────────────────────────

    _connectSessionPipe() {
        if (!this.isActive || this.destroyed || !this.sessionPipeName) return;

        let socket;
        try {
            socket = net.createConnection(this.sessionPipeName);
        } catch (_) {
            this._scheduleSessionConnectRetry();
            return;
        }
        this.sessionSocket = socket;
        this.sessionBuffer = Buffer.alloc(0);
        this.readState = "idle";

        socket.once("connect", () => {
            this.sessionEverConnected = true;
            //this._emit(OUTPUT_TYPES.INFO, "Console redirection active.");
            this._startPolling();
        });

        socket.on("data", (chunk) => this._handleSessionData(chunk));
        // 'close' always follows 'error' and handles teardown
        socket.on("error", () => {});
        socket.on("close", () => {
            if (this.sessionSocket === socket) this.sessionSocket = null;
            this._stopPolling();
            if (!this.sessionEverConnected) {
                // The server may not have started listening on the new session
                // pipe yet (synapsezapi.rs waits on it before connecting).
                this._scheduleSessionConnectRetry();
            } else {
                // Session ended server-side; the manager recreates the console
                // with a fresh handshake on its next tick.
                this.stop();
            }
        });
    }

    _scheduleSessionConnectRetry() {
        if (this.destroyed || !this.isActive || this.sessionEverConnected) return;
        if (this.sessionRetryTimer) return;
        this.sessionRetryTimer = setTimeout(() => {
            this.sessionRetryTimer = null;
            if (this.isActive && !this.destroyed && !this.sessionEverConnected) {
                this._connectSessionPipe();
            }
        }, SESSION_CONNECT_RETRY_MS);
    }

    // ── Request/response polling ───────────────────────────────────────────

    _startPolling() {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => this._pollTick(), POLL_INTERVAL_MS);
    }

    _stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
    }

    _pollTick() {
        if (this.destroyed || !this.isActive) return;
        const socket = this.sessionSocket;
        if (!socket || socket.destroyed) return;

        const now = Date.now();

        if (this.readState === "awaiting" && now - this.lastRequestAt > RESPONSE_TIMEOUT_MS) {
            // Server never answered; allow the request to be re-sent.
            this.readState = "idle";
        }
        if (this.readState !== "idle") return;
        if (socket.writableLength > 0) return; // backpressure: never queue ahead

        this.readState = "awaiting";
        this.lastRequestAt = now;

        // "1" (command count) and "read" must reach the server as two separate
        // pipe messages — serialize through the flush callback.
        try {
            socket.write("1", () => {
                if (this.destroyed || this.sessionSocket !== socket) return;
                try { socket.write("read"); } catch (_) {}
            });
        } catch (_) {
            this.readState = "idle";
        }
    }

    _handleSessionData(chunk) {
        if (this.destroyed || !this.isActive) return;

        this.sessionBuffer = Buffer.concat([this.sessionBuffer, chunk]);
        if (this.sessionBuffer.length > MAX_BUFFER_BYTES) {
            console.error(`[SynapseConsole] Dropping oversized session buffer for PID ${this.pid}`);
            this.sessionBuffer = Buffer.alloc(0);
            this.readState = "idle";
            return;
        }

        if (this.readState === "awaiting") this.readState = "collecting";
        if (this.readState !== "collecting") this.readState = "collecting";
        this.batchStartedAt = Date.now();

        // A bare numeric response means zero pending messages — the batch is
        // already complete, no need to wait for the idle window.
        const text = this.sessionBuffer.toString("utf8");
        if (/^\d+$/.test(text)) {
            this._flushBatch();
            return;
        }

        if (this.batchTimer) clearTimeout(this.batchTimer);
        this.batchTimer = setTimeout(() => this._flushBatch(), BATCH_IDLE_MS);

        const waited = Date.now() - this.batchStartedAt;
        if (waited >= BATCH_MAX_WAIT_MS) this._flushBatch();
    }

    _flushBatch() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        if (this.destroyed || !this.isActive) return;

        const batch = this.sessionBuffer;
        this.sessionBuffer = Buffer.alloc(0);
        this.readState = "idle";

        if (batch.length) this._parseBatch(batch);
    }

    // ── Batch parsing ───────────────────────────────────────────────────────

    /**
     * Parses one response batch: an optional numeric message count followed by
     * that many raw messages. Splits at known message-start patterns and
     * validates against the count.
     */
    _parseBatch(batch) {
        const text = batch.toString("utf8");
        if (!text) return;

        const countMatch = /^(\d+)/.exec(text);
        const expected = countMatch ? parseInt(countMatch[1], 10) : null;
        const payload = countMatch ? text.slice(countMatch[1].length) : text;
        if (!payload) return; // count-only batch (e.g. "0" — nothing pending)

        // Exact path: some server builds terminate every message with \0.
        if (payload.includes("\0")) {
            const parts = payload.split("\0").map((p) => p.replace(/\0/g, ""));
            const nonEmpty = parts.filter((p) => p.trim());
            if (expected === null || nonEmpty.length === expected) {
                for (const part of nonEmpty) this._parseMessage(part);
                return;
            }
        }

        // General path: message starts at every known prefix occurrence.
        const starts = [];
        MESSAGE_START_RE.lastIndex = 0;
        let m;
        while ((m = MESSAGE_START_RE.exec(payload)) !== null) {
            starts.push(m.index);
            MESSAGE_START_RE.lastIndex = m.index + 1;
        }

        let boundaries;
        if (expected !== null && starts.length > expected) {
            // Content itself contains a start pattern; keep the first
            // `expected` starts and let the last message absorb the rest.
            boundaries = starts.slice(0, expected);
        } else {
            boundaries = starts;
        }

        for (let i = 0; i < boundaries.length; i++) {
            const end = i + 1 < boundaries.length ? boundaries[i + 1] : payload.length;
            const message = payload.slice(boundaries[i], end);
            if (message.trim()) this._parseMessage(message);
        }

        if (expected !== null && boundaries.length === 0 && payload.trim()) {
            // No recognizable message shape — emit as a print so data is never
            // silently lost on protocol drift.
            this._emit(OUTPUT_TYPES.PRINT, payload.trim());
        }
    }

    _parseMessage(message) {
        const line = message.replace(/\0/g, "").trim();
        if (!line) return;

        const spaceIdx = line.indexOf(" ");
        if (spaceIdx === -1) {
            this._emit(OUTPUT_TYPES.PRINT, line);
            return;
        }
        const cmd = line.slice(0, spaceIdx);
        const payload = line.slice(spaceIdx + 1);

        if (cmd === "output") {
            const secondSpace = payload.indexOf(" ");
            if (secondSpace !== -1) {
                const typeNum = parseInt(payload.slice(0, secondSpace), 10);
                const content = payload.slice(secondSpace + 1);
                this._emit(Number.isNaN(typeNum) ? OUTPUT_TYPES.PRINT : typeNum, content);
            } else {
                this._emit(OUTPUT_TYPES.PRINT, payload);
            }
        } else if (cmd === "error") {
            this._emit(OUTPUT_TYPES.ERROR, payload);
        } else {
            this._emit(OUTPUT_TYPES.PRINT, line);
        }
    }

    _emit(type, content) {
        if (typeof this.onOutput === "function") {
            try {
                this.onOutput(this.pid, type, content);
            } catch (_) {}
        }
    }

    /**
     * Closes connections and stops polling.
     */
    stop() {
        this.isActive = false;
        this._stopPolling();
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        if (this.mainNameTimer) {
            clearTimeout(this.mainNameTimer);
            this.mainNameTimer = null;
        }
        if (this.sessionRetryTimer) {
            clearTimeout(this.sessionRetryTimer);
            this.sessionRetryTimer = null;
        }
        if (this.mainSocket) {
            try { this.mainSocket.destroy(); } catch (_) {}
            this.mainSocket = null;
        }
        if (this.sessionSocket) {
            try { this.sessionSocket.destroy(); } catch (_) {}
            this.sessionSocket = null;
        }
        this.readState = "idle";
    }

    /**
     * Permanently marks this session console as destroyed.
     */
    destroy() {
        this.destroyed = true;
        this.stop();
    }
}

/**
 * Manages active SynapseConsole instances across all connected sessions.
 */
class SynapseConsoleManager {
    constructor() {
        this.consoles = new Map(); // pid -> SynapseConsole
        this.outputListeners = [];
    }

    onOutput(callback) {
        if (typeof callback === "function") {
            this.outputListeners.push(callback);
        }
    }

    startForSession(pid) {
        const numPid = Number(pid);
        if (!numPid) return;

        const existing = this.consoles.get(numPid);
        if (existing) {
            if (existing.isActive) return;
            // Stale entry: the reader already tore itself down (e.g. it started
            // before the game's pipe server was listening). Recreate it so
            // redirection recovers instead of being wedged forever.
            existing.destroy();
            this.consoles.delete(numPid);
        }

        const consoleInstance = new SynapseConsole(numPid, {
            onOutput: (targetPid, type, content) => {
                for (const cb of this.outputListeners) {
                    try { cb(targetPid, type, content); } catch (_) {}
                }
            },
        });

        this.consoles.set(numPid, consoleInstance);
        consoleInstance.start();
    }

    stopForSession(pid) {
        const numPid = Number(pid);
        const inst = this.consoles.get(numPid);
        if (inst) {
            inst.destroy();
            this.consoles.delete(numPid);
        }
    }

    stopAll() {
        for (const inst of this.consoles.values()) {
            inst.destroy();
        }
        this.consoles.clear();
    }
}

module.exports = {
    SynapseConsole,
    SynapseConsoleManager,
    OUTPUT_TYPES,
};
