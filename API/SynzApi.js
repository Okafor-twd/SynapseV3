"use strict";

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const child_process = require("node:child_process");

// Native Addon fallback
let SynzNativeApi = null;
try {
    SynzNativeApi = require("./synznativeapi.node");
} catch (_) {
    // If native addon cannot be loaded (e.g. ABI mismatch or missing),
    // pure JS fallbacks implemented below will handle all functionality.
}

let LatestErrorMsg = "";

// Paths
const LocalAppData = process.env.LOCALAPPDATA || "";
const MainPath = path.join(LocalAppData, "Synapse Z");
const BinPath = path.join(MainPath, "bin");
const SchedulerPath = path.join(BinPath, "scheduler");
const AccountKeyPath = path.join(LocalAppData, "auth_v2.syn");

function setLatestErrorMessage(msg) {
    LatestErrorMsg = String(msg || "");
}

function GetLatestErrorMessage() {
    return LatestErrorMsg;
}

function RandomString(length = 10) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function GetExecutionPath(PID = 0) {
    if (!fs.existsSync(BinPath)) {
        setLatestErrorMessage("Bin Folder not found");
        return 1;
    }
    if (!fs.existsSync(SchedulerPath)) {
        setLatestErrorMessage("Scheduler Folder not found");
        return 2;
    }
    const randomFileName = `${RandomString(10)}.lua`;
    const numPid = Number(PID) || 0;
    const filePath = numPid === 0
        ? path.join(SchedulerPath, randomFileName)
        : path.join(SchedulerPath, `PID${numPid}_${randomFileName}`);
    return filePath;
}

/**
 * Return values:
 * 0 - Execution successful
 * 1 - Bin Folder not found
 * 2 - Scheduler Folder not found
 * 3 - No access to write file
 */
function Execute(Script, PID = 0) {
    const executionPath = GetExecutionPath(PID);
    if (typeof executionPath === "number") {
        return executionPath;
    }
    try {
        fs.writeFileSync(executionPath, `${Script}@@FileFullyWritten@@`);
        return 0;
    } catch (e) {
        setLatestErrorMessage(e.message || String(e));
        return 3;
    }
}

/**
 * Return values:
 * 0 - Execution successful
 * 1 - Bin Folder not found
 * 2 - Scheduler Folder not found
 * 3 - No access to write file
 */
async function ExecuteAsync(Script, PID = 0) {
    const executionPath = GetExecutionPath(PID);
    if (typeof executionPath === "number") {
        return executionPath;
    }
    try {
        await fs.promises.writeFile(executionPath, `${Script}@@FileFullyWritten@@`);
        return 0;
    } catch (e) {
        setLatestErrorMessage(e.message || String(e));
        return 3;
    }
}

function GetAccountKey() {
    if (!fs.existsSync(AccountKeyPath)) return "";
    try {
        return fs.readFileSync(AccountKeyPath, "utf8").trim();
    } catch (_) {
        return "";
    }
}

async function GetAccountKeyAsync() {
    if (!fs.existsSync(AccountKeyPath)) return "";
    try {
        const data = await fs.promises.readFile(AccountKeyPath, "utf8");
        return data.trim();
    } catch (_) {
        return "";
    }
}

/**
 * Return values:
 * Date - Expire Date in Unix Seconds
 * null - Could not find Account Key / API Error
 */
async function GetExpireDate() {
    const accountKey = await GetAccountKeyAsync();
    if (!accountKey) {
        setLatestErrorMessage("Could not find Account Key");
        return null;
    }

    try {
        const res = await fetch("https://z-api.synapse.do/info", {
            method: "GET",
            headers: {
                "key": accountKey,
                "USER-AGENT": "SYNZ-SERVICE",
            },
        });

        if (res.status !== 418) {
            setLatestErrorMessage(`API Error: ${res.status}`);
            return null;
        }

        const data = await res.text();
        const clean = data.replace(/\0/g, "").trim();
        const expireSec = parseInt(clean, 10);
        if (isNaN(expireSec)) {
            setLatestErrorMessage("API Error: Invalid response format");
            return null;
        }
        return new Date(expireSec * 1000);
    } catch (_) {
        setLatestErrorMessage("API Error: Failed to connect");
        return null;
    }
}

