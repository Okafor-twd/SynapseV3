/**
 * lspService.js
 * Lua language server client connecting Monaco to lsp-ws-proxy.exe via WebSocket.
 */

class LSPService {
    constructor() {
        this.ready = false;
        this.workspaceUri = null;
        this.defDirUri = null;
        this.nextId = 1;
        this.pending = new Map();
        this.openDocs = new Map();
        this.changeTimers = new Map();
        this.synapseDocs = {};
        this.ws = null;
        this.loadSynapseDefs();
    }

    async loadSynapseDefs() {
        try {
            const res = await fetch('lsp/def/synapse.json');
            if (res.ok) {
                this.synapseDocs = await res.json();
            }
        } catch (_) {}
    }

    lspUriFromModel(model) {
        if (!model || !model.uri) return `${this.workspaceUri || 'file:///C:/SynapseWorkspace'}/untitled.lua`;
        const pathStr = model.uri.path || model.uri.fsPath || '';
        let base = pathStr.split('/').pop().split('\\').pop() || 'untitled';
        if (!base.endsWith('.lua') && !base.endsWith('.luau')) {
            base += '.lua';
        }
        return `${this.workspaceUri || 'file:///C:/SynapseWorkspace'}/${base}`;
    }

    sendLSP(method, params, isRequest = true) {
        const message = isRequest
            ? { jsonrpc: '2.0', id: this.nextId++, method, params }
            : { jsonrpc: '2.0', method, params };
        return new Promise((resolve) => {
            if (isRequest) this.pending.set(message.id, resolve);
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(message));
            }
            if (!isRequest) resolve(null);
        });
    }

    uriToMonacoRange(range) {
        if (!range) return undefined;
        return {
            startLineNumber: (range.start?.line ?? 0) + 1,
            startColumn: (range.start?.character ?? 0) + 1,
            endLineNumber: (range.end?.line ?? 0) + 1,
            endColumn: (range.end?.character ?? 0) + 1,
        };
    }

    async init(monacoInstance) {
        const mon = monacoInstance || (typeof monaco !== 'undefined' ? monaco : null);
        if (!mon) return;

        const isLspEnabled = localStorage.getItem('synapse_setting_lua_language_server') !== 'false';
        if (!isLspEnabled) return;

        let wsInfo = null;
        try {
            wsInfo = await window.hwAPI?.getLspWsInfo?.();
        } catch (e) {
            console.error('[LSP] Failed to get ws info:', e);
        }

        if (!wsInfo || !wsInfo.url) return;

        try {
            this.ws = new WebSocket(wsInfo.url);
        } catch (e) {
            console.error('[LSP] WebSocket init failed:', e);
            return;
        }

        this.ws.onopen = async () => {
            try {
                const [workspace, defDir] = await Promise.all([
                    window.hwAPI?.lspWorkspace?.() || 'C:/SynapseWorkspace',
                    window.hwAPI?.lspDefDir?.() || '',
                ]);
                this.workspaceUri = 'file:///' + String(workspace).replace(/\\/g, '/').replace(/\/+$/, '');
                this.defDirUri = defDir ? ('file:///' + String(defDir).replace(/\\/g, '/').replace(/\/+$/, '')) : null;
            } catch {
                this.workspaceUri = 'file:///C:/SynapseWorkspace';
            }

            const result = await this.sendLSP('initialize', {
                processId: null,
                rootUri: this.workspaceUri,
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
            this.ready = true;
            this.sendLSP('initialized', {}, false);

            if (this.defDirUri) {
                this.sendLSP('workspace/didChangeConfiguration', {
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
                                library: [this.defDirUri],
                                maxPreload: 5000,
                                preloadFileSize: 5000,
                            },
                            hint: { enable: false },
                        },
                    },
                }, false);
            }

            this.registerProviders(mon, result);

            mon.editor.getModels().forEach((m) => this.didOpen(m));
            mon.editor.onDidCreateModel((m) => this.didOpen(m));
            mon.editor.onWillDisposeModel((m) => this.didClose(m));
        };

        this.ws.onmessage = (event) => {
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

                if (message.id !== undefined && this.pending.has(message.id)) {
                    const resolve = this.pending.get(message.id);
                    this.pending.delete(message.id);
                    resolve(message.result);
                    return;
                }

                if (message.method === 'textDocument/publishDiagnostics') {
                    this.publishDiagnostics(mon, message.params);
                }
            } catch (err) {
                console.error('[LSP] JSON message parse error:', err);
            }
        };

        this.ws.onclose = () => {
            this.ready = false;
        };
    }

    publishDiagnostics(mon, params) {
        if (!params || !params.uri || !mon || !mon.editor) return;
        const model = mon.editor.getModels().find((m) => this.lspUriFromModel(m) === params.uri);
        if (!model) return;

        const severityMap = {
            1: mon.MarkerSeverity.Error,
            2: mon.MarkerSeverity.Warning,
            3: mon.MarkerSeverity.Info,
            4: mon.MarkerSeverity.Hint,
        };

        const markers = (params.diagnostics || []).map((d) => ({
            ...this.uriToMonacoRange(d.range),
            message: d.message,
            severity: severityMap[d.severity] ?? mon.MarkerSeverity.Info,
            source: d.source || 'Lua LSP',
        }));

        mon.editor.setModelMarkers(model, 'lsp', markers);
    }

    didOpen(model) {
        if (!model || typeof model.getValue !== 'function') return;
        const uriKey = model.uri.toString();
        if (this.openDocs.has(uriKey) || !this.ready) return;

        this.openDocs.set(uriKey, { version: 1 });
        const uri = this.lspUriFromModel(model);
        this.sendLSP('textDocument/didOpen', {
            textDocument: {
                uri,
                languageId: 'lua',
                version: 1,
                text: model.getValue(),
            },
        }, false);
    }

    didChange(model) {
        if (!model || typeof model.getValue !== 'function' || !this.ready) return;
        const uriKey = model.uri.toString();

        if (!this.openDocs.has(uriKey)) {
            this.didOpen(model);
        }

        clearTimeout(this.changeTimers.get(uriKey));
        this.changeTimers.set(uriKey, setTimeout(() => {
            const doc = this.openDocs.get(uriKey);
            if (doc) {
                doc.version += 1;
                const uri = this.lspUriFromModel(model);
                this.sendLSP('textDocument/didChange', {
                    textDocument: { uri, version: doc.version },
                    contentChanges: [{ text: model.getValue() }],
                }, false);
            }
        }, 50));
    }

    flushDocChange(model) {
        if (!model || typeof model.getValue !== 'function' || !this.ready) return;
        const uriKey = model.uri.toString();

        if (!this.openDocs.has(uriKey)) {
            this.didOpen(model);
            return;
        }

        if (this.changeTimers.has(uriKey)) {
            clearTimeout(this.changeTimers.get(uriKey));
            this.changeTimers.delete(uriKey);
        }

        const doc = this.openDocs.get(uriKey);
        if (!doc) return;
        doc.version = (doc.version || 1) + 1;
        const uri = this.lspUriFromModel(model);
        this.sendLSP('textDocument/didChange', {
            textDocument: { uri, version: doc.version },
            contentChanges: [{ text: model.getValue() }],
        }, false);
    }

    didClose(model) {
        if (!model) return;
        const uriKey = model.uri.toString();
        if (!this.openDocs.has(uriKey)) return;
        this.openDocs.delete(uriKey);
        clearTimeout(this.changeTimers.get(uriKey));
        if (this.ready) {
            this.sendLSP('textDocument/didClose', {
                textDocument: { uri: this.lspUriFromModel(model) },
            }, false);
        }
    }

    docToMarkdown(doc, label = '') {
        if (!doc && label && this.synapseDocs[label]) {
            return { value: this.synapseDocs[label] };
        }
        if (!doc) return null;
        if (typeof doc === 'string') return { value: doc };
        if (typeof doc.value === 'string') return { value: doc.value };
        return { value: String(doc) };
    }

    registerProviders(mon, initializeResult) {
        const caps = initializeResult?.capabilities || {};
        const K = mon.languages.CompletionItemKind;
        const COMPLETION_KINDS = {
            1: K.Text, 2: K.Method, 3: K.Function, 4: K.Constructor, 5: K.Field,
            6: K.Variable, 7: K.Class, 8: K.Interface, 9: K.Module, 10: K.Property,
            11: K.Unit, 12: K.Value, 13: K.Enum, 14: K.Keyword, 15: K.Snippet,
            16: K.Color, 17: K.File, 18: K.Reference, 19: K.Folder, 20: K.EnumMember,
            21: K.Constant, 22: K.Struct, 23: K.Event, 24: K.Operator, 25: K.TypeParameter,
        };

        // 1. Hover Provider
        mon.languages.registerHoverProvider('lua', {
            provideHover: async (model, position) => {
                if (!this.ready) return null;
                this.flushDocChange(model);
                const result = await this.sendLSP('textDocument/hover', {
                    textDocument: { uri: this.lspUriFromModel(model) },
                    position: { line: position.lineNumber - 1, character: position.column - 1 },
                });
                if (!result || !result.contents) {
                    const word = model.getWordAtPosition(position);
                    if (word && this.synapseDocs[word.word]) {
                        return {
                            contents: [{ value: `**Synapse API**: \`${word.word}\`\n\n${this.synapseDocs[word.word]}` }],
                        };
                    }
                    return null;
                }

                let contents = [];
                if (Array.isArray(result.contents)) {
                    contents = result.contents.map((c) => (typeof c === 'string' ? { value: c } : { value: c.value || '' }));
                } else {
                    contents = [this.docToMarkdown(result.contents)];
                }
                const range = result.range ? this.uriToMonacoRange(result.range) : undefined;
                return { range, contents: contents.filter(Boolean) };
            },
        });

        // 2. Completion Provider
        mon.languages.registerCompletionItemProvider('lua', {
            triggerCharacters: ['.', ':', '"', "'", '['],
            provideCompletionItems: async (model, position) => {
                if (!this.ready) return { suggestions: [] };
                this.flushDocChange(model);

                const word = model.getWordUntilPosition(position);
                const defaultRange = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };

                let lspItems = [];
                try {
                    const result = await this.sendLSP('textDocument/completion', {
                        textDocument: { uri: this.lspUriFromModel(model) },
                        position: { line: position.lineNumber - 1, character: position.column - 1 },
                    });
                    lspItems = Array.isArray(result) ? result : result?.items || [];
                } catch (_) {}

                const suggestions = lspItems.map((item, index) => {
                    const labelStr = typeof item.label === 'string' ? item.label : item.label?.label || '';
                    const paramDetail = item.labelDetails?.detail || '';
                    let desc = item.labelDetails?.description || item.detail || '';
                    if (desc === 'Synapse API' || desc === labelStr) desc = '';
                    const doc = this.docToMarkdown(item.documentation, labelStr);

                    let insertText = labelStr;
                    let itemRange = defaultRange;
                    let insertTextRules = undefined;

                    if (item.textEdit) {
                        if (item.textEdit.newText) insertText = item.textEdit.newText;
                        if (item.textEdit.range) itemRange = this.uriToMonacoRange(item.textEdit.range);
                        else if (item.textEdit.insert) itemRange = this.uriToMonacoRange(item.textEdit.insert);
                    } else if (item.insertText) {
                        insertText = item.insertText;
                    }

                    if (item.insertTextFormat === 2) {
                        insertTextRules = mon.languages.CompletionItemInsertTextRule.InsertAsSnippet;
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
                if (!this.ready || !item._rawItem) return item;
                try {
                    const resolved = await this.sendLSP('completionItem/resolve', item._rawItem);
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
                            item.documentation = this.docToMarkdown(resolved.documentation, labelStr);
                        }
                    }
                } catch (_) {}
                return item;
            },
        });

        // 3. Signature Help Provider
        mon.languages.registerSignatureHelpProvider('lua', {
            signatureHelpTriggerCharacters: ['(', ','],
            provideSignatureHelp: async (model, position) => {
                if (!this.ready) return null;
                this.flushDocChange(model);
                const result = await this.sendLSP('textDocument/signatureHelp', {
                    textDocument: { uri: this.lspUriFromModel(model) },
                    position: { line: position.lineNumber - 1, character: position.column - 1 },
                });
                if (!result || !result.signatures || !result.signatures.length) return null;

                return {
                    value: {
                        signatures: result.signatures.map((s) => ({
                            label: s.label,
                            documentation: this.docToMarkdown(s.documentation),
                            parameters: (s.parameters || []).map((p) => ({
                                label: typeof p.label === 'string' ? p.label : [p.label[0], p.label[1]],
                                documentation: this.docToMarkdown(p.documentation),
                            })),
                        })),
                        activeSignature: result.activeSignature || 0,
                        activeParameter: result.activeParameter || 0,
                    },
                    dispose: () => {},
                };
            },
        });

        // 4. Definition Provider
        mon.languages.registerDefinitionProvider('lua', {
            provideDefinition: async (model, position) => {
                if (!this.ready) return null;
                this.flushDocChange(model);
                const result = await this.sendLSP('textDocument/definition', {
                    textDocument: { uri: this.lspUriFromModel(model) },
                    position: { line: position.lineNumber - 1, character: position.column - 1 },
                });
                if (!result) return null;
                const locations = Array.isArray(result) ? result : [result];
                return locations.map((loc) => ({
                    uri: mon.Uri.parse(loc.uri),
                    range: this.uriToMonacoRange(loc.range),
                }));
            },
        });
    }
}

export const lspService = new LSPService();
window.lspService = lspService;
window.lspDidOpen = (m) => lspService.didOpen(m);
window.lspDidChange = (m) => lspService.didChange(m);
window.lspDidClose = (m) => lspService.didClose(m);
