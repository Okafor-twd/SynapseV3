/**
 * executionTargetService.js
 * Renderer-side singleton shared by the Clients page and the editor execution
 * call sites. Decides which session PIDs a script execution targets.
 *
 * Semantics (Clients page controls):
 *   - "Execute for all sessions" ON: the session filter is a multi-select of
 *     PIDs — every live session except the deselected (excluded) ones.
 *   - "Execute for all sessions" OFF: the session filter is disabled and
 *     execution targets the sessions whose "Execute for this session" card
 *     checkbox is enabled.
 *   - Clients page never opened (no snapshot published): null — the main
 *     process keeps the legacy broadcast-to-all behavior.
 */

const state = {
    hydrated: false,
    executeAll: false,
    excludedPids: new Set(), // deselected in the session filter (execute-all mode)
    disabledPids: new Set(), // card "Execute for this session" unchecked (single mode)
    knownPids: new Set(), // live session PIDs (strings), kept in sync via IPC events
};

function startSessionSync() {
    window.hwAPI?.getSynzSessions?.()
        .then(pids => {
            (Array.isArray(pids) ? pids : []).forEach(p => state.knownPids.add(String(p)));
        })
        .catch(() => {});

    window.hwAPI?.onSynzSessionAdded?.((pid) => {
        const key = String(pid);
        // Only the very first session starts with its "Execute for this
        // session" checkbox enabled; sessions joining later start disabled.
        const isFirstSession = state.knownPids.size === 0;
        state.knownPids.add(key);
        state.excludedPids.delete(key);
        if (isFirstSession) state.disabledPids.delete(key);
        else state.disabledPids.add(key);
    });

    window.hwAPI?.onSynzSessionRemoved?.((pid) => {
        const key = String(pid);
        state.knownPids.delete(key);
        state.excludedPids.delete(key);
        state.disabledPids.delete(key);
    });
}

if (typeof window !== 'undefined' && window.hwAPI) {
    startSessionSync();
}

/**
 * Called by the Clients page whenever its controls change.
 * @param {{ executeAll: boolean, excludedPids: Array<string|number>, sessions: Array<{pid: string|number}> }} snapshot
 */
export function publishExecutionSnapshot(snapshot) {
    state.hydrated = true;
    state.executeAll = Boolean(snapshot.executeAll);
    state.excludedPids = new Set(
        (Array.isArray(snapshot.excludedPids) ? snapshot.excludedPids : []).map(String)
    );
    if (Array.isArray(snapshot.sessions)) {
        for (const s of snapshot.sessions) {
            if (s && s.pid !== undefined && s.pid !== null) {
                state.knownPids.add(String(s.pid));
            }
        }
    }
}

/**
 * Per-card "Execute for this session" checkbox state (used when execute-all
 * is off).
 * @param {string|number} pid
 * @param {boolean} enabled
 */
export function publishSessionEnabled(pid, enabled) {
    const key = String(pid);
    if (enabled) state.disabledPids.delete(key);
    else state.disabledPids.add(key);
}

/**
 * Initial state for the Clients page remounts, so the UI reflects whatever
 * was last active instead of silently resetting.
 */
export function getExecutionSnapshot() {
    return {
        hydrated: state.hydrated,
        executeAll: state.executeAll,
        excludedPids: Array.from(state.excludedPids),
    };
}

/**
 * Resolves the execution targets for the next editor execution.
 * @returns {string[]|null} array of PID strings, or null when the Clients
 *   page has never been opened (legacy broadcast).
 */
export function getExecuteTargets() {
    if (!state.hydrated) return null;

    const excluded = state.executeAll ? state.excludedPids : state.disabledPids;
    return Array.from(state.knownPids).filter(p => !excluded.has(p));
}
