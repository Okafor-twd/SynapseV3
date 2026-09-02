/**
 * editor.js
 * Monaco Editor setup, tab management, and action bar logic.
 * Each tab owns its own Monaco model; unsaved tabs get the
 * fluent:text-asterisk-20-filled icon and warn on close.
 */

let monacoEditor = null;
let tabIdCounter = 0;
let tabs = [];        // { id, title, model, savedValue }
let activeTabId = null;

// ── Monaco ──────────────────────────────────────────────────────────────────

function initMonaco() {
    self.MonacoEnvironment = {
        getWorkerUrl: function(_moduleId, _label) {
            return './editor.worker.bundle.js';
        }
    };

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.39.0/min/vs/loader.js';
    script.onload = () => {
        require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.39.0/min/vs' } });
        require(['vs/editor/editor.main'], () => {
            const container = document.getElementById('monaco-editor');
            if (!container) return;

            const savedFontSize = parseInt(localStorage.getItem('synapse_setting_fontsize') || '16', 10);
            const savedWordWrap = localStorage.getItem('synapse_setting_word_wrap') === 'true' ? 'on' : 'off';
            const savedSmoothMovement = localStorage.getItem('synapse_setting_smooth_movement') !== 'false';
            const savedSmoothCursor = localStorage.getItem('synapse_setting_smooth_cursor') !== 'false' ? 'on' : 'off';
            const savedTabLength = parseInt(localStorage.getItem('synapse_setting_tab_length') || '4', 10);
            const savedMinimap = parseInt(localStorage.getItem('synapse_setting_minimap') || '1', 10);
            const minimapConfig = savedMinimap === 0 ? { enabled: false } : { enabled: true, side: savedMinimap === 2 ? 'left' : 'right' };

            monacoEditor = monaco.editor.create(container, {
                model: null,
                theme: 'vs-dark', // replaced by hw-<themeId> from editor-themes.js
                fontSize: savedFontSize,
                tabSize: savedTabLength,
                indentSize: savedTabLength,
                fontFamily: 'Consolas, "Courier New", monospace',
                fontLigatures: false, // matches the original: "liga" 0, "calt" 0
                lineHeight: Math.round(savedFontSize * 1.375),
                minimap: minimapConfig,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                scrollbar: {
                    vertical: 'auto',
                    horizontal: 'auto',
                    verticalScrollbarSize: 10,
                    horizontalScrollbarSize: 10,
                    verticalSliderSize: 6,
                    horizontalSliderSize: 6,
                    useShadows: false
                },
                wordWrap: savedWordWrap,
                smoothScrolling: savedSmoothMovement,
                cursorSmoothCaretAnimation: savedSmoothCursor,
                semanticHighlighting: true,
                contextmenu: false,
                renderLineHighlight: 'all',
                hideCursorInOverviewRuler: true,
                wordBasedSuggestions: false,
                mouseWheelZoom: true,
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnEnter: 'on',
                tabCompletion: 'on',
                quickSuggestions: {
                    other: true,
                    comments: false,
                    strings: true
                },
                suggest: {
                    showWords: false,
                    showFunctions: true,
                    showMethods: true,
                    showVariables: true,
                    showKeywords: true,
                    showSnippets: true,
                    showClasses: true,
                    showModules: true,
                    showInterfaces: true,
                    showProperties: true,
                    showEvents: true,
                    showOperators: true,
                    showUnits: true,
                    showValues: true,
                    showConstants: true,
                    showEnums: true,
                    showEnumMembers: true,
                    showStructs: true,
                    showTypeParameters: true,
                    showFields: true,
                    snippetsPreventQuickSuggestions: false
                }
            });

            monaco.languages.register({ id: 'lua' });

            monaco.languages.setLanguageConfiguration('lua', {
                comments: {
                    lineComment: '--',
                    blockComment: ['--[[', ']]']
                },
                brackets: [
                    ['{', '}'],
                    ['[', ']'],
                    ['(', ')']
                ],
                autoClosingPairs: [
                    { open: '{', close: '}' },
                    { open: '[', close: ']' },
                    { open: '(', close: ')' },
                    { open: '"', close: '"', notIn: ['string'] },
                    { open: "'", close: "'", notIn: ['string', 'comment'] }
                ],
                surroundingPairs: [
                    { open: '{', close: '}' },
                    { open: '[', close: ']' },
                    { open: '(', close: ')' },
                    { open: '"', close: '"' },
                    { open: "'", close: "'" }
                ],
                indentationRules: {
                    increaseIndentPattern: /^((?! \-\-).)*((\b(else|function|then|do|repeat)\b((?! \b(end|until)\b).)*)|(\{\s*))$/,
                    decreaseIndentPattern: /^\s*((\b(elseif|else|end|until)\b)|(\}\s*))\s*$/
                }
            });

            monaco.languages.setMonarchTokensProvider('lua', {
                defaultToken: '',
                tokenPostfix: '.lua',
                keywords: [
                    'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for',
                    'function', 'goto', 'if', 'in', 'local', 'nil', 'not', 'or',
                    'repeat', 'return', 'then', 'true', 'until', 'while', 'continue'
                ],
                globals: [
                    'game', 'workspace', 'script', 'Enum', 'Vector3', 'Vector2', 'CFrame',
                    'Color3', 'UDim', 'UDim2', 'Instance', 'TweenInfo', 'BrickColor', 'Ray',
                    'Random', 'NumberSequence', 'ColorSequence', 'NumberRange', 'Rect',
                    'PhysicalProperties', 'task', 'utf8', 'bit32', 'math', 'table', 'string',
                    'os', 'debug', 'coroutine', '_G', '_VERSION', 'shared'
                ],
                synapse: [
                    'syn', 'synapse', 'getgenv', 'getrenv', 'getreg', 'getgc', 'filtergc',
                    'getinstances', 'getnilinstances', 'getscripts', 'getloadedmodules',
                    'fireclickdetector', 'fireproximityprompt', 'firetouchinterest',
                    'getrawmetatable', 'setrawmetatable', 'setreadonly', 'isreadonly',
                    'isnetworkowner', 'iswindowactive', 'keypress', 'keyrelease', 'keyclick',
                    'mouse1press', 'mouse1release', 'mouse1click', 'mouse2press', 'mouse2release',
                    'mouse2click', 'mousescroll', 'mousemoverel', 'mousemoveabs', 'iskeydown',
                    'iskeytoggled', 'setclipboard', 'identifyexecutor', 'messagebox',
                    'setwindowtitle', 'setwindowicon', 'hookfunction', 'hookmetamethod',
                    'newcclosure', 'checkcaller', 'clonefunction', 'isourclosure',
                    'getnamecallmethod', 'setnamecallmethod', 'restorefunction'
                ],
                builtins: [
                    'assert', 'collectgarbage', 'error', 'getfenv', 'getmetatable', 'ipairs',
                    'load', 'loadfile', 'loadstring', 'module', 'next', 'pairs', 'pcall',
                    'print', 'rawequal', 'rawget', 'rawlen', 'rawset', 'require', 'select',
                    'setfenv', 'setmetatable', 'tonumber', 'tostring', 'type', 'unpack',
                    'xpcall', 'warn', 'tick', 'wait', 'spawn', 'delay'
                ],
                brackets: [
                    { token: 'delimiter.bracket', open: '{', close: '}' },
                    { token: 'delimiter.array', open: '[', close: ']' },
                    { token: 'delimiter.parenthesis', open: '(', close: ')' }
                ],
                operators: [
                    '+', '-', '*', '/', '%', '^', '#', '==', '~=', '<=', '>=', '<', '>', '=',
                    ';', ':', ',', '.', '..', '...'
                ],
                symbols: /[=><!~?:&|+\-*\/\^%#]+/,
                escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,2}|[0-9]{1,3})/,

                tokenizer: {
                    root: [
                        // Function definitions: function myFunction()
                        [/(function)(\s+)([a-zA-Z_]\w*)/, ['keyword.function', '', 'entity.name.function']],

                        // Method invocations: :GetService, :FindFirstChild
                        [/(:)([a-zA-Z_]\w*)/, ['delimiter', 'entity.name.function']],

                        // Function invocations: myFunc(...)
                        [/([a-zA-Z_]\w*)(\s*)(\()/, [
                            {
                                cases: {
                                    '@keywords': 'keyword.$1',
                                    '@globals': 'type.$1',
                                    '@synapse': 'keyword.synapse.$1',
                                    '@builtins': 'predefined.$1',
                                    '@default': 'entity.name.function'
                                }
                            },
                            '',
                            '@brackets'
                        ]],

                        // Identifiers and keywords
                        [/[a-zA-Z_]\w*/, {
                            cases: {
                                '@keywords': { token: 'keyword.$0' },
                                '@globals': { token: 'type.$0' },
                                '@synapse': { token: 'keyword.synapse.$0' },
                                '@builtins': { token: 'predefined.$0' },
                                '@default': 'identifier'
                            }
                        }],
                        { include: '@whitespace' },
                        [/[{}()\[\]]/, '@brackets'],
                        [/@symbols/, {
                            cases: {
                                '@operators': 'operator',
                                '@default': ''
                            }
                        }],
                        [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
                        [/0[xX][0-9a-fA-F]+/, 'number.hex'],
                        [/\d+/, 'number'],
                        [/[;,.]/, 'delimiter'],
                        [/"([^"\\]|\\.)*$/, 'string.invalid'],
                        [/'([^'\\]|\\.)*$/, 'string.invalid'],
                        [/"/, 'string', '@string_double'],
                        [/'/, 'string', '@string_single'],
                        [/\[=*\[/, 'string', '@string_block']
                    ],
                    whitespace: [
                        [/[ \t\r\n]+/, ''],
                        [/--\[=*\[/, 'comment', '@comment_block'],
                        [/--.*$/, 'comment']
                    ],
                    comment_block: [
                        [/[^\]]+/, 'comment'],
                        [/\]=*\]/, 'comment', '@pop'],
                        [/./, 'comment']
                    ],
                    string_block: [
                        [/[^\]]+/, 'string'],
                        [/\]=*\]/, 'string', '@pop'],
                        [/./, 'string']
                    ],
                    string_double: [
                        [/[^\\"]+/, 'string'],
                        [/@escapes/, 'string.escape'],
                        [/\\./, 'string.escape.invalid'],
                        [/"/, 'string', '@pop']
                    ],
                    string_single: [
                        [/[^\\']+/, 'string'],
                        [/@escapes/, 'string.escape'],
                        [/\\./, 'string.escape.invalid'],
                        [/'/, 'string', '@pop']
                    ]
                }
            });

            monaco.languages.registerDocumentFormattingEditProvider('lua', {
                provideDocumentFormattingEdits: (model) => {
                    const text = model.getValue();
                    const formatted = formatLuaCode(text);
                    return [{
                        range: model.getFullModelRange(),
                        text: formatted
                    }];
                }
            });

            // Replace pre-Monaco stub models with real ones, preserving content
            tabs.forEach(t => {
                if (t.model._value !== undefined) {
                    const content = t.model._value;
                    t.model = monaco.editor.createModel(content, 'lua');
                    attachTabListener(t);
                }
            });

            // Activate the initial tab now that Monaco exists
            if (tabs.length) attachModel(tabs[0].id);

            // LSP: sync existing + future models with the language server
            const notifyOpen = (m) => {
                if (typeof window.lspDidOpen === 'function') window.lspDidOpen(m);
                else if (typeof lspDidOpen === 'function') lspDidOpen(m);
            };
            const notifyClose = (m) => {
                if (typeof window.lspDidClose === 'function') window.lspDidClose(m);
                else if (typeof lspDidClose === 'function') lspDidClose(m);
            };
            tabs.forEach(t => notifyOpen(t.model));
            monaco.editor.onDidCreateModel(notifyOpen);
            monaco.editor.onWillDisposeModel(notifyClose);

            const savedTheme = localStorage.getItem('synapse_setting_theme') || (typeof currentThemeId !== 'undefined' ? currentThemeId : 'hollywood-dark');
            if (typeof applyEditorTheme === 'function') {
                applyEditorTheme(savedTheme);
            }

            document.addEventListener('theme:changed', (e) => {
                if (e.detail?.id && typeof applyEditorTheme === 'function') {
                    applyEditorTheme(e.detail.id);
                }
                renderTabs();
            });

            // ── Editor Zoom & Persistence ──
            const savedZoomLevel = parseFloat(localStorage.getItem('synapse_setting_editor_zoom_level'));
            if (!isNaN(savedZoomLevel) && monaco.editor.EditorZoom) {
                monaco.editor.EditorZoom.setZoomLevel(savedZoomLevel);
            }

            monaco.editor.EditorZoom?.onDidChangeZoomLevel?.((zoomLevel) => {
                localStorage.setItem('synapse_setting_editor_zoom_level', String(zoomLevel));
            });

            // Keyboard shortcuts for zooming (Ctrl+=, Ctrl+-, Ctrl+0, Numpad)
            const zoomIn = () => {
                const current = monaco.editor.EditorZoom ? monaco.editor.EditorZoom.getZoomLevel() : 0;
                monaco.editor.EditorZoom?.setZoomLevel(current + 1);
            };
            const zoomOut = () => {
                const current = monaco.editor.EditorZoom ? monaco.editor.EditorZoom.getZoomLevel() : 0;
                monaco.editor.EditorZoom?.setZoomLevel(current - 1);
            };
            const zoomReset = () => {
                monaco.editor.EditorZoom?.setZoomLevel(0);
            };

            monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, zoomIn);
            monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, zoomOut);
            monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0, zoomReset);
            monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Numpad0, zoomReset);
            monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.NumpadAdd, zoomIn);
            monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.NumpadSubtract, zoomOut);

            // Container-level wheel zoom listener (Ctrl + Wheel)
            container.addEventListener('wheel', (e) => {
                if (e.ctrlKey) {
                    e.preventDefault();
                    if (monaco.editor.EditorZoom) {
                        const current = monaco.editor.EditorZoom.getZoomLevel();
                        const next = e.deltaY < 0 ? current + 1 : current - 1;
                        monaco.editor.EditorZoom.setZoomLevel(next);
                    }
                }
            }, { passive: false });

            // ── Save Script (Ctrl + S) ──
            monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                saveActiveScript();
            });

            // ── Sync tabs from disk on startup ──
            syncTabsFromDisk();

            document.dispatchEvent(new Event('monaco:ready'));
        });
    };
    document.head.appendChild(script);
}