/**
 * Return values:
 *  0 - Successful
 * -1 - Could not find Account Key
 * -2 - API Error
 * -3 - Invalid License
 */
async function Redeem(license) {
    const accountKey = await GetAccountKeyAsync();
    if (!accountKey) {
        setLatestErrorMessage("Could not find Account Key");
        return -1;
    }

    try {
        const res = await fetch("https://z-api.synapse.do/redeem", {
            method: "POST",
            headers: {
                "key": accountKey,
                "USER-AGENT": "SYNZ-SERVICE",
                "license": String(license || ""),
            },
        });

        if (res.status === 418) {
            const body = await res.text();
            if (body.startsWith("Added")) {
                return 0;
            }
            setLatestErrorMessage("Invalid License");
            return -3;
        } else if (res.status === 403) {
            setLatestErrorMessage("Invalid License");
            return -3;
        }
        setLatestErrorMessage(`API Error: ${res.status}`);
        return -2;
    } catch (_) {
        setLatestErrorMessage("API Error: Failed to connect");
        return -2;
    }
}

/**
 * Return values:
 *  0 - Successful
 * -1 - Could not find Account Key
 * -2 - API Error
 * -3 - Cooldown
 * -4 - Blacklisted
 */
async function ResetHwid() {
    const accountKey = await GetAccountKeyAsync();
    if (!accountKey) {
        setLatestErrorMessage("Could not find Account Key");
        return -1;
    }

    try {
        const res = await fetch("https://z-api.synapse.do/resethwid", {
            method: "POST",
            headers: {
                "key": accountKey,
                "USER-AGENT": "SYNZ-SERVICE",
            },
        });

        switch (res.status) {
            case 418:
                return 0;
            case 429:
                setLatestErrorMessage("Cooldown");
                return -3;
            case 403:
                setLatestErrorMessage("Blacklisted");
                return -4;
            default:
                setLatestErrorMessage(`API Error: ${res.status}`);
                return -2;
        }
    } catch (_) {
        setLatestErrorMessage("API Error: Failed to connect");
        return -2;
    }
}

/**
 * Finds all RobloxPlayerBeta.exe executables on disk in standard Roblox folders.
 */
function findRobloxExePaths() {
    const paths = [];
    const robloxVersionsDir = path.join(LocalAppData, "Roblox", "Versions");
    if (fs.existsSync(robloxVersionsDir)) {
        try {
            const entries = fs.readdirSync(robloxVersionsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const exePath = path.join(robloxVersionsDir, entry.name, "RobloxPlayerBeta.exe");
                    if (fs.existsSync(exePath)) {
                        paths.push(exePath);
                    }
                }
            }
        } catch (_) {}
    }
    return paths;
}

/**
 * Checks if an executable has the Synapse Z binary signature (".grh" within the first 0x1000 bytes).
 */
function isSynzPath(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return false;
    try {
        const fd = fs.openSync(filePath, "r");
        const buf = Buffer.alloc(0x1000);
        const bytesRead = fs.readSync(fd, buf, 0, 0x1000, 0);
        fs.closeSync(fd);
        const slice = buf.subarray(0, bytesRead);
        return slice.includes(".grh");
    } catch (_) {
        return false;
    }
}

/**
 * Retrieves running Roblox processes.
 * Returns array of objects with { pid, name, path }.
 */
