/**
 * lsp.js
 * Lua language server client over the hwAPI LSP bridge.
 * Wires the bundled Synapse lua-language-server into Monaco:
 *   - Live Diagnostics & syntax errors → Monaco markers (red/yellow squiggles)
 *   - Autocompletion (Synapse API, Roblox globals, Lua built-ins)
 *   - Hover signatures and documentation
 *   - Signature help (parameter hints while typing functions)
 *   - Go to Definition
 *   - Semantic Tokens (advanced syntax highlighting)
 */

const LSP = {
    ready: false,
    workspaceUri: null,
    defDirUri: null,
    nextId: 1,
    pending: new Map(),          // id -> resolve
    openDocs: new Map(),         // monaco model uri string -> { version }
    changeTimers: new Map(),     // model uri string -> timer
    synapseDocs: {},             // Synapse API documentation dictionary
};

// Load Synapse API docs for enhanced descriptions
(async function loadSynapseDefs() {
    try {
        const response = await fetch('lsp/def/synapse.json');
        if (response.ok) {
            LSP.synapseDocs = await response.json();
        }
    } catch (_) {}
})();

function lspUriFromModel(model) {
    if (!model || !model.uri) return `${LSP.workspaceUri || 'file:///C:/SynapseWorkspace'}/untitled.lua`;
    let name = model.uri.path.replace(/^\/+/, '') || 'untitled';
    name = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!name.endsWith('.lua')) name += '.lua';
    return `${LSP.workspaceUri || 'file:///C:/SynapseWorkspace'}/${name}`;
}

let lspWs = null;

function sendLSP(method, params, isRequest = true) {
    const message = isRequest
        ? { jsonrpc: '2.0', id: LSP.nextId++, method, params }
        : { jsonrpc: '2.0', method, params };
    return new Promise((resolve) => {
        if (isRequest) LSP.pending.set(message.id, resolve);
        if (lspWs && lspWs.readyState === WebSocket.OPEN) {
            lspWs.send(JSON.stringify(message));
        }
        if (!isRequest) resolve(null);
    });
}

function uriToMonacoRange(range) {
    if (!range) return undefined;
    return {
        startLineNumber: (range.start?.line ?? 0) + 1,
        startColumn: (range.start?.character ?? 0) + 1,
        endLineNumber: (range.end?.line ?? 0) + 1,
        endColumn: (range.end?.character ?? 0) + 1,
    };
}