async function saveActiveScript() {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    const content = tab.model ? (typeof tab.model.getValue === 'function' ? tab.model.getValue() : tab.model._value || '') : (tab.savedValue || '');

    // Check if this tab is associated with a file on disk
    let targetPath = tab.filePath || (tab.isFile ? tab.title : null);
    if (!targetPath && tab.title && (tab.title.endsWith('.lua') || tab.title.endsWith('.luau') || tab.title.endsWith('.txt'))) {
        targetPath = tab.title;
    }

    if (targetPath) {
        let wroteToDisk = false;

        // 1. Direct write via Node fs if available in renderer
        if (typeof require !== 'undefined') {
            try {
                const fs = require('fs');
                const path = require('path');
                let fullPath = targetPath;
                if (!path.isAbsolute(fullPath)) {
                    fullPath = path.resolve('scripts', fullPath);
                }
                const pDir = path.dirname(fullPath);
                if (!fs.existsSync(pDir)) fs.mkdirSync(pDir, { recursive: true });
                fs.writeFileSync(fullPath, content, 'utf8');
                tab.filePath = fullPath;
                wroteToDisk = true;
            } catch (_) {}
        }

        // 2. Direct write via dedicated saveScript IPC (never opens dialog)
        if (!wroteToDisk && window.hwAPI?.saveScript) {
            try {
                const res = await window.hwAPI.saveScript(targetPath, content);
                if (res && (res.ok || res.filePath)) {
                    tab.filePath = res.filePath || targetPath;
                    wroteToDisk = true;
                }
            } catch (_) {}
        }

        tab.isFile = true;
        tab.savedValue = content;
        renderTabs();
        saveTabsToConfig();
        if (typeof notify === 'function') notify('Saved ' + tab.title);
        return; // NEVER fall through to save dialog for disk files!
    }

    // Only for brand new, unsaved tabs with no file association:
    const res = await window.hwAPI?.saveFile?.(content);
    if (res && res.name) {
        tab.title = res.name;
        tab.filePath = res.filePath || res.path || null;
        tab.isFile = true;
        tab.savedValue = content;
        renderTabs();
        saveTabsToConfig();
        if (typeof notify === 'function') notify('Saved ' + res.name);
    }
}
window.saveActiveScript = saveActiveScript;

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveActiveScript();
    }
});