function GetRobloxProcesses() {
    if (SynzNativeApi && typeof SynzNativeApi.GetRobloxProcesses === "function") {
        try {
            const list = SynzNativeApi.GetRobloxProcesses();
            if (Array.isArray(list)) return list;
        } catch (_) {}
    }

    // Pure Node fallback: use tasklist on Windows
    try {
        const stdout = child_process.execFileSync("tasklist", [
            "/fi", "imagename eq RobloxPlayerBeta.exe",
            "/fo", "csv",
            "/nh"
        ], { encoding: "utf8", windowsHide: true });

        const results = [];
        const lines = stdout.split(/\r?\n/);
        const knownPaths = findRobloxExePaths();
        const defaultPath = knownPaths.length > 0 ? knownPaths[0] : "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("INFO:")) continue;
            const match = trimmed.match(/^"([^"]+)","(\d+)"/);
            if (match) {
                const name = match[1];
                const pid = parseInt(match[2], 10);
                if (name.toLowerCase().includes("robloxplayerbeta") && !isNaN(pid)) {
                    results.push({
                        pid,
                        name,
                        path: defaultPath,
                    });
                }
            }
        }
        return results;
    } catch (_) {
        return [];
    }
}

/**
 * Checks if a specific Roblox process is a Synapse Z instance.
 */
function IsSynz(PID) {
    const numPid = Number(PID);
    if (SynzNativeApi && typeof SynzNativeApi.IsSynzInstance === "function") {
        try {
            return Boolean(SynzNativeApi.IsSynzInstance(numPid));
        } catch (_) {}
    }

    // 1. Check if the Synz named pipe exists for this PID
    const pipePath = `\\\\.\\pipe\\synz-${numPid}`;
    if (fs.existsSync(pipePath)) {
        return true;
    }

    // 2. Check if .grh signature is present in the executable
    const processes = GetRobloxProcesses();
    const proc = processes.find(p => Number(p.pid) === numPid);
    if (proc && proc.path && fs.existsSync(proc.path)) {
        if (isSynzPath(proc.path)) return true;
    }

    const exePaths = findRobloxExePaths();
    for (const ep of exePaths) {
        if (isSynzPath(ep)) return true;
    }

    return false;
}

function GetSynzRobloxInstances() {
    const processes = GetRobloxProcesses();
    const res = [];
    for (const p of processes) {
        if (IsSynz(Number(p.pid))) {
            res.push(p);
        }
    }
    return res;
}

function AreAllInstancesSynz() {
    const processes = GetRobloxProcesses();
    if (processes.length === 0) return false;
    for (const p of processes) {
        if (!IsSynz(Number(p.pid))) {
            return false;
        }
    }
    return true;
}

// ── V2 Named Pipes Session Architecture (SynapseSession) ─────────────────────

class SynapseSession {
    constructor(pid) {
        this.pid = Number(pid);
        this.pipeName = "";
        this.pendingCommandQueue = [];
        this.onMessageCallbacks = [];
        this.mainSocket = null;
        this.sessionSocket = null;
        this.isConnected = false;
        this.destroyed = false;
        this._loopTimer = null;

        // Internal listener to parse console outputs/errors
        this.addOnMessageCallback((command, data) => {
            this._consoleOutputInternal(command, data);
        });
    }

    queueCommand(command) {
        this.pendingCommandQueue.push(String(command));
    }

    execute(source) {
        this.queueCommand(`execute ${source}`);
    }

    addOnMessageCallback(callback) {
        if (typeof callback === "function") {
            this.onMessageCallbacks.push(callback);
        }
    }

    /**
     * Parses incoming pipe messages and dispatches console output events.
     * RS API output_type values:
     *   0 = print
     *   1 = info
     *   2 = warn
     *   3 = error
     *
     * Pipe message format from Synapse Z:
     *   "output <output_type> <content>"
     *   "error <content>"  (always type 3)
     */
    _consoleOutputInternal(command, data) {
        if (command !== "read" || !data) return;
        const spaceIdx = data.indexOf(" ");
        if (spaceIdx === -1) return;
        const cmd = data.slice(0, spaceIdx);
        const payload = data.slice(spaceIdx + 1);

        if (cmd === "output") {
            // payload = "<output_type> <content>"
            const secondSpace = payload.indexOf(" ");
            if (secondSpace !== -1) {
                const typeStr = payload.slice(0, secondSpace);
                const content = payload.slice(secondSpace + 1);
                // RS API: 0=print, 1=info, 2=warn, 3=error
                const outType = parseInt(typeStr, 10);
                if (!isNaN(outType)) {
                    SynapseZAPI2.triggerSessionOutput(this.pid, outType, content);
                }
            }
        } else if (cmd === "error") {
            // Unhandled errors from the client are always type 3 (error)
            SynapseZAPI2.triggerSessionOutput(this.pid, 3, payload);
        }
    }