async function initLSP() {
    // Check if Lua Language Server is enabled in settings
    const isLspEnabled = localStorage.getItem('synapse_setting_lua_language_server') !== 'false';
    if (!isLspEnabled) {
        console.log('[LSP] Lua Language Server disabled in settings.');
        return;
    }

    let wsInfo = null;
    try {
        wsInfo = await window.hwAPI?.getLspWsInfo?.();
    } catch (e) {
        console.error('[LSP] Failed to get ws info:', e);
    }

    if (!wsInfo || !wsInfo.url) {
        console.error('[LSP] No WebSocket URL provided by backend.');
        return;
    }

    console.log('[LSP] Connecting to lsp-ws-proxy at', wsInfo.url);
    lspWs = new WebSocket(wsInfo.url);

    lspWs.onopen = async () => {
        console.log('[LSP] WebSocket connected to lsp-ws-proxy!');

        try {
            const [workspace, defDir] = await Promise.all([
                window.hwAPI.lspWorkspace?.() || 'C:/SynapseWorkspace',
                window.hwAPI.lspDefDir?.() || '',
            ]);
            LSP.workspaceUri = 'file:///' + String(workspace).replace(/\\/g, '/').replace(/\/+$/, '');
            LSP.defDirUri = defDir ? ('file:///' + String(defDir).replace(/\\/g, '/').replace(/\/+$/, '')) : null;
        } catch {
            LSP.workspaceUri = 'file:///C:/SynapseWorkspace';
        }

        const result = await sendLSP('initialize', {
            processId: null,
            rootUri: LSP.workspaceUri,
            capabilities: {
                textDocument: {
                    synchronization: {
                        dynamicRegistration: false,
                        willSave: false,
                        willSaveWaitUntil: false,
                        didSave: false,
                    },
                    hover: {
                        dynamicRegistration: false,
                        contentFormat: ['markdown', 'plaintext'],
                    },
                    completion: {
                        dynamicRegistration: false,
                        completionItem: {
                            snippetSupport: true,
                            labelDetailsSupport: true,
                            documentationFormat: ['markdown', 'plaintext'],
                        },
                    },
                    signatureHelp: {
                        dynamicRegistration: false,
                        signatureInformation: {
                            documentationFormat: ['markdown', 'plaintext'],
                        },
                    },
                    definition: {
                        dynamicRegistration: false,
                    },
                    publishDiagnostics: {
                        relatedInformation: true,
                    },
                    semanticTokens: {
                        tokenTypes: [],
                        tokenModifiers: [],
                        formats: ['relative'],
                        requests: { range: false, full: true },
                        multilineTokenSupport: false,
                    },
                },
            },
        });

        if (!result) return;
        LSP.ready = true;
        console.log('[LSP] Initialized successfully via WebSocket with capabilities:', result.capabilities);

        sendLSP('initialized', {}, false);

        // Configure Lua workspace libraries & Synapse definitions
        if (LSP.defDirUri) {
            sendLSP('workspace/didChangeConfiguration', {
                settings: {
                    Lua: {
                        runtime: { version: 'Lua 5.1' },
                        diagnostics: {
                            globals: [
                                'syn', 'synapse', 'getgenv', 'getrenv', 'getreg', 'getgc', 'filtergc',
                                'getinstances', 'getnilinstances', 'getscripts', 'getloadedmodules',
                                'fireclickdetector', 'fireproximityprompt', 'firetouchinterest',
                                'getrawmetatable', 'setrawmetatable', 'setreadonly', 'isreadonly',
                                'isnetworkowner', 'iswindowactive', 'keypress', 'keyrelease', 'keyclick',
                                'mouse1press', 'mouse1release', 'mouse1click', 'mouse2press', 'mouse2release',
                                'mouse2click', 'mousescroll', 'mousemoverel', 'mousemoveabs', 'iskeydown',
                                'iskeytoggled', 'setclipboard', 'identifyexecutor', 'messagebox',
                                'setwindowtitle', 'setwindowicon', 'game', 'workspace', 'script',
                                'Enum', 'Vector3', 'CFrame', 'Color3', 'UDim2', 'UDim', 'Instance',
                                'tick', 'wait', 'spawn', 'delay', 'warn'
                            ],
                        },
                        workspace: {
                            library: [LSP.defDirUri],
                            maxPreload: 5000,
                            preloadFileSize: 5000,
                        },
                        hint: { enable: false },
                    },
                },
            }, false);
        }

        // Register Monaco Language Providers
        const hookProviders = () => {
            if (typeof monaco !== 'undefined' && monaco.languages && monaco.editor) {
                registerProviders(result);

                // Sync all currently open models
                monaco.editor.getModels().forEach((model) => {
                    lspDidOpen(model);
                });

                // Auto-sync future models
                monaco.editor.onDidCreateModel((model) => {
                    lspDidOpen(model);
                });
                monaco.editor.onWillDisposeModel((model) => {
                    lspDidClose(model);
                });
            }
        };

        if (typeof monaco !== 'undefined' && monaco.languages && monaco.editor) {
            hookProviders();
        } else {
            document.addEventListener('monaco:ready', hookProviders, { once: true });
        }
    };

    lspWs.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message.error) {
                const logLsp = localStorage.getItem('synapse_setting_log_lsp_errors') === 'true';
                if (logLsp) {
                    window.hwAPI?.sendConsoleLog?.({
                        level: 'error',
                        text: `[LSP Error] ${message.error.message || JSON.stringify(message.error)}`,
                        time: new Date().toLocaleTimeString()
                    });
                }
            }

            if (message.id !== undefined && LSP.pending.has(message.id)) {
                const resolve = LSP.pending.get(message.id);
                LSP.pending.delete(message.id);
                resolve(message.result);
                return;
            }

            if (message.method === 'textDocument/publishDiagnostics') {
                publishDiagnostics(message.params);
            }
        } catch (err) {
            console.error('[LSP] JSON message parse error:', err);
        }
    };

    lspWs.onerror = (err) => {
        console.error('[LSP WebSocket error]', err);
    };

    lspWs.onclose = () => {
        LSP.ready = false;
        console.log('[LSP WebSocket closed]');
    };
}