async function syncTabsFromDisk() {
    let changed = false;
    for (const tab of tabs) {
        if (tab.filePath) {
            try {
                const res = await window.hwAPI?.readScript(tab.filePath);
                if (res && typeof res.content === 'string') {
                    const diskContent = res.content;
                    const currentModelVal = tab.model ? (typeof tab.model.getValue === 'function' ? tab.model.getValue() : tab.model._value || '') : (tab.savedValue || '');
                    const isDirty = currentModelVal.replace(/\r\n/g, '\n') !== (tab.savedValue || '').replace(/\r\n/g, '\n');

                    // If tab is clean (no unsaved edits), sync model to disk content
                    if (!isDirty) {
                        if (tab.model && typeof tab.model.setValue === 'function') {
                            tab.model.setValue(diskContent);
                        } else if (tab.model) {
                            tab.model._value = diskContent;
                        }
                    }
                    // Baseline savedValue is the actual disk content
                    tab.savedValue = diskContent;
                    tab.isFile = true;
                    changed = true;
                }
            } catch (_) {}
        }
    }
    if (changed) renderTabs();
}

function attachModel(tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab || !monacoEditor) return;
    monacoEditor.setModel(tab.model);
    monacoEditor.updateOptions({ readOnly: !!tab.readonly });
}

// The Execute button stays disabled until a client is attached (matching the
// original default state), so this only exists for parity; nothing enables it.
function syncExecuteState() {
    const btn = document.getElementById('execute-button');
    if (!btn) return;
    btn.setAttribute('disabled', 'true');
    btn.classList.add('disabled', 'pointer-events-none', 'opacity-50');
}

// Attach the per-tab change listener that flips the unsaved asterisk as soon
// as the text diverges from the last saved value, and syncs the LSP.
function attachTabListener(tab) {
    tab.model.onDidChangeContent?.(() => {
        if (typeof window.lspDidChange === 'function') window.lspDidChange(tab.model);
        else if (typeof lspDidChange === 'function') lspDidChange(tab.model);
        if (isTabUnsaved(tab) !== tab._renderedUnsaved) renderTabs();
        scheduleSaveTabs();
    });
}

// ── Tabs Persistence (config/tabs.json) ──────────────────────────────────────

let saveTabsDebounceTimer = null;
function scheduleSaveTabs() {
    clearTimeout(saveTabsDebounceTimer);
    saveTabsDebounceTimer = setTimeout(() => {
        saveTabsToConfig();
    }, 300);
}

function saveTabsToConfig() {
    try {
        const data = tabs.map((t, idx) => ({
            id: t.id,
            position: idx,
            title: t.title || 'Untitled tab',
            content: t.model ? (typeof t.model.getValue === 'function' ? t.model.getValue() : t.model._value || '') : (t.savedValue || ''),
            savedValue: t.savedValue !== undefined ? t.savedValue : (t.model ? (typeof t.model.getValue === 'function' ? t.model.getValue() : t.model._value || '') : ''),
            customIcon: t.customIcon || null,
            isFile: !!t.isFile,
            filePath: t.filePath || null,
            isBookmark: !!t.isBookmark,
            bookmarkUri: t.bookmarkUri || null,
            pinned: !!t.pinned,
            readonly: !!t.readonly,
            autoExecute: !!t.autoExecute
        }));

        const jsonStr = JSON.stringify(data, null, 2);
        try {
            localStorage.setItem('synapse_tabs', jsonStr);
        } catch (e) {}

        if (typeof require !== 'undefined') {
            try {
                const fs = require('fs');
                const path = require('path');
                const configDir = path.resolve('config');
                if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
                fs.writeFileSync(path.join(configDir, 'tabs.json'), jsonStr, 'utf8');
            } catch (e) {
                // Ignore node fs error if outside electron nodeIntegration
            }
        }
    } catch (err) {
        console.error('Error saving tabs to config/tabs.json:', err);
    }
}

