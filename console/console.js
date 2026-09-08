/**
 * console.js
 * Console window controller:
 *   - Window minimization / maximization / close controls
 *   - Live log receiver from IPC (console:message)
 *   - Search filtering
 *   - Copy logs to clipboard
 *   - Clear logs
 *   - Autoscroll toggle
 *   - Dynamic theme loading synchronization
 */

(function () {
    const logs = [];
    let autoscroll = true;
    let searchQuery = '';
    let sessionPids = [];      // live session PIDs (strings)
    let selectedSession = 'all'; // 'all' | PID string

    const contentsEl = document.getElementById('console-contents');
    const searchInput = document.getElementById('console-search-input');
    const autoscrollToggle = document.getElementById('console-autoscroll-toggle');
    const copyBtn = document.getElementById('btn-console-copy');
    const clearBtn = document.getElementById('btn-console-clear');

    function formatTime(d = new Date()) {
        return d.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        });
    }

    function normalizeLevel(level) {
        const l = String(level || 'print').toLowerCase();
        if (l === 'warn') return 'warning';
        if (l === 'err') return 'error';
        if (l === 'log' || l === 'output') return 'print';
        return l;
    }

    // ── Session filter helpers ────────────────────────────────────────────────
    const PID_PREFIX_RE = /^\[PID \d+\] /;

    function logPid(log) {
        if (log && log.pid !== undefined && log.pid !== null) return String(log.pid);
        const m = /^\[PID (\d+)\]/.exec(String(log && log.text || ''));
        return m ? m[1] : null;
    }

    function matchesSessionFilter(log) {
        if (selectedSession === 'all') return true;
        return logPid(log) === selectedSession;
    }

    // When a specific session is selected its logs lose the "[PID x] " prefix
    function displayText(log) {
        const text = String((log && log.text) || '');
        if (selectedSession === 'all') return text;
        return text.replace(PID_PREFIX_RE, '');
    }

    function isVisible(log) {
        if (!matchesSessionFilter(log)) return false;
        const q = searchQuery.trim().toLowerCase();
        if (!q) return true;
        return displayText(log).toLowerCase().includes(q) || String(log.time || '').toLowerCase().includes(q);
    }

    function getVisibleLogs() {
        return logs.filter(isVisible);
    }

    // ── Window Controls ───────────────────────────────────────────────────────
    const maxBtn = document.getElementById('ban_control_maximize');
    const restoreBtn = document.getElementById('ban_control_restore');

    function updateMaxState() {
        const isMax = window.hwAPI?.isMaximized?.();
        if (isMax) {
            if (maxBtn) maxBtn.style.display = 'none';
            if (restoreBtn) restoreBtn.style.display = 'flex';
        } else {
            if (maxBtn) maxBtn.style.display = 'flex';
            if (restoreBtn) restoreBtn.style.display = 'none';
        }
    }

    document.getElementById('ban_control_minimize')?.addEventListener('click', () => {
        window.hwAPI?.minimize();
    });

    maxBtn?.addEventListener('click', () => {
        window.hwAPI?.maximize();
        setTimeout(updateMaxState, 60);
    });

    restoreBtn?.addEventListener('click', () => {
        window.hwAPI?.maximize();
        setTimeout(updateMaxState, 60);
    });

    document.getElementById('ban_control_close')?.addEventListener('click', () => {
        window.hwAPI?.close();
    });

    const LEVEL_ICONS = {
        info: 'bx:info-circle',
        information: 'bx:info-circle',
        warning: 'bx:alert-triangle',
        warn: 'bx:alert-triangle',
        error: 'bx:alert-circle',
        print: null
    };

    const LEVEL_COLORS = {
        info: '#38bdf8',
        information: '#38bdf8',
        warning: '#fbbf24',
        warn: '#fbbf24',
        error: '#f87171',
        print: 'inherit'
    };

    function createLineElement(log) {
        const line = document.createElement('div');
        const level = log.level || 'print';
        line.className = `console-line level-${level}`;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'timestamp';
        timeSpan.textContent = `[${log.time || formatTime()}]`;
        line.appendChild(timeSpan);

        const iconName = LEVEL_ICONS[level];
        if (iconName) {
            const iconEl = document.createElement('iconify-icon');
            iconEl.setAttribute('icon', iconName);
            iconEl.className = 'console-msg-icon';
            iconEl.style.color = LEVEL_COLORS[level] || 'inherit';
            line.appendChild(iconEl);
        }

        const textSpan = document.createElement('span');
        textSpan.className = 'text';
        textSpan.textContent = displayText(log);
        line.appendChild(textSpan);

        return line;
    }

    // ── Log Rendering ─────────────────────────────────────────────────────────
    function renderLogs() {
        if (!contentsEl) return;
        contentsEl.innerHTML = '';

        getVisibleLogs().forEach(log => {
            contentsEl.appendChild(createLineElement(log));
        });

        if (autoscroll) {
            contentsEl.scrollTop = contentsEl.scrollHeight;
        }
    }

    function normalizeLog(log) {
        if (!log || typeof log !== 'object') {
            log = { level: 'print', text: String(log), time: formatTime() };
        }
        if (!log.time) log.time = formatTime();
        log.level = normalizeLevel(log.level);
        return log;
    }

    function appendLog(log) {
        appendLogs([log], true);
    }

    // Bulk append (log history replay): one render for the whole batch —
    // per-message full re-renders froze the window with a large buffer.
    function appendLogs(list, incremental) {
        const incoming = (Array.isArray(list) ? list : [list]).map(normalizeLog);
        if (!incoming.length) return;

        logs.push(...incoming);

        // Enforce maximum log preservation limit from setting
        const maxPreserve = parseInt(localStorage.getItem('synapse_setting_max_log_count') || '720', 10);
        if (logs.length > maxPreserve) {
            logs.splice(0, logs.length - maxPreserve);
            renderLogs();
            return;
        }

        if (incremental) {
            const log = incoming[incoming.length - 1];
            if (isVisible(log)) {
                contentsEl.appendChild(createLineElement(log));

                if (autoscroll) {
                    contentsEl.scrollTop = contentsEl.scrollHeight;
                }
            }
        } else {
            renderLogs();
        }
    }

    // ── Actions ───────────────────────────────────────────────────────────────
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const textToCopy = getVisibleLogs().map(l => `[${l.time}] ${displayText(l)}`).join('\n');
            if (!textToCopy) return;

            try {
                await navigator.clipboard.writeText(textToCopy);
                const originalHtml = copyBtn.innerHTML;
                copyBtn.innerHTML = '<iconify-icon icon="fluent:checkmark-20-filled" class="flex items-center justify-center"></iconify-icon> Copied!';
                setTimeout(() => { copyBtn.innerHTML = originalHtml; }, 1500);
            } catch (_) {}
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (selectedSession === 'all') {
                // "All Sections": wipe everything, including the main-process buffer
                logs.length = 0;
                window.hwAPI?.clearConsoleLogs?.();
            } else {
                // Specific session: clear only that session's logs
                for (let i = logs.length - 1; i >= 0; i--) {
                    if (logPid(logs[i]) === selectedSession) logs.splice(i, 1);
                }
                window.hwAPI?.clearConsoleLogs?.(selectedSession);
            }
            renderLogs();
        });
    }

    /*
    const testBtn = document.getElementById('btn-console-test');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            const time = formatTime();
            appendLog({ level: 'print', text: 'Hello from Lua print() output [Print test]', time });
            appendLog({ level: 'info', text: 'Script initialized successfully [Info test]', time });
            appendLog({ level: 'warning', text: 'Deprecated function call detected at line 14 [Warning test]', time });
            appendLog({ level: 'error', text: 'Workspace script runtime error: attempt to index nil with \'Character\' [Error test]', time });
        });
    }

    window.testConsole = function (level = 'info', text = 'Sample console message') {
        appendLog({ level, text, time: formatTime() });
    };
    */

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderLogs();
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                searchQuery = '';
                renderLogs();
                searchInput.blur();
            }
        });
    }

    function setAutoscroll(enabled) {
        autoscroll = !!enabled;
        if (autoscrollToggle) {
            const icon = autoscrollToggle.querySelector('.icon');
            if (autoscroll) {
                autoscrollToggle.classList.add('on');
                if (icon) {
                    icon.classList.remove('translate-x-1');
                    icon.classList.add('translate-x-5');
                }
            } else {
                autoscrollToggle.classList.remove('on');
                if (icon) {
                    icon.classList.remove('translate-x-5');
                    icon.classList.add('translate-x-1');
                }
            }
        }
    }

    if (autoscrollToggle) {
        autoscrollToggle.addEventListener('click', () => {
            setAutoscroll(!autoscroll);
        });
    }

    document.getElementById('label-autoscroll')?.addEventListener('click', () => {
        setAutoscroll(!autoscroll);
    });

    // ── Theme Sync ────────────────────────────────────────────────────────────
    async function syncTheme() {
        let activeTheme = 'hollywood-dark';
        try {
            activeTheme = (await window.hwAPI?.getSetting?.('theme')) ||
                localStorage.getItem('synapse_setting_theme') ||
                localStorage.getItem('synapse_active_theme') ||
                'hollywood-dark';
        } catch (_) {}

        const themeStyleLink = document.getElementById('theme-style');
        if (!themeStyleLink) return;

        try {
            const meta = await window.hwAPI?.loadTheme?.(activeTheme);
            if (meta && meta.cssPath) {
                const formatted = meta.cssPath.replace(/\\/g, '/');
                themeStyleLink.href = formatted.includes(':') && !formatted.startsWith('file:')
                    ? 'file:///' + formatted
                    : formatted;
            } else {
                themeStyleLink.href = `../assets/styles/prebuilt/_prebuilt-${activeTheme}.css`;
            }
        } catch (_) {
            themeStyleLink.href = `../assets/styles/prebuilt/_prebuilt-${activeTheme}.css`;
        }
    }

    syncTheme();
    window.hwAPI?.onThemesChanged?.(() => {
        syncTheme();
    });

    // ── Session Filter Dropdown ───────────────────────────────────────────────
    const sessionSelector = document.getElementById('console-session-selector');
    const sessionListEl = document.getElementById('console-session-list');
    const sessionLabel = document.getElementById('console-session-selected-label');
    const sessionChevron = document.getElementById('console-session-chevron');
    let sessionDropdownOpen = false;

    function updateSessionLabel() {
        if (!sessionLabel) return;
        sessionLabel.textContent = selectedSession === 'all' ? 'All Sections' : `PID ${selectedSession}`;
    }

    function setSessionDropdownOpen(open) {
        sessionDropdownOpen = !!open;
        if (sessionListEl) sessionListEl.classList.toggle('open', sessionDropdownOpen);
        if (sessionChevron) sessionChevron.classList.toggle('rotate-180', sessionDropdownOpen);
    }

    function renderSessionOptions() {
        if (!sessionListEl) return;
        sessionListEl.innerHTML = '';

        const options = [
            { id: 'all', label: 'All Sections' },
            ...sessionPids.map(p => ({ id: p, label: `PID ${p}` })),
        ];

        if (sessionPids.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'entry console-session-empty';
            empty.textContent = 'No sessions connected';
            empty.style.opacity = '0.4';
            empty.style.cursor = 'default';
            sessionListEl.appendChild(empty);
        }

        for (const opt of options) {
            const item = document.createElement('div');
            item.className = 'entry' + (selectedSession === opt.id ? ' highlight' : '');
            item.textContent = opt.label;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedSession = opt.id;
                setSessionDropdownOpen(false);
                updateSessionLabel();
                renderLogs();
            });
            sessionListEl.appendChild(item);
        }

        updateSessionLabel();
    }

    if (sessionSelector) {
        sessionSelector.addEventListener('click', (e) => {
            e.stopPropagation();
            setSessionDropdownOpen(!sessionDropdownOpen);
        });
    }

    // Close the dropdown on any outside click
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('console-session-dropdown');
        if (sessionDropdownOpen && dropdown && !dropdown.contains(e.target)) {
            setSessionDropdownOpen(false);
        }
    });

    function setSessionPids(pids) {
        sessionPids = (Array.isArray(pids) ? pids : []).map(String).filter(p => p !== '');
        // Selected session vanished → back to All Sections
        if (selectedSession !== 'all' && !sessionPids.includes(selectedSession)) {
            selectedSession = 'all';
            renderLogs();
        }
        renderSessionOptions();
    }

    // Live session list (initial fetch + add/remove events)
    window.hwAPI?.getSynzSessions?.().then(setSessionPids).catch(() => {});
    window.hwAPI?.onSynzSessionAdded?.((pid) => {
        const key = String(pid);
        if (key && !sessionPids.includes(key)) sessionPids.push(key);
        renderSessionOptions();
    });
    window.hwAPI?.onSynzSessionRemoved?.((pid) => {
        const key = String(pid);
        sessionPids = sessionPids.filter(p => p !== key);
        if (selectedSession === key) {
            selectedSession = 'all';
            renderLogs();
        }
        renderSessionOptions();
    });

    // ── Incoming Logs IPC Listener ────────────────────────────────────────────
    window.hwAPI?.onConsoleMessage?.((msg) => {
        appendLog(msg);
    });

    // Log history replay (single batched message)
    window.hwAPI?.onConsoleMessageBatch?.((msgs) => {
        appendLogs(msgs, false);
    });

    // Request logs that were dispatched before this window opened
    window.hwAPI?.flushConsoleLogs?.();
})();