    async init() {
        const pipePath = `\\\\.\\pipe\\synz-${this.pid}`;
        return new Promise((resolve) => {
            let resolved = false;
            const done = (val) => {
                if (!resolved) {
                    resolved = true;
                    resolve(val);
                }
            };

            const timeout = setTimeout(() => {
                if (this.mainSocket) {
                    try { this.mainSocket.destroy(); } catch (_) {}
                }
                done(false);
            }, 3000);

            try {
                this.mainSocket = net.createConnection(pipePath, () => {
                    this.mainSocket.write("new");
                });

                this.mainSocket.once("data", (data) => {
                    clearTimeout(timeout);
                    const rawName = data.toString("utf8").replace(/\0/g, "").trim();
                    if (rawName) {
                        this.pipeName = rawName.startsWith("\\\\.\\pipe\\") ? rawName : `\\\\.\\pipe\\${rawName}`;
                        this.isConnected = true;
                        this._startSessionLoop();
                        done(true);
                    } else {
                        done(false);
                    }
                });

                this.mainSocket.on("error", () => {
                    clearTimeout(timeout);
                    done(false);
                });
            } catch (_) {
                clearTimeout(timeout);
                done(false);
            }
        });
    }

    _startSessionLoop() {
        if (this.destroyed || !this.pipeName) return;

        try {
            this.sessionSocket = net.createConnection(this.pipeName, () => {
                this._sessionTick();
            });

            this.sessionSocket.on("data", (data) => {
                this._handleSessionData(data);
            });

            this.sessionSocket.on("error", () => {
                this.destroy();
                SynapseZAPI2.removeSession(this.pid);
            });

            this.sessionSocket.on("close", () => {
                this.destroy();
                SynapseZAPI2.removeSession(this.pid);
            });
        } catch (_) {
            this.destroy();
            SynapseZAPI2.removeSession(this.pid);
        }
    }

    _sessionTick() {
        if (this.destroyed || !this.sessionSocket || !this.sessionSocket.writable) return;

        const q = this.pendingCommandQueue.splice(0, this.pendingCommandQueue.length);
        q.push("read");

        try {
            this.sessionSocket.write(String(q.length));
            for (const cmd of q) {
                this.sessionSocket.write(cmd);
            }
        } catch (_) {
            this.destroy();
            SynapseZAPI2.removeSession(this.pid);
            return;
        }

        this._loopTimer = setTimeout(() => {
            this._sessionTick();
        }, 50);
    }

    _handleSessionData(buffer) {
        const text = buffer.toString("utf8");
        const parts = text.split("\0").map(s => s.trim()).filter(Boolean);
        for (let i = 0; i < parts.length; i++) {
            const msg = parts[i];
            for (const cb of this.onMessageCallbacks) {
                try {
                    cb("read", msg, i);
                } catch (_) {}
            }
        }
    }