function loadTabsFromConfig() {
    try {
        let rawData = null;
        if (typeof require !== 'undefined') {
            try {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.resolve('config/tabs.json');
                if (fs.existsSync(filePath)) {
                    rawData = fs.readFileSync(filePath, 'utf8');
                }
            } catch (e) {}
        }
        if (!rawData) {
            try {
                rawData = localStorage.getItem('synapse_tabs');
            } catch (e) {}
        }
        if (rawData) {
            const data = JSON.parse(rawData);
            if (Array.isArray(data) && data.length > 0) {
                data.sort((a, b) => (a.position !== undefined ? a.position : 0) - (b.position !== undefined ? b.position : 0));
                return data;
            }
        }
    } catch (err) {
        console.error('Error loading tabs from config/tabs.json:', err);
    }
    return null;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function createModel(content = '') {
    if (typeof monaco !== 'undefined' && monaco.editor) {
        return monaco.editor.createModel(content, 'lua');
    }
    // Fallback stub before Monaco loads (createModel/getValue/setValue only)
    return {
        _value: content,
        getValue() { return this._value; },
        setValue(v) { this._value = v; },
        onDidChangeContent(cb) { this._cb = cb; },
    };
}

function createTab(title = 'Untitled tab', content = null, animate = true) {
    if (content === null || content === undefined) {
        content = localStorage.getItem('synapse_setting_default_tab_content') ?? "print('Synapse winning!')";
    }
    const id = ++tabIdCounter;
    const model = createModel(content);
    const normalizedContent = (model && typeof model.getValue === 'function') ? model.getValue() : content;
    const tab = { id, title, model, savedValue: normalizedContent, _isNew: animate };
    attachTabListener(tab);
    tabs.push(tab);
    activeTabId = id;
    attachModel(id);
    renderTabs();
    saveTabsToConfig();
    return id;
}

function openFileInEditor(name, content, options = {}) {
    const isFile = options.isFile !== undefined ? options.isFile : (!!options.filePath);
    // If a tab with this exact title or filePath or bookmark URI already exists, switch to it without duplicating
    const existing = tabs.find(t => t.title === name || (options.filePath && t.filePath === options.filePath) || (options.bookmarkUri && t.bookmarkUri === options.bookmarkUri));
    if (existing) {
        if (options.customIcon) existing.customIcon = options.customIcon;
        if (isFile) existing.isFile = true;
        if (options.filePath) existing.filePath = options.filePath;
        if (options.isBookmark) existing.isBookmark = true;
        if (options.bookmarkUri) existing.bookmarkUri = options.bookmarkUri;
        switchTab(existing.id);
        renderTabs();
        return existing.id;
    }

    const id = ++tabIdCounter;
    const model = createModel(content);
    const normalizedContent = (model && typeof model.getValue === 'function') ? model.getValue() : (content || '');
    const tab = {
        id,
        title: name,
        model,
        savedValue: normalizedContent,
        _isNew: true,
        isFile: !!isFile,
        filePath: options.filePath || null,
        customIcon: options.customIcon || null,
        isBookmark: !!options.isBookmark,
        bookmarkUri: options.bookmarkUri || null,
        pinned: !!options.pinned,
        readonly: !!options.readonly
    };
    attachTabListener(tab);
    tabs.push(tab);
    activeTabId = id;
    attachModel(id);
    renderTabs();
    saveTabsToConfig();
    return id;
}

function loadUriIntoEditor(uri) {
    openFileInEditor(uri, `-- ${uri}\n`, { isBookmark: true, bookmarkUri: uri });
}

function isTabUnsaved(tab) {
    if (!tab || !tab.model) return false;
    const current = typeof tab.model.getValue === 'function' ? tab.model.getValue() : (tab.model._value || '');
    const saved = tab.savedValue !== undefined ? tab.savedValue : '';
    return current.replace(/\r\n/g, '\n') !== saved.replace(/\r\n/g, '\n');
}

function logUnsavedTabContent(title, content, reason = 'closed') {
    if (!content || !content.trim()) return;
    const msg = `[Editor: Unsaved ${reason}] Tab "${title || 'Untitled tab'}":\n${content}`;
    console.log(msg);
    try {
        const history = JSON.parse(localStorage.getItem('synapse_unsaved_tabs_history') || '[]');
        history.unshift({
            title: title || 'Untitled tab',
            content: content,
            reason: reason,
            timestamp: new Date().toISOString()
        });
        if (history.length > 50) history.length = 50;
        localStorage.setItem('synapse_unsaved_tabs_history', JSON.stringify(history));
    } catch (e) {}
}

async function closeTab(id) {
    const idx = tabs.findIndex(t => t.id === id);
    if (idx === -1) return;

    const tab = tabs[idx];
    const unsaved = isTabUnsaved(tab);
    const content = tab.model ? tab.model.getValue() : (tab.savedValue || '');

    const warnUnsaved = localStorage.getItem('synapse_setting_unsaved_warnings') !== 'false';
    if (warnUnsaved && unsaved) {
        const confirmed = await HWDialog.confirmEraseUnsaved();
        if (!confirmed) return;
    }

    if (unsaved && content) {
        logUnsavedTabContent(tab.title, content, 'closed');
    }

    tab.model.dispose?.();
    tabs.splice(idx, 1);
    saveTabsToConfig();

    if (activeTabId === id) {
        if (tabs.length > 0) {
            activeTabId = tabs[Math.max(0, idx - 1)].id;
            attachModel(activeTabId);
        } else {
            activeTabId = null;
            monacoEditor?.setModel(null);
            createTab();
            return;
        }
    }
    renderTabs();
}

function switchTab(id) {
    if (activeTabId === id) return;
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    activeTabId = id;
    attachModel(id);
    updateTabVisualStates();
}

function updateTabVisualStates() {
    const container = document.getElementById('editor-tabs');
    if (!container) return;
    tabs.forEach(tab => {
        const wrapper = container.querySelector(`[data-tab-wrapper-id="${tab.id}"]`);
        if (!wrapper) return;
        const tabEl = wrapper.querySelector('.hw-editor-tab');
        if (!tabEl) return;
        const isActive = tab.id === activeTabId;
        tabEl.classList.toggle('select', isActive);
        
        const colorspace = tabEl.querySelector('.colorspace');
        if (colorspace) {
            colorspace.classList.toggle('opacity-50', isActive);
            colorspace.classList.toggle('opacity-0', !isActive);
        }
        
        const content = tabEl.querySelector('.content');
        if (content) {
            content.classList.toggle('opacity-100', isActive);
            content.classList.toggle('opacity-50', !isActive);
        }
    });
}

let draggedTabId = null;
let isReordering = false;

function reorderTabs(fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx === -1 || toIdx === -1 || isReordering) return;
    const container = document.getElementById('editor-tabs');
    if (!container) return;

    isReordering = true;

    // Record previous positions of all tab wrappers for FLIP animation
    const wrappers = Array.from(container.children);
    const prevRects = new Map();
    wrappers.forEach(w => {
        const id = w.getAttribute('data-tab-wrapper-id');
        if (id) prevRects.set(id, w.getBoundingClientRect());
    });

    // Reorder in memory
    const [moved] = tabs.splice(fromIdx, 1);
    tabs.splice(toIdx, 0, moved);

    // Reorder DOM node
    const movedNode = wrappers[fromIdx];
    const targetNode = wrappers[toIdx];
    if (toIdx > fromIdx) {
        container.insertBefore(movedNode, targetNode.nextSibling);
    } else {
        container.insertBefore(movedNode, targetNode);
    }

    // Animate smooth sliding using FLIP
    Array.from(container.children).forEach(w => {
        const id = w.getAttribute('data-tab-wrapper-id');
        const prev = prevRects.get(id);
        if (prev) {
            const current = w.getBoundingClientRect();
            const deltaX = prev.left - current.left;
            if (deltaX !== 0) {
                w.style.transition = 'none';
                w.style.transform = `translateX(${deltaX}px)`;
                void w.offsetWidth; // force reflow
                requestAnimationFrame(() => {
                    w.style.transition = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';
                    w.style.transform = '';
                });
            }
        }
    });

    setTimeout(() => {
        isReordering = false;
        saveTabsToConfig();
    }, 120);
}