function publishDiagnostics(params) {
    if (!params || !params.uri || typeof monaco === 'undefined' || !monaco.editor) return;
    const model = monaco.editor.getModels().find((m) => lspUriFromModel(m) === params.uri);
    if (!model) return;

    const severityMap = {
        1: monaco.MarkerSeverity.Error,
        2: monaco.MarkerSeverity.Warning,
        3: monaco.MarkerSeverity.Info,
        4: monaco.MarkerSeverity.Hint,
    };

    const markers = (params.diagnostics || []).map((d) => ({
        ...uriToMonacoRange(d.range),
        message: d.message,
        severity: severityMap[d.severity] ?? monaco.MarkerSeverity.Info,
        source: d.source || 'Lua LSP',
    }));

    monaco.editor.setModelMarkers(model, 'lsp', markers);
}

// ── Document Lifecycle Sync ──────────────────────────────────────────────────

function flushDocChange(model) {
    if (!model || typeof model.getValue !== 'function') return;
    const uriKey = model.uri.toString();
    if (!LSP.ready) return;

    if (!LSP.openDocs.has(uriKey)) {
        lspDidOpen(model);
    }

    if (LSP.changeTimers.has(uriKey)) {
        clearTimeout(LSP.changeTimers.get(uriKey));
        LSP.changeTimers.delete(uriKey);
    }

    const doc = LSP.openDocs.get(uriKey);
    if (doc) {
        doc.version += 1;
        const uri = lspUriFromModel(model);
        sendLSP('textDocument/didChange', {
            textDocument: { uri, version: doc.version },
            contentChanges: [{ text: model.getValue() }],
        }, false);
    }
}

function lspDidOpen(model) {
    if (!model || typeof model.getValue !== 'function') return;
    const uriKey = model.uri.toString();
    if (LSP.openDocs.has(uriKey)) return;
    if (!LSP.ready) return;

    LSP.openDocs.set(uriKey, { version: 1 });
    const uri = lspUriFromModel(model);
    sendLSP('textDocument/didOpen', {
        textDocument: {
            uri,
            languageId: 'lua',
            version: 1,
            text: model.getValue(),
        },
    }, false);
}

function lspDidChange(model) {
    if (!model || typeof model.getValue !== 'function') return;
    const uriKey = model.uri.toString();
    if (!LSP.ready) return;

    if (!LSP.openDocs.has(uriKey)) {
        lspDidOpen(model);
    }

    clearTimeout(LSP.changeTimers.get(uriKey));
    LSP.changeTimers.set(uriKey, setTimeout(() => {
        flushDocChange(model);
    }, 50));
}

function lspDidClose(model) {
    if (!model) return;
    const uriKey = model.uri.toString();
    if (!LSP.openDocs.has(uriKey)) return;
    LSP.openDocs.delete(uriKey);
    clearTimeout(LSP.changeTimers.get(uriKey));
    if (LSP.ready) {
        sendLSP('textDocument/didClose', {
            textDocument: { uri: lspUriFromModel(model) },
        }, false);
    }
}

// ── Monaco Language Feature Providers ────────────────────────────────────────

function documentationToMarkdown(doc, label = '') {
    if (!doc && label && LSP.synapseDocs[label]) {
        return { value: LSP.synapseDocs[label] };
    }
    if (!doc) return null;
    if (typeof doc === 'string') return { value: doc };
    if (typeof doc.value === 'string') return { value: doc.value };
    return { value: String(doc) };
}

