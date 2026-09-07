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
    if (!Script || !String(Script).trim()) {
        return 0; // Guard against blank scripts
    }
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
    if (!Script || !String(Script).trim()) {
        return 0; // Guard against blank scripts
    }
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

    // 2. Check if .grh signature is present in the specific process executable
    const processes = GetRobloxProcesses();
    const proc = processes.find(p => Number(p.pid) === numPid);
    if (proc && proc.path && fs.existsSync(proc.path)) {
        if (isSynzPath(proc.path)) return true;
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

// ── V2 Session Architecture (SynapseSession) ─────────────────────────────────

class SynapseSession {
    constructor(pid) {
        this.pid = Number(pid);
        this.pipeName = `\\\\.\\pipe\\synz-${this.pid}`;
        this.pendingCommandQueue = [];
        this.onMessageCallbacks = [];
        this.isConnected = true;
        this.destroyed = false;
    }

    queueCommand(command) {
        this.pendingCommandQueue.push(String(command));
    }

    execute(source) {
        if (!source || !String(source).trim()) return 0;
        return Execute(source, this.pid);
    }

    addOnMessageCallback(callback) {
        if (typeof callback === "function") {
            this.onMessageCallbacks.push(callback);
        }
    }

    async init() {
        return IsSynz(this.pid);
    }

    destroy() {
        this.destroyed = true;
        this.isConnected = false;
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
            if (!currentPids.has(pid) || !IsSynz(pid)) {
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
            for (const cb of SESSION_ADDED_EVENTS) {
                try { cb(session); } catch (_) {}
            }
        }
    }

    /**
     * Execute a Lua script.
     * Equivalent to RS API:
     *   SynapseZAPI2::execute(script, 0);              // all instances
     *   SynapseZAPI2::execute(script, pid);            // specific PID
     *
     * @param {string} source - Lua script to execute
     * @param {number} [pid=0] - Target PID, or 0 to execute on all attached instances
     * @returns {number} 0 on success
     */
    static execute(source, pid = 0) {
        const text = String(source || '').trim();
        if (!text) {
            return 0; // Guard against blank scripts
        }
        const targetPid = Number(pid) || 0;
        return Execute(text, targetPid);
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