function renderTabs() {
    const container = document.getElementById('editor-tabs');
    if (!container) return;
    container.innerHTML = '';

    tabs.forEach(tab => {
        const isActive = tab.id === activeTabId;
        const unsaved = isTabUnsaved(tab);
        tab._renderedUnsaved = unsaved;

        const wrapper = document.createElement('div');
        wrapper.className = 'hw-editor-tab-wrapper' + (tab._isNew ? ' new-tab-anim' : '');
        wrapper.setAttribute('data-tab-wrapper-id', String(tab.id));
        delete tab._isNew;

        const tabEl = document.createElement('div');
        tabEl.draggable = true;
        tabEl.className = `hw-editor-tab group relative flex min-w-[10rem] max-w-xs flex-col border-r p-0.5 ${isActive ? 'select' : ''}`;

        const unsavedIconName = (typeof window.getThemeIcon === 'function') ? window.getThemeIcon('asterisk', 'fluent:text-asterisk-20-filled') : 'fluent:text-asterisk-20-filled';
        const closeIconName = (typeof window.getThemeIcon === 'function') ? window.getThemeIcon('cross', 'fluent:dismiss-20-filled') : 'fluent:dismiss-20-filled';
        const fileIconName = (typeof window.getThemeIcon === 'function') ? window.getThemeIcon('file', 'fluent:document-20-filled') : 'fluent:document-20-filled';

        const unsavedIcon = unsaved ? `<iconify-icon icon="${unsavedIconName}" class="flex items-center justify-center undefined"></iconify-icon>` : '';
        const pinIcon = tab.pinned ? '<iconify-icon icon="fluent:pin-12-filled" class="flex items-center justify-center undefined"></iconify-icon>' : '';
        const readonlyIcon = tab.readonly ? '<iconify-icon icon="fluent:lock-20-filled" class="flex items-center justify-center undefined"></iconify-icon>' : '';

        // Custom set icon (e.g. Star, Lightbulb, Turbo, Commands, Beaker, Shield, Chess, Swords, Rabbit)
        const userCustomIcon = (tab.customIcon && tab.customIcon !== 'fluent:bookmark-20-filled')
            ? `<iconify-icon icon="${tab.customIcon}" class="flex items-center justify-center undefined"></iconify-icon>`
            : '';

        // Bookmark icon (if opened from a bookmark)
        const isBookmarkTab = !!(tab.isBookmark || tab.bookmarkUri || tab.customIcon === 'fluent:bookmark-20-filled');
        const bookmarkIcon = isBookmarkTab
            ? '<iconify-icon icon="fluent:bookmark-20-filled" class="flex items-center justify-center undefined"></iconify-icon>'
            : '';

        // File icon (if opened from a local file and not a bookmark)
        const fileIcon = ((tab.isFile || tab.filePath) && !isBookmarkTab)
            ? `<iconify-icon icon="${fileIconName}" class="flex items-center justify-center undefined"></iconify-icon>`
            : '';

        // Base icon (omega is always present)
        const baseIcon = '<iconify-icon icon="mdi:omega" class="flex items-center justify-center undefined"></iconify-icon>';

        const closeBtnHtml = tab.pinned ? '' : `
                <div class="close ml-auto flex h-full items-center justify-center rounded transition hover:bg-white/10 active:opacity-50" data-tab-id="${tab.id}">
                    <iconify-icon icon="${closeIconName}" class="flex items-center justify-center"></iconify-icon>
                </div>`;

        tabEl.innerHTML = `
            <div class="colorspace absolute top-0 flex h-full w-full ${isActive ? 'opacity-50' : 'opacity-0'}"></div>
            <div class="content z-10 flex items-center p-1 ${isActive ? 'opacity-100' : 'opacity-50'}">
                <div class="icons mr-2 flex gap-1">${unsavedIcon}${pinIcon}${readonlyIcon}${bookmarkIcon}${fileIcon}${baseIcon}${userCustomIcon}</div>
                <div class="caption overflow-hidden overflow-ellipsis whitespace-nowrap text-sm">${tab.title}</div>
                ${closeBtnHtml}
            </div>`;

        tabEl.addEventListener('click', (e) => {
            if (!e.target.closest('.close')) switchTab(tab.id);
        });

        tabEl.addEventListener('dblclick', (e) => {
            if (e.target.closest('.close')) return;
            e.preventDefault();
            openTabContextMenu(tab.id, e.clientX, e.clientY);
        });

        tabEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openTabContextMenu(tab.id, e.clientX, e.clientY);
        });

        const closeBtn = tabEl.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeTab(tab.id);
            });
        }

        // Smooth Drag & Drop Tab Reordering
        tabEl.addEventListener('dragstart', (e) => {
            if (e.target.closest('.close')) {
                e.preventDefault();
                return;
            }
            draggedTabId = tab.id;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(tab.id));
            setTimeout(() => {
                tabEl.style.opacity = '0.4';
            }, 0);
        });

        tabEl.addEventListener('dragend', () => {
            draggedTabId = null;
            tabEl.style.opacity = '';
        });

        tabEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (!draggedTabId || draggedTabId === tab.id || isReordering) return;

            const fromIdx = tabs.findIndex(t => t.id === draggedTabId);
            const toIdx = tabs.findIndex(t => t.id === tab.id);
            if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

            const rect = tabEl.getBoundingClientRect();
            const mouseX = e.clientX;
            const threshold = rect.width * 0.25;

            // Trigger swap as soon as cursor enters 25% into the target tab
            if (fromIdx < toIdx && mouseX < rect.left + threshold) return;
            if (fromIdx > toIdx && mouseX > rect.right - threshold) return;

            reorderTabs(fromIdx, toIdx);
        });

        wrapper.appendChild(tabEl);
        container.appendChild(wrapper);
    });
}