function registerProviders(initializeResult) {
    const caps = initializeResult?.capabilities || {};
    const K = monaco.languages.CompletionItemKind;
    const COMPLETION_KINDS = {
        1: K.Text, 2: K.Method, 3: K.Function, 4: K.Constructor, 5: K.Field,
        6: K.Variable, 7: K.Class, 8: K.Interface, 9: K.Module, 10: K.Property,
        11: K.Unit, 12: K.Value, 13: K.Enum, 14: K.Keyword, 15: K.Snippet,
        16: K.Color, 17: K.File, 18: K.Reference, 19: K.Folder, 20: K.EnumMember,
        21: K.Constant, 22: K.Struct, 23: K.Event, 24: K.Operator, 25: K.TypeParameter,
    };

    // ── 1. Hover Provider ────────────────────────────────────────────────────
    monaco.languages.registerHoverProvider('lua', {
        provideHover: async (model, position) => {
            if (!LSP.ready) return null;
            flushDocChange(model);
            const result = await sendLSP('textDocument/hover', {
                textDocument: { uri: lspUriFromModel(model) },
                position: { line: position.lineNumber - 1, character: position.column - 1 },
            });
            if (!result || !result.contents) {
                const word = model.getWordAtPosition(position);
                if (word && LSP.synapseDocs[word.word]) {
                    return {
                        contents: [{ value: `**Synapse API**: \`${word.word}\`\n\n${LSP.synapseDocs[word.word]}` }],
                    };
                }
                return null;
            }

            let contents = [];
            if (Array.isArray(result.contents)) {
                contents = result.contents.map((c) => (typeof c === 'string' ? { value: c } : { value: c.value || '' }));
            } else {
                contents = [documentationToMarkdown(result.contents)];
            }
            const range = result.range ? uriToMonacoRange(result.range) : undefined;
            return { range, contents: contents.filter(Boolean) };
        },
    });

    const KNOWN_GLOBAL_TYPES = {
        game: 'DataModel',
        workspace: 'Workspace',
        script: 'LuaSourceContainer',
        syn: 'Synapse',
        synapse: 'Synapse',
        Enum: 'Enums',
        Vector3: 'Vector3',
        Vector2: 'Vector2',
        CFrame: 'CFrame',
        Color3: 'Color3',
        UDim: 'UDim',
        UDim2: 'UDim2',
        Instance: 'Instance',
        TweenInfo: 'TweenInfo',
        BrickColor: 'BrickColor',
        Ray: 'Ray',
        Random: 'Random',
        NumberSequence: 'NumberSequence',
        ColorSequence: 'ColorSequence',
        NumberRange: 'NumberRange',
        Rect: 'Rect',
        PhysicalProperties: 'PhysicalProperties',
        task: 'task',
        utf8: 'utf8',
        bit32: 'bit32',
        math: 'math',
        table: 'table',
        string: 'string',
        os: 'os',
        debug: 'debug',
        coroutine: 'coroutine',
    };

    // ── 2. Completion Provider ───────────────────────────────────────────────
    monaco.languages.registerCompletionItemProvider('lua', {
        triggerCharacters: ['.', ':', '"', "'", '['],
        provideCompletionItems: async (model, position) => {
            if (!LSP.ready) return { suggestions: [] };
            flushDocChange(model);

            const word = model.getWordUntilPosition(position);
            const defaultRange = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            let lspItems = [];
            try {
                const result = await sendLSP('textDocument/completion', {
                    textDocument: { uri: lspUriFromModel(model) },
                    position: { line: position.lineNumber - 1, character: position.column - 1 },
                });
                lspItems = Array.isArray(result) ? result : result?.items || [];
            } catch (_) {}

            const suggestions = lspItems.map((item, index) => {
                const labelStr = typeof item.label === 'string' ? item.label : item.label?.label || '';
                const paramDetail = item.labelDetails?.detail || '';
                let desc = item.labelDetails?.description || item.detail || KNOWN_GLOBAL_TYPES[labelStr] || '';
                if (desc === 'Synapse API' || desc === labelStr) desc = '';
                const doc = documentationToMarkdown(item.documentation, labelStr);

                let insertText = labelStr;
                let itemRange = defaultRange;
                let insertTextRules = undefined;

                if (item.textEdit) {
                    if (item.textEdit.newText) insertText = item.textEdit.newText;
                    if (item.textEdit.range) itemRange = uriToMonacoRange(item.textEdit.range);
                    else if (item.textEdit.insert) itemRange = uriToMonacoRange(item.textEdit.insert);
                } else if (item.insertText) {
                    insertText = item.insertText;
                }

                if (item.insertTextFormat === 2) {
                    insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
                }

                return {
                    label: {
                        label: labelStr,
                        detail: paramDetail,
                        description: desc,
                    },
                    kind: COMPLETION_KINDS[item.kind] || K.Function,
                    detail: desc,
                    documentation: doc,
                    insertText,
                    insertTextRules,
                    filterText: item.filterText || labelStr,
                    range: itemRange,
                    sortText: item.sortText || String(index).padStart(5, '0'),
                    _rawItem: item,
                };
            });

            return { suggestions };
        },
        resolveCompletionItem: async (item) => {
            if (!LSP.ready || !item._rawItem) return item;
            try {
                const resolved = await sendLSP('completionItem/resolve', item._rawItem);
                if (resolved) {
                    const resolvedDetail = resolved.detail || (typeof item.label === 'object' ? item.label.description : item.detail);
                    if (resolvedDetail) {
                        item.detail = resolvedDetail;
                        if (typeof item.label === 'object') {
                            item.label.description = resolvedDetail;
                        }
                    }
                    if (resolved.documentation) {
                        const labelStr = typeof item.label === 'string' ? item.label : item.label.label;
                        item.documentation = documentationToMarkdown(resolved.documentation, labelStr);
                    }
                }
            } catch (_) {}
            return item;
        },
    });

    // ── 3. Signature Help Provider ───────────────────────────────────────────
    monaco.languages.registerSignatureHelpProvider('lua', {
        signatureHelpTriggerCharacters: ['(', ','],
        provideSignatureHelp: async (model, position) => {
            if (!LSP.ready) return null;
            const result = await sendLSP('textDocument/signatureHelp', {
                textDocument: { uri: lspUriFromModel(model) },
                position: { line: position.lineNumber - 1, character: position.column - 1 },
            });
            if (!result || !result.signatures || !result.signatures.length) return null;

            return {
                value: {
                    signatures: result.signatures.map((s) => ({
                        label: s.label,
                        documentation: documentationToMarkdown(s.documentation),
                        parameters: (s.parameters || []).map((p) => ({
                            label: typeof p.label === 'string' ? p.label : [p.label[0], p.label[1]],
                            documentation: documentationToMarkdown(p.documentation),
                        })),
                    })),
                    activeSignature: result.activeSignature || 0,
                    activeParameter: result.activeParameter || 0,
                },
                dispose: () => {},
            };
        },
    });

    // ── 4. Definition Provider ───────────────────────────────────────────────
    monaco.languages.registerDefinitionProvider('lua', {
        provideDefinition: async (model, position) => {
            if (!LSP.ready) return null;
            const result = await sendLSP('textDocument/definition', {
                textDocument: { uri: lspUriFromModel(model) },
                position: { line: position.lineNumber - 1, character: position.column - 1 },
            });
            if (!result) return null;
            const locations = Array.isArray(result) ? result : [result];
            return locations.map((loc) => ({
                uri: monaco.Uri.parse(loc.uri),
                range: uriToMonacoRange(loc.range),
            }));
        },
    });

    // ── 5. Document Semantic Tokens (Syntax Highlighting) ────────────────────
    const semanticCaps = caps.semanticTokensProvider;
    if (semanticCaps?.legend) {
        monaco.languages.registerDocumentSemanticTokensProvider('lua', {
            getLegend: () => semanticCaps.legend,
            provideDocumentSemanticTokens: async (model) => {
                if (!LSP.ready) return { data: new Uint32Array() };
                const result = await sendLSP('textDocument/semanticTokens/full', {
                    textDocument: { uri: lspUriFromModel(model) },
                });
                if (!result?.data) return { data: new Uint32Array() };
                return { data: new Uint32Array(result.data) };
            },
            releaseDocumentSemanticTokens: () => {},
        });
    }
}

// Global exposure for editor.js integration
window.lspDidOpen = lspDidOpen;
window.lspDidChange = lspDidChange;
window.lspDidClose = lspDidClose;

document.addEventListener('DOMContentLoaded', initLSP);
