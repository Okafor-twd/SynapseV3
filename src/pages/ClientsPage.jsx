import React, { useState, useEffect, useCallback, useRef } from 'react';
import { i18n } from '../services/i18nService';
import { Checkbox } from '../components/settings/controls/Checkbox';
import { publishExecutionSnapshot, publishSessionEnabled, getExecutionSnapshot } from '../services/executionTargetService';

/**
 * ClientCard — represents one connected Roblox/Synapse Z session.
 */
function ClientCard({ session, executeAll, excluded, onToggleExec }) {
    const pid = session.pid;
    // Dim cards excluded from execution while "Execute for all sessions" is on
    const isFiltered = executeAll && excluded.has(String(pid));
    const [execThis, setExecThis] = useState(session._execEnabled !== false);
    const [, setTick] = useState(0);

    useEffect(() => {
        return i18n.subscribe(() => setTick(t => t + 1));
    }, []);

    const handleToggle = (val) => {
        setExecThis(val);
        session._execEnabled = val;
        onToggleExec?.(pid, val);
    };

    return (
        <div
            className={`client-card hw-multimenu flex flex-col rounded-md border transition-all duration-200 ${
                isFiltered ? 'opacity-30 pointer-events-none select-none' : 'opacity-100'
            }`}
        >
            {/* Card Header */}
            <div className="client-card-header category-label flex items-center gap-2 px-3 py-2 border-b rounded-t-md select-none">
                <iconify-icon icon="fluent:apps-list-detail-20-filled" class="flex items-center justify-center text-base opacity-70" />
                <span className="text-sm font-semibold">
                    {i18n.t('clients-session-prefix', 'Session: ')}{pid}
                </span>
                <span
                    className="ml-auto text-xs opacity-40 font-mono"
                >
                    PID
                </span>
            </div>

            {/* Execute for this session toggle */}
            <div
                className="action-container flex w-full items-center px-3 py-2 cursor-pointer"
                onClick={() => handleToggle(!execThis)}
            >
                <div className="text flex flex-col">
                    <div className="caption text-xs lg:text-sm">
                        {i18n.t('clients-exec-this', 'Execute for this session')}
                    </div>
                    <div className="description text-xs opacity-50">
                        {i18n.t('clients-exec-this-desc', 'When enabled, scripts will execute on this specific session.')}
                    </div>
                </div>
                <div className="ml-auto flex gap-1">
                    <Checkbox checked={execThis} onChange={handleToggle} />
                </div>
            </div>
        </div>
    );
}

/**
 * ClientsPage — shows all currently connected Synapse Z sessions.
 */