// ── Tab Context Menu ─────────────────────────────────────────────────────────

let activeContextMenu = null;

function closeTabContextMenu() {
    if (activeContextMenu) {
        activeContextMenu.remove();
        activeContextMenu = null;
    }
}

document.addEventListener('click', (e) => {
    if (activeContextMenu && !activeContextMenu.contains(e.target)) {
        closeTabContextMenu();
    }
});

document.addEventListener('contextmenu', (e) => {
    if (activeContextMenu && !activeContextMenu.contains(e.target) && !e.target.closest('.hw-editor-tab')) {
        closeTabContextMenu();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeTabContextMenu();
    }
});

function openTabContextMenu(tabId, clientX, clientY) {
    closeTabContextMenu();

    const appEl = document.getElementById('application') || document.body;
    const appRect = appEl.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.className = 'hw-contextmenu pointer-events-auto absolute z-50 flex flex-col rounded-md';
    menu.style.width = 'max-content';
    
    const posX = Math.max(0, clientX - appRect.left);
    const posY = Math.max(0, clientY - appRect.top);

    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;

    const txtDuplicate = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-duplicate', 'Duplicate') : 'Duplicate';
    const txtExecute = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-execute', 'Execute') : 'Execute';
    const txtFormat = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-format', 'Format') : 'Format';
    const txtCustomize = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-customize', 'Customize') : 'Customize';
    const txtRename = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-rename', 'Rename') : 'Rename';
    const txtTogglePin = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-toggle-pin', 'Toggle pin') : 'Toggle pin';
    const txtToggleReadonly = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-toggle-readonly', 'Toggle readonly') : 'Toggle readonly';
    const txtSetIcon = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-set-icon', 'Set icon') : 'Set icon';
    
    const txtIconNone = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-icon-none', 'None') : 'None';
    const txtIconStar = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-icon-star', 'Star') : 'Star';
    const txtIconLightbulb = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-icon-lightbulb', 'Lightbulb') : 'Lightbulb';
    const txtIconTurbo = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-icon-turbo', 'Turbo') : 'Turbo';
    const txtIconCommands = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-icon-commands', 'Commands') : 'Commands';
    const txtIconBeaker = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-icon-beaker', 'Beaker') : 'Beaker';
    const txtIconShield = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-icon-shield', 'Shield') : 'Shield';
    const txtIconChess = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-icon-chess', 'Chess') : 'Chess';
    const txtIconSwords = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-icon-swords', 'Swords') : 'Swords';
    const txtIconRabbit = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-icon-rabbit', 'Rabbit') : 'Rabbit';

    const txtToggleAutoExec = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-toggle-auto-execute', 'Toggle auto-execute') : 'Toggle auto-execute';
    const txtCloseOthers = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-close-others', 'Close all but this') : 'Close all but this';

    menu.innerHTML = `
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="duplicate">
            <iconify-icon icon="fluent:clipboard-20-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtDuplicate}
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="execute">
            <iconify-icon icon="fluent:settings-20-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtExecute}
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="format">
            <iconify-icon icon="fluent:math-format-linear-24-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtFormat}
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default group" data-action="customize">
            <iconify-icon icon="fluent:edit-20-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtCustomize}
            <iconify-icon icon="fluent:chevron-right-20-regular" class="iconify flex items-center justify-center ml-auto"></iconify-icon>
            <div class="submenu-container">
                <div class="hw-contextmenu pointer-events-auto flex flex-col rounded-md">
                    <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="rename">
                        <iconify-icon icon="fluent:rename-24-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtRename}
                    </div>
                    <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="toggle-pin">
                        <iconify-icon icon="fluent:pin-12-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtTogglePin}
                    </div>
                    <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="toggle-readonly">
                        <iconify-icon icon="fluent:lock-20-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtToggleReadonly}
                    </div>
                    <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default group" data-action="set-icon">
                        <iconify-icon icon="fluent:icons-24-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtSetIcon}
                        <iconify-icon icon="fluent:chevron-right-20-regular" class="iconify flex items-center justify-center ml-auto"></iconify-icon>
                        <div class="submenu-container">
                            <div class="hw-contextmenu pointer-events-auto flex flex-col rounded-md">
                                <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="set-icon-none">
                                    <iconify-icon icon="fluent:border-none-24-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtIconNone}
                                </div>
                                <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="set-icon-star">
                                    <iconify-icon icon="fluent:star-24-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtIconStar}
                                </div>
                                <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="set-icon-lightbulb">
                                    <iconify-icon icon="fluent:lightbulb-24-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtIconLightbulb}
                                </div>
                                <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="set-icon-turbo">
                                    <iconify-icon icon="fluent:flash-24-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtIconTurbo}
                                </div>
                                <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="set-icon-commands">
                                    <iconify-icon icon="fluent:window-console-20-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtIconCommands}
                                </div>
                                <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="set-icon-beaker">
                                    <iconify-icon icon="fluent:beaker-24-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtIconBeaker}
                                </div>
                                <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="set-icon-shield">
                                    <iconify-icon icon="fluent:shield-24-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtIconShield}
                                </div>
                                <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="set-icon-chess">
                                    <iconify-icon icon="fluent:chess-20-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtIconChess}
                                </div>
                                <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="set-icon-swords">
                                    <iconify-icon icon="ri:sword-fill" class="iconify flex items-center justify-center"></iconify-icon> ${txtIconSwords}
                                </div>
                                <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="set-icon-rabbit">
                                    <iconify-icon icon="fluent:animal-rabbit-24-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtIconRabbit}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="toggle-auto-execute">
            <iconify-icon icon="fluent:settings-20-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtToggleAutoExec}
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="close-others">
            <iconify-icon icon="fluent:dismiss-20-filled" class="iconify flex items-center justify-center"></iconify-icon> ${txtCloseOthers}
        </div>
    `;

    menu.addEventListener('click', (e) => {
        const entry = e.target.closest('.entry');
        if (!entry) return;
        const action = entry.getAttribute('data-action');
        if (action && action !== 'customize' && action !== 'set-icon') {
            e.stopPropagation();
            closeTabContextMenu();
            handleTabContextAction(action, tabId);
        }
    });

    menu.querySelectorAll('.entry').forEach(entry => {
        const sub = entry.querySelector('.submenu-container');
        if (!sub) return;

        let closeTimeout = null;

        const openSub = () => {
            if (closeTimeout) {
                clearTimeout(closeTimeout);
                closeTimeout = null;
            }
            const rect = entry.getBoundingClientRect();
            if (rect.right + 180 > window.innerWidth) {
                entry.classList.add('flip-left');
            } else {
                entry.classList.remove('flip-left');
            }
            entry.classList.add('submenu-open');
        };

        const closeSub = () => {
            closeTimeout = setTimeout(() => {
                entry.classList.remove('submenu-open');
            }, 300);
        };

        entry.addEventListener('mouseenter', openSub);
        entry.addEventListener('mouseleave', closeSub);
        sub.addEventListener('mouseenter', openSub);
        sub.addEventListener('mouseleave', closeSub);
    });

    appEl.appendChild(menu);
    activeContextMenu = menu;

    // Adjust position if overflowing application container
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > appRect.right) {
        menu.style.left = `${Math.max(10, appRect.width - menuRect.width - 10)}px`;
    }
    if (menuRect.bottom > appRect.bottom) {
        menu.style.top = `${Math.max(10, appRect.height - menuRect.height - 10)}px`;
    }
}

