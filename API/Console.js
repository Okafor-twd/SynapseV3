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

/**
 * Manages live named-pipe console redirection for an individual Roblox session.
 * Connects to \\.\pipe\synz-{PID} in pure Node.js without requiring external helper binaries.
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
        this.isActive = false;
        this.destroyed = false;
        this.onOutput = typeof options.onOutput === "function" ? options.onOutput : null;
        this.buffer = "";
    }

    /**
     * Starts console redirection for this session.
     */
    start() {
        if (this.isActive || this.destroyed) return;
        this.isActive = true;
        this._connectMainPipe();
    }

    _connectMainPipe() {
        if (!this.isActive || this.destroyed) return;

        try {
            this.mainSocket = net.createConnection(this.mainPipeName);
        } catch (_) {
            this._retryMainPipe();
            return;
        }

        this.mainSocket.once("connect", () => {
            try {
                this.mainSocket.write("new");
            } catch (_) {}
        });

        this.mainSocket.on("data", (data) => {
            const raw = data.toString("utf8").replace(/\0/g, "").trim();
            if (raw) {
                this.sessionPipeName = raw.startsWith("\\\\.\\pipe\\")
                    ? raw
                    : `\\\\.\\pipe\\${raw}`;

                try {
                    this.mainSocket.destroy();
                } catch (_) {}
                this.mainSocket = null;

                this._connectSessionPipe();
            }
        });

        this.mainSocket.on("error", () => {
            this._retryMainPipe();
        });

        this.mainSocket.on("close", () => {
            if (this.mainSocket && !this.sessionPipeName) {
                this._retryMainPipe();
            }
        });
    }

    _retryMainPipe() {
        if (this.mainSocket) {
            try { this.mainSocket.destroy(); } catch (_) {}
            this.mainSocket = null;
        }
        if (this.isActive && !this.destroyed && !this.sessionPipeName) {
            setTimeout(() => {
                if (this.isActive && !this.destroyed && !this.sessionPipeName) {
                    this._connectMainPipe();
                }
            }, 1000);
        }
    }

    _connectSessionPipe() {
        if (!this.isActive || this.destroyed || !this.sessionPipeName) return;

        try {
            this.sessionSocket = net.createConnection(this.sessionPipeName);
        } catch (_) {
            return;
        }

        this.sessionSocket.once("connect", () => {
            // Signal that console redirection is successfully established
            this._emit(OUTPUT_TYPES.INFO, "Console redirection active.");
            this._startPolling();
        });

        this.sessionSocket.on("data", (chunk) => {
            this._handleSessionData(chunk);
        });

        this.sessionSocket.on("error", () => {
            this.stop();
        });

        this.sessionSocket.on("close", () => {
            this.stop();
        });
    }

    _startPolling() {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => {
            this._poll();
        }, 120);
    }

    _poll() {
        if (!this.sessionSocket || this.sessionSocket.destroyed || !this.isActive) {
            return;
        }
        try {
            this.sessionSocket.write("1");
            this.sessionSocket.write("read");
        } catch (_) {}
    }

    _handleSessionData(chunk) {
        this.buffer += chunk.toString("utf8");
        const tokens = this.buffer.split(/[\0\r\n]+/);
        // Leave the last token in buffer in case it's incomplete
        this.buffer = tokens.pop() || "";

        for (const token of tokens) {
            const clean = token.trim();
            if (!clean) continue;
            this._parseLine(clean);
        }
    }

    _parseLine(line) {
        if (line.startsWith("output ")) {
            const rest = line.slice(7);
            const spaceIdx = rest.indexOf(" ");
            if (spaceIdx !== -1) {
                const typeStr = rest.slice(0, spaceIdx);
                const content = rest.slice(spaceIdx + 1);
                const typeNum = parseInt(typeStr, 10);
                if (!isNaN(typeNum)) {
                    this._emit(typeNum, content);
                } else {
                    this._emit(OUTPUT_TYPES.PRINT, rest);
                }
            } else {
                this._emit(OUTPUT_TYPES.PRINT, rest);
            }
        } else if (line.startsWith("error ")) {
            const content = line.slice(6);
            this._emit(OUTPUT_TYPES.ERROR, content);
        } else {
            // Ignore numeric message-count headers
            if (/^\d+$/.test(line)) {
                return;
            }
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
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        if (this.mainSocket) {
            try { this.mainSocket.destroy(); } catch (_) {}
            this.mainSocket = null;
        }
        if (this.sessionSocket) {
            try { this.sessionSocket.destroy(); } catch (_) {}
            this.sessionSocket = null;
        }
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
        if (!numPid || this.consoles.has(numPid)) return;

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