    destroy() {
        this.destroyed = true;
        this.isConnected = false;
        if (this._loopTimer) {
            clearTimeout(this._loopTimer);
            this._loopTimer = null;
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
}

// ── V2 Global Instance Manager & Event Bus (SynapseZAPI2) ────────────────────

const SESSIONS = new Map();
let TIMER_ID = null;
const SESSION_ADDED_EVENTS = [];
const SESSION_REMOVED_EVENTS = [];
const SESSION_OUTPUT_EVENTS = [];

class SynapseZAPI2 {
    /**
     * Register a callback for when a new Synapse Z session (attached Roblox instance) is detected.
     * Equivalent to RS API: SynapseZAPI2::on_session_added(|session| { ... });
     * @param {function(SynapseSession): void} callback
     */
    static onSessionAdded(callback) {
        if (typeof callback === "function") SESSION_ADDED_EVENTS.push(callback);
    }

    /**
     * Register a callback for when a Synapse Z session is removed (Roblox instance closed).
     * Equivalent to RS API: SynapseZAPI2::on_session_removed(|session| { ... });
     * @param {function(SynapseSession): void} callback
     */
    static onSessionRemoved(callback) {
        if (typeof callback === "function") SESSION_REMOVED_EVENTS.push(callback);
    }

    /**
     * Register a callback for console output from any attached Roblox session.
     * Equivalent to RS API: SynapseZAPI2::on_session_output(|session, output_type, content| { ... });
     *
     * output_type values (RS API spec):
     *   0 = print
     *   1 = info
     *   2 = warn
     *   3 = error
     *
     * @param {function(SynapseSession, number, string): void} callback
     */
    static onSessionOutput(callback) {
        if (typeof callback === "function") SESSION_OUTPUT_EVENTS.push(callback);
    }

    /**
     * Start the internal session / instance checker timer.
     * Equivalent to RS API: SynapseZAPI2::start_instances_timer();
     * @param {number} [intervalMs=2000]
     */
    static startInstancesTimer(intervalMs = 2000) {
        if (TIMER_ID !== null) return;
        TIMER_ID = setInterval(() => {
            SynapseZAPI2.instancesTimerTick();
        }, intervalMs);
        setImmediate(() => SynapseZAPI2.instancesTimerTick());
    }

    /**
     * Stop the internal session / instance checker timer.
     * Equivalent to RS API: SynapseZAPI2::stop_instances_timer();
     */
    static stopInstancesTimer() {
        if (TIMER_ID !== null) {
            clearInterval(TIMER_ID);
            TIMER_ID = null;
        }
    }

    static async instancesTimerTick() {
        const processes = GetRobloxProcesses();
        const currentPids = new Set(processes.map(p => Number(p.pid)));

        // Remove dead sessions
        for (const [pid, session] of SESSIONS.entries()) {
            if (!currentPids.has(pid)) {
                session.destroy();
                SESSIONS.delete(pid);
                for (const cb of SESSION_REMOVED_EVENTS) {
                    try { cb(session); } catch (_) {}
                }
            }
        }

        // Add new Synz instances
        for (const p of processes) {
            const pid = Number(p.pid);
            if (SESSIONS.has(pid)) continue;
            if (!IsSynz(pid)) continue;

            const session = new SynapseSession(pid);
            SESSIONS.set(pid, session);
            const ok = await session.init();
            if (ok) {
                for (const cb of SESSION_ADDED_EVENTS) {
                    try { cb(session); } catch (_) {}
                }
            } else {
                session.destroy();
                SESSIONS.delete(pid);
            }
        }
    }

    /**
     * Execute a Lua script. Uses named pipe sessions when available (V2),
     * with automatic fallback to the V1 scheduler file-drop mechanism.
     *
     * Equivalent to RS API:
     *   SynapseZAPI2::execute(script, 0);              // all instances
     *   SynapseZAPI2::execute(script, pid);            // specific PID
     *
     * @param {string} source - Lua script to execute
     * @param {number} [pid=0] - Target PID, or 0 to execute on all attached instances
     * @returns {number} 0 on success
     */
    static execute(source, pid = 0) {
        const targetPid = Number(pid) || 0;

        // V2: dispatch via live pipe sessions
        if (targetPid === 0) {
            for (const session of SESSIONS.values()) {
                session.execute(source);
            }
        } else {
            const session = SESSIONS.get(targetPid);
            if (session) {
                session.execute(source);
            }
        }

        // V1 fallback: also write to scheduler folder (always fires; Synapse Z will pick it up)
        Execute(source, targetPid);
        return 0;
    }

    /**
     * Returns a snapshot Map of all currently active sessions, keyed by PID.
     * @returns {Map<number, SynapseSession>}
     */
    static getInstances() {
        return new Map(SESSIONS);
    }

    static removeSession(pid) {
        const targetPid = Number(pid);
        const session = SESSIONS.get(targetPid);
        if (session) {
            session.destroy();
            SESSIONS.delete(targetPid);
            for (const cb of SESSION_REMOVED_EVENTS) {
                try { cb(session); } catch (_) {}
            }
        }
    }

    static triggerSessionOutput(pid, outType, output) {
        const session = SESSIONS.get(Number(pid));
        for (const cb of SESSION_OUTPUT_EVENTS) {
            try { cb(session, outType, output); } catch (_) {}
        }
    }
}

// ── V1 Static Class Container (SynapseZAPI) ──────────────────────────────────

class SynapseZAPI {
    static getLatestErrorMessage() { return GetLatestErrorMessage(); }
    static execute(script, pid = 0) { return Execute(script, pid); }
    static executeAsync(script, pid = 0) { return ExecuteAsync(script, pid); }
    static getExpireDate() { return GetExpireDate(); }
    static getExpireDateAsync() { return GetExpireDate(); }
    static redeem(license) { return Redeem(license); }
    static redeemAsync(license) { return Redeem(license); }
    static resetHwid() { return ResetHwid(); }
    static resetHwidAsync() { return ResetHwid(); }
    static getRobloxProcesses() { return GetRobloxProcesses(); }
    static isSynz(pid) { return IsSynz(pid); }
    static isSynzPath(path) { return isSynzPath(path); }
    static getAccountKey() { return GetAccountKey(); }
    static getAccountKeyAsync() { return GetAccountKeyAsync(); }
    static randomString(length = 10) { return RandomString(length); }
}

// ── Exports (Full compatibility with SynzApi.js and synapsezapi.rs) ──────────

module.exports = {
    // Legacy SynzApi.js exports
    GetLatestErrorMessage,
    Execute,
    ExecuteAsync,
    GetExpireDate,
    Redeem,
    ResetHwid,
    GetAccountKey,
    GetAccountKeyAsync,
    GetRobloxProcesses,
    GetSynzRobloxInstances,
    IsSynz,
    IsSynzInstance: IsSynz,
    AreAllInstancesSynz,
    RandomString,

    // Rust synapsezapi.rs camelCase / snake_case aliases
    get_latest_error_message: GetLatestErrorMessage,
    getLatestErrorMessage: GetLatestErrorMessage,
    execute: Execute,
    execute_async: ExecuteAsync,
    executeAsync: ExecuteAsync,
    get_expire_date: GetExpireDate,
    getExpireDate: GetExpireDate,
    redeem: Redeem,
    reset_hwid: ResetHwid,
    resetHwid: ResetHwid,
    get_account_key: GetAccountKey,
    getAccountKey: GetAccountKey,
    get_account_key_async: GetAccountKeyAsync,
    getAccountKeyAsync: GetAccountKeyAsync,
    get_roblox_processes: GetRobloxProcesses,
    getRobloxProcesses: GetRobloxProcesses,
    get_synz_roblox_instances: GetSynzRobloxInstances,
    getSynzRobloxInstances: GetSynzRobloxInstances,
    is_synz: IsSynz,
    isSynz: IsSynz,
    is_synz_path: isSynzPath,
    isSynzPath: isSynzPath,
    are_all_instances_synz: AreAllInstancesSynz,
    areAllInstancesSynz: AreAllInstancesSynz,
    random_string: RandomString,
    randomString: RandomString,

    // Classes
    SynapseZAPI,
    SynapseSession,
    SynapseZAPI2,
    SynzApi2: SynapseZAPI2,
};