function formatLuaCode(code) {
    if (!code) return '';

    const placeholders = [];
    const hideLiteral = (match) => {
        const id = `___LUA_LIT_${placeholders.length}___`;
        placeholders.push({ id, text: match });
        return id;
    };

    // 1. Protect comments and string literals
    let text = code.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, hideLiteral);
    text = text.replace(/\[(=*)\[[\s\S]*?\]\1\]/g, hideLiteral);
    text = text.replace(/--[^\r\n]*/g, hideLiteral);
    text = text.replace(/"(?:[^"\\]|\\.)*"/g, hideLiteral);
    text = text.replace(/'(?:[^'\\]|\\.)*'/g, hideLiteral);

    // 2. Format line by line
    const rawLines = text.split(/\r?\n/);
    let indentLevel = 0;
    const indentStr = '    '; // 4 spaces

    const formattedLines = rawLines.map((rawLine) => {
        let line = rawLine.trim();
        if (!line) return '';

        // Space commas & semicolons
        line = line.replace(/,\s*/g, ', ');
        line = line.replace(/;\s*/g, '; ');

        // Space compound assignments (+=, -=, *=, /=, %=, ^=, ..=)
        line = line.replace(/([a-zA-Z0-9_\]\)])\s*([\+\-*\/%^]|\.\.)=\s*([a-zA-Z0-9_\[\("'(-])/g, '$1 $2= $3');

        // Space comparison operators (==, ~=, <=, >=)
        line = line.replace(/([a-zA-Z0-9_\]\)"'])\s*(==|~=|<=|>=)\s*([a-zA-Z0-9_\[\('"(-])/g, '$1 $2 $3');

        // Space single assignment = (not ==, ~=, <=, >=, +=, -=, etc.)
        line = line.replace(/([^=<>~+\-*\/%^!.\s])\s*=\s*([^=])/g, '$1 = $2');
        line = line.replace(/([a-zA-Z0-9_\]\)"'])\s*=\s*/g, '$1 = ');
        line = line.replace(/\s*=\s*([a-zA-Z0-9_\[\("'{])/g, ' = $1');

        // Space string concatenation .. (excluding vararg ...)
        line = line.replace(/([^\s.])\s*\.\.\s*([^\s.])/g, '$1 .. $2');

        // Space binary arithmetic operators (+, -, *, /, %, ^)
        line = line.replace(/([a-zA-Z0-9_\]\)'"])\s*([\+\*\/%^])\s*([a-zA-Z0-9_\[\('"(-])/g, '$1 $2 $3');
        line = line.replace(/([a-zA-Z0-9_\]\)'"])\s*-\s*([a-zA-Z0-9_\[\('"(-])/g, '$1 - $2');

        // Space comparisons (<, >)
        line = line.replace(/([a-zA-Z0-9_\]\)'"])\s*([<>])\s*([a-zA-Z0-9_\[\('"(-])/g, '$1 $2 $3');

        // Space logical keywords
        line = line.replace(/\b(and|or)\b/g, ' $1 ');

        // Normalize internal whitespace
        line = line.replace(/[ \t]{2,}/g, ' ');

        // Block indentation tracking:
        // Count openers: 'function', 'repeat', 'do', '{' and standalone 'if ... then' (excluding 'elseif ... then')
        let opensCount = 0;
        const funcMatches = line.match(/\bfunction\b/g) || [];
        const repeatMatches = line.match(/\brepeat\b/g) || [];
        const doMatches = line.match(/\bdo\b/g) || [];
        const braceOpenMatches = line.match(/\{/g) || [];
        opensCount += funcMatches.length + repeatMatches.length + doMatches.length + braceOpenMatches.length;

        // Match 'if ... then' while ignoring 'elseif ... then'
        const strippedLine = line.replace(/\belseif\b.*?\bthen\b/g, '');
        const ifThenMatches = strippedLine.match(/\bif\b.*?\bthen\b/g) || [];
        opensCount += ifThenMatches.length;

        // Count closers: 'end', 'until', '}'
        const endMatches = line.match(/\bend\b/g) || [];
        const untilMatches = line.match(/\buntil\b/g) || [];
        const braceCloseMatches = line.match(/\}/g) || [];
        const closesCount = endMatches.length + untilMatches.length + braceCloseMatches.length;

        // Count leading closers at start of line
        let leadingClosers = 0;
        let tempLine = line;
        while (/^(\bend\b|\buntil\b|\})/.test(tempLine)) {
            leadingClosers++;
            tempLine = tempLine.replace(/^(\bend\b|\buntil\b|\})[,\)\s]*/, '').trim();
        }

        const startsWithBranch = /^(\belse\b|\belseif\b)/.test(line);

        let currentLineIndent = indentLevel;
        if (leadingClosers > 0) {
            currentLineIndent = Math.max(0, indentLevel - leadingClosers);
        } else if (startsWithBranch) {
            currentLineIndent = Math.max(0, indentLevel - 1);
        }

        // Update indent level for following lines
        indentLevel = Math.max(0, indentLevel + opensCount - closesCount);

        return indentStr.repeat(currentLineIndent) + line;
    });

    let result = formattedLines.join('\n');

    // 3. Restore protected literals & comments
    for (let i = placeholders.length - 1; i >= 0; i--) {
        const p = placeholders[i];
        result = result.split(p.id).join(p.text);
    }

    return result;
}

async function handleTabContextAction(action, tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    switch (action) {
        case 'duplicate':
            createTab((tab.title || 'Untitled tab') + ' (Copy)', tab.model ? tab.model.getValue() : (tab.savedValue || ''));
            break;
        case 'execute':
            if (window.executeScript) window.executeScript(tab.model ? tab.model.getValue() : '');
            break;
        case 'format': {
            if (tab.model) {
                const text = tab.model.getValue();
                const formatted = formatLuaCode(text);
                if (tabId === activeTabId && monacoEditor) {
                    monacoEditor.executeEdits('format', [{
                        range: tab.model.getFullModelRange(),
                        text: formatted
                    }]);
                } else {
                    tab.model.setValue(formatted);
                }
            }
            break;
        }
        case 'rename': {
            const newTitle = await HWDialog.promptRenameTab(tab.title);
            if (newTitle && newTitle.trim()) {
                tab.title = newTitle.trim();
                renderTabs();
                saveTabsToConfig();
            }
            break;
        }
        case 'toggle-pin':
            tab.pinned = !tab.pinned;
            renderTabs();
            saveTabsToConfig();
            break;
        case 'toggle-readonly':
            tab.readonly = !tab.readonly;
            if (tabId === activeTabId && monacoEditor) {
                monacoEditor.updateOptions({ readOnly: tab.readonly });
            }
            renderTabs();
            saveTabsToConfig();
            break;
        case 'set-icon-none': tab.customIcon = null; renderTabs(); saveTabsToConfig(); break;
        case 'set-icon-star': tab.customIcon = 'fluent:star-24-filled'; renderTabs(); saveTabsToConfig(); break;
        case 'set-icon-lightbulb': tab.customIcon = 'fluent:lightbulb-24-filled'; renderTabs(); saveTabsToConfig(); break;
        case 'set-icon-turbo': tab.customIcon = 'fluent:flash-24-filled'; renderTabs(); saveTabsToConfig(); break;
        case 'set-icon-commands': tab.customIcon = 'fluent:window-console-20-filled'; renderTabs(); saveTabsToConfig(); break;
        case 'set-icon-beaker': tab.customIcon = 'fluent:beaker-24-filled'; renderTabs(); saveTabsToConfig(); break;
        case 'set-icon-shield': tab.customIcon = 'fluent:shield-24-filled'; renderTabs(); saveTabsToConfig(); break;
        case 'set-icon-chess': tab.customIcon = 'fluent:chess-20-filled'; renderTabs(); saveTabsToConfig(); break;
        case 'set-icon-swords': tab.customIcon = 'ri:sword-fill'; renderTabs(); saveTabsToConfig(); break;
        case 'set-icon-rabbit': tab.customIcon = 'fluent:animal-rabbit-24-filled'; renderTabs(); saveTabsToConfig(); break;
        case 'set-directory':
            console.log('Set directory for tab', tabId);
            break;
        case 'reset-targets':
            console.log('Reset targets for tab', tabId);
            break;
        case 'toggle-auto-execute':
            tab.autoExecute = !tab.autoExecute;
            saveTabsToConfig();
            console.log('Toggle auto-execute for tab', tabId, tab.autoExecute);
            break;
        case 'close-others':
            tabs.filter(t => t.id !== tabId && !t.pinned).forEach(t => closeTab(t.id));
            break;
    }
}

// ── Action Bar ───────────────────────────────────────────────────────────────

function openConsoleFromUi(e) {
    if (e) {
        e.preventDefault();
    }
    const api = window.hwAPI;
    if (!api || typeof api.openConsole !== 'function') {
        console.error('[console-icon] hwAPI.openConsole is not available');
        return;
    }
    Promise.resolve(api.openConsole()).catch((err) => {
        console.error('[console-icon] openConsole failed', err);
    });
}

function initActionBar() {
    const consoleIcon = document.getElementById('console-icon');
    if (consoleIcon) {
        consoleIcon.addEventListener('click', openConsoleFromUi);
        consoleIcon.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                openConsoleFromUi(e);
            }
        });
    }

    document.getElementById('execute-button')?.addEventListener('click', () => {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) window.hwAPI?.execute(tab.model.getValue());
    });

    document.getElementById('clear-button')?.addEventListener('click', async () => {
        const tab = tabs.find(t => t.id === activeTabId);
        if (!tab) return;
        const currentContent = tab.model ? tab.model.getValue() : '';
        if (!currentContent) return;

        const warnUnsaved = localStorage.getItem('synapse_setting_unsaved_warnings') !== 'false';
        if (warnUnsaved && isTabUnsaved(tab)) {
            const confirmed = await HWDialog.confirmEraseUnsaved();
            if (!confirmed) return;
        }

        logUnsavedTabContent(tab.title, currentContent, 'cleared');
        tab.model.setValue('');
    });

    document.getElementById('openf-button')?.addEventListener('click', async () => {
        const result = await window.hwAPI?.openFile();
        if (result) openFileInEditor(result.name, result.content, { isFile: true, filePath: result.path });
    });

    document.getElementById('savef-button')?.addEventListener('click', async () => {
        saveActiveScript();
    });

    document.getElementById('add-tab-btn')?.addEventListener('click', () => {
        createTab();
    });
}

// ── Init ─────────────────────────────────────────────────────────────────────

function initEditor() {
    const savedTabs = loadTabsFromConfig();
    if (savedTabs && savedTabs.length > 0) {
        savedTabs.forEach(st => {
            const id = ++tabIdCounter;
            const content = st.content || '';
            const model = createModel(content);
            const tab = {
                id,
                title: st.title || 'Untitled tab',
                model,
                savedValue: st.savedValue !== undefined ? st.savedValue : content,
                customIcon: st.customIcon || null,
                isFile: !!st.isFile || (!!st.filePath),
                filePath: st.filePath || null,
                isBookmark: !!st.isBookmark || (!!st.bookmarkUri),
                bookmarkUri: st.bookmarkUri || null,
                pinned: !!st.pinned,
                readonly: !!st.readonly,
                autoExecute: !!st.autoExecute
            };
            attachTabListener(tab);
            tabs.push(tab);
        });
        activeTabId = tabs[0].id;
        attachModel(activeTabId);
        renderTabs();
    } else {
        createTab('Untitled tab', "print('Synapse winning!')");
    }
    initActionBar();
    initMonaco();
}

window.formatLuaCode = formatLuaCode;
window.formatCurrentTab = () => handleTabContextAction('format', activeTabId);
window.logUnsavedTabContent = logUnsavedTabContent;
window.getUnsavedHistory = () => {
    try {
        return JSON.parse(localStorage.getItem('synapse_unsaved_tabs_history') || '[]');
    } catch (e) {
        return [];
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEditor);
} else {
    initEditor();
}