export function ClientsPage() {
    const [sessions, setSessions] = useState([]);
    const [executeAll, setExecuteAll] = useState(false);
    const [excluded, setExcluded] = useState(() => new Set()); // PIDs deselected in the session filter
    const [filterOpen, setFilterOpen] = useState(false);
    const [, setTick] = useState(0);
    const filterRef = useRef(null);

    // Language re-renders
    useEffect(() => {
        return i18n.subscribe(() => setTick(t => t + 1));
    }, []);

    // Close filter dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (filterRef.current && !filterRef.current.contains(e.target)) {
                setFilterOpen(false);
            }
        };
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, []);

    // Initial session list fetch + subscribe to add/remove events
    useEffect(() => {
        // Fetch current sessions (only the first one starts with its checkbox
        // enabled; additional sessions start disabled)
        window.hwAPI?.getSynzSessions?.()
            .then(pids => {
                if (Array.isArray(pids)) {
                    const built = pids.map((pid, i) => ({ pid, _execEnabled: i === 0 }));
                    setSessions(built);
                    built.forEach(s => publishSessionEnabled(s.pid, s._execEnabled));
                }
            })
            .catch(() => {});

        // Subscribe to session added
        const unsubAdded = window.hwAPI?.onSynzSessionAdded?.((pid) => {
            setSessions(prev => {
                if (prev.find(s => s.pid === pid)) return prev;
                // Sessions joining after the first start with the checkbox disabled
                const enabled = prev.length === 0;
                publishSessionEnabled(pid, enabled);
                return [...prev, { pid, _execEnabled: enabled }];
            });
        });

        // Subscribe to session removed
        const unsubRemoved = window.hwAPI?.onSynzSessionRemoved?.((pid) => {
            setSessions(prev => prev.filter(s => s.pid !== pid));
            // Drop it from the exclusion set too
            const key = String(pid);
            setExcluded(prev => {
                if (!prev.has(key)) return prev;
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        });

        return () => {
            try { unsubAdded?.(); } catch (_) {}
            try { unsubRemoved?.(); } catch (_) {}
        };
    }, []);

    const handleToggleExec = useCallback((pid, val) => {
        setSessions(prev => prev.map(s => s.pid === pid ? { ...s, _execEnabled: val } : s));
        publishSessionEnabled(pid, val);
    }, []);

    // Restore last active execution controls on remount so the UI always
    // reflects what will actually happen when executing
    useEffect(() => {
        const snap = getExecutionSnapshot();
        if (snap.hydrated) {
            setExecuteAll(snap.executeAll);
            setExcluded(new Set(snap.excludedPids));
        }
    }, []);

    // Keep the execution target service in sync with the page controls
    useEffect(() => {
        publishExecutionSnapshot({
            executeAll,
            excludedPids: Array.from(excluded),
            sessions,
        });
    }, [executeAll, excluded, sessions]);

    const toggleExcluded = useCallback((pid) => {
        const key = String(pid);
        setExcluded(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const filterLabel = excluded.size === 0
        ? i18n.t('clients-filter-all', 'All sessions')
        : i18n.t('clients-filter-except', 'All except {n}').replace('{n}', String(excluded.size));

    return (
        <div id="page-clients" className="page-clients page-container t-0 l-0 absolute flex h-full w-full flex-col overflow-y-auto">
            <div className="hw-multimenu flex h-full max-h-full w-full">

                {/* Left sidebar */}
                <div className="list z-10 flex flex-col border-r lg:w-1/5 select-none">
                    <div
                        className={`entry group flex items-center transition-colors cursor-pointer ${executeAll ? 'select' : ''}`}
                        onClick={() => setExecuteAll(v => !v)}
                    >
                        <iconify-icon
                            icon="fluent:apps-list-detail-20-filled"
                            class={`flex items-center justify-center text-xl transition-opacity group-hover:opacity-100 ${executeAll ? 'opacity-100' : 'opacity-50'}`}
                        />
                        <div className={`caption hidden transition-opacity group-hover:opacity-100 lg:flex text-xs leading-tight ${executeAll ? 'opacity-100 font-semibold' : 'opacity-50'}`}>
                            {i18n.t('clients-exec-all', 'Execute for all sessions')}
                        </div>
                    </div>
                </div>

                {/* Main content */}
                <div className="flex h-full max-h-full grow flex-col">

                    {/* Controls bar */}
                    <div className="flex flex-shrink-0 items-center gap-3 px-3 py-2 border-b">

                        {/* Execute for all sessions */}
                        <div
                            className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                            onClick={() => setExecuteAll(v => !v)}
                        >
                            <Checkbox checked={executeAll} onChange={setExecuteAll} />
                            <div className="flex flex-col min-w-0">
                                <span className="caption text-xs lg:text-sm truncate">
                                    {i18n.t('clients-exec-all', 'Execute for all sessions')}
                                </span>
                                <span className="description text-xs opacity-50 truncate">
                                    {i18n.t('clients-exec-all-desc', 'When enabled, scripts execute on all connected sessions.')}
                                </span>
                            </div>
                        </div>

                        {/* Session filter multi-select: while "Execute for all
                            sessions" is on, deselect PIDs to exclude them from
                            execution. Disabled while it's off (then the
                            per-card checkboxes decide). */}
                        <div
                            ref={filterRef}
                            className={`hw-dropdown relative flex flex-col min-w-[9rem] flex-shrink-0 transition-opacity ${
                                filterOpen ? 'open' : ''
                            } ${!executeAll || sessions.length === 0 ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}
                        >
                            <div
                                className="selector flex items-center rounded-md px-2 py-1 border cursor-pointer select-none"
                                onClick={(e) => { e.stopPropagation(); setFilterOpen(v => !v); }}
                            >
                                <span className="dropdown-entry p-0.5 truncate text-xs">
                                    {i18n.t('clients-filter-session', 'Filter session')}: {filterLabel}
                                </span>
                                <iconify-icon
                                    icon="heroicons:chevron-down"
                                    class={`flex items-center justify-center ml-1 text-xs transition-transform ${filterOpen ? 'rotate-180' : ''}`}
                                />
                            </div>
                            <div className={`list z-50 flex-col absolute top-[calc(100%_+_0.25rem)] max-h-[50vh] overflow-y-auto w-full rounded-md border ${filterOpen ? 'flex' : 'hidden'}`}>
                                <div
                                    className={`cursor-pointer opacity-70 hover:opacity-100 ${excluded.size === 0 ? 'highlight' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); setExcluded(new Set()); setFilterOpen(false); }}
                                >
                                    <div className="dropdown-entry p-1 text-xs">
                                        {i18n.t('clients-filter-all', 'All sessions')}
                                    </div>
                                </div>
                                {sessions.map(session => (
                                    <div
                                        key={session.pid}
                                        className="cursor-pointer opacity-70 hover:opacity-100 flex items-center justify-between"
                                        onClick={(e) => { e.stopPropagation(); toggleExcluded(session.pid); }}
                                    >
                                        <div className="dropdown-entry p-1 text-xs">PID {session.pid}</div>
                                        <div className="pr-1 flex items-center">
                                            <Checkbox
                                                checked={!excluded.has(String(session.pid))}
                                                onChange={() => toggleExcluded(session.pid)}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Session cards or Centered Empty State */}
                    <div className="pages flex flex-1 grow h-full flex-col overflow-y-auto">
                        {sessions.length === 0 ? (
                            <div className="flex flex-1 grow h-full w-full flex-col items-center justify-center gap-3 opacity-40 select-none text-center m-auto p-4">
                                <iconify-icon
                                    icon="fluent:apps-list-detail-20-filled"
                                    width="64"
                                    height="64"
                                    style={{ fontSize: '64px', width: '64px', height: '64px' }}
                                    class="flex items-center justify-center"
                                />
                                <span className="text-base font-medium" style={{ fontSize: '1rem', marginTop: '0.25rem' }}>
                                    {i18n.t('clients-no-clients', 'No Clients Connected.')}
                                </span>
                            </div>
                        ) : (
                            <div
                                className="flex flex-col gap-2"
                                style={{ padding: '0.75rem', paddingTop: '0.9rem' }}
                            >
                                {sessions.map(session => (
                                    <ClientCard
                                        key={session.pid}
                                        session={session}
                                        executeAll={executeAll}
                                        excluded={excluded}
                                        onToggleExec={handleToggleExec}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
