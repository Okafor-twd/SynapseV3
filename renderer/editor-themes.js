/**
 * editor-themes.js
 * Loads the original VS Code/Monaco compatible editor.json file for each theme.
 */

function stripHash(hex) {
    if (!hex || typeof hex !== 'string') return undefined;
    return hex.startsWith('#') ? hex.slice(1) : hex;
}

async function applyEditorTheme(themeId) {
    if (typeof monaco === 'undefined' || !monaco.editor) return;

    // Built-in theme mappings / overrides
    if (themeId === 'coolkid') {
        monaco.editor.setTheme('hc-black');
        return;
    }

    if (themeId === 'seven' || themeId === 'hollywood-light') {
        monaco.editor.setTheme('vs');
        return;
    }

    const HOLLYWOOD_DARK_RULES = [
        { token: 'keyword', foreground: 'EA4A5A' },
        { token: 'keyword.synapse', foreground: 'EA4A5A' },
        { token: 'type', foreground: 'EA4A5A' },
        { token: 'predefined', foreground: 'FFD866' },
        { token: 'entity.name.function', foreground: 'FFD866' },
        { token: 'function', foreground: 'FFD866' },
        { token: 'string', foreground: '79B8FF' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'number.float', foreground: 'B5CEA8' },
        { token: 'number.hex', foreground: '5BB498' },
        { token: 'comment', foreground: '959DA5', fontStyle: 'italic' },
        { token: 'operator', foreground: 'DCDCDC' },
        { token: 'delimiter', foreground: 'DCDCDC' },
        { token: 'identifier', foreground: 'F6F8FA' }
    ];

    if (themeId === 'hollywood-dark') {
        monaco.editor.defineTheme('hw-hollywood-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: HOLLYWOOD_DARK_RULES,
            colors: {
                'editor.background': '#000000',
                'editorGutter.background': '#000000',
                'editor.foreground': '#F6F8FA',
                'editorCursor.foreground': '#F6F8FA',
                'editor.selectionBackground': '#403e41',
                'editor.lineHighlightBackground': '#19181a'
            }
        });
        monaco.editor.setTheme('hw-hollywood-dark');
        return;
    }

    if (themeId === 'hollywood-glass') {
        monaco.editor.defineTheme('hw-hollywood-glass', {
            base: 'vs-dark',
            inherit: true,
            rules: HOLLYWOOD_DARK_RULES,
            colors: {
                'editor.background': '#00000000',
                'editorGutter.background': '#00000000',
                'editor.foreground': '#F6F8FA',
                'editorCursor.foreground': '#F6F8FA',
                'editor.selectionBackground': '#403e41',
                'editor.lineHighlightBackground': '#19181a44'
            }
        });
        monaco.editor.setTheme('hw-hollywood-glass');
        return;
    }

    const FALLBACK_LUA_RULES = [
        { token: 'keyword', foreground: '569CD6' },
        { token: 'keyword.synapse', foreground: '569CD6' },
        { token: 'type', foreground: '569CD6' },
        { token: 'predefined', foreground: '569CD6' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'string.escape', foreground: 'CE9178' },
        { token: 'comment', foreground: '608B4E', fontStyle: 'italic' },
        { token: 'operator', foreground: 'FFFF00' },
        { token: 'delimiter', foreground: 'FFFF00' },
        { token: 'delimiter.bracket', foreground: 'FFFF00' },
        { token: 'delimiter.array', foreground: 'FFFF00' },
        { token: 'delimiter.parenthesis', foreground: 'FFFF00' },
        { token: 'number', foreground: 'FFFFFF' },
        { token: 'number.float', foreground: 'FFFFFF' },
        { token: 'number.hex', foreground: 'FFFFFF' },
        { token: 'identifier', foreground: 'FFFFFF' },
        { token: 'entity.name.function', foreground: 'FFFFFF' },
        { token: 'function', foreground: 'FFFFFF' },
    ];

    try {
        let def = null;
        const meta = (typeof themeMetas !== 'undefined') ? (themeMetas[themeId] || Object.values(themeMetas).find(m => m.id === themeId || m.folderName === themeId)) : null;
        if (meta && meta.editorTheme) {
            def = meta.editorTheme;
        } else {
            const res = await window.hwAPI?.loadTheme(themeId);
            if (res && res.editorTheme) def = res.editorTheme;
        }

        if (!def) {
            const folder = meta?.folderName || themeId;
            const candidates = [
                meta?.themeDir ? `${meta.themeDir}/editor.json` : null,
                `themes/${folder}/editor.json`,
                `themes/${themeId}/editor.json`,
                `assets/styles/default-themes/${folder}/editor.json`,
                `assets/styles/default-themes/${themeId}/editor.json`
            ].filter(Boolean);

            for (const path of candidates) {
                try {
                    const response = await fetch(path);
                    if (response.ok) {
                        def = await response.json();
                        break;
                    }
                } catch (_) {}
            }
        }

        if (!def) {
            const themeName = 'hw-' + (meta?.id || themeId);
            monaco.editor.defineTheme(themeName, {
                base: 'vs-dark',
                inherit: true,
                rules: FALLBACK_LUA_RULES,
                colors: {
                    'editor.background': '#000000',
                    'editorGutter.background': '#000000',
                    'editor.foreground': '#FFFFFF',
                    'editorCursor.foreground': '#FFFFFF',
                    'editor.selectionBackground': '#264F78',
                    'editor.lineHighlightBackground': '#19181a'
                }
            });
            monaco.editor.setTheme(themeName);
            return;
        }
        
        let rules = [];
        let colors = def.colors || {};

        // Shorthand editor schema support
        if (def.bg || def.fg || def.keyword) {
            if (def.bg) {
                colors['editor.background'] = def.bg;
                colors['editorGutter.background'] = def.bg;
            }
            if (def.fg) colors['editor.foreground'] = def.fg;
            if (def.selection) colors['editor.selectionBackground'] = def.selection;
            if (def.lineHighlight) colors['editor.lineHighlightBackground'] = def.lineHighlight;
            if (def.lineHighlightBorder) colors['editor.lineHighlightBorder'] = def.lineHighlightBorder;
            if (def.cursor) colors['editorCursor.foreground'] = def.cursor;
            if (def.lineNumber) colors['editorLineNumber.foreground'] = def.lineNumber;
            if (def.lineNumberActive) colors['editorLineNumber.activeForeground'] = def.lineNumberActive;

            if (def.comment) rules.push({ token: 'comment', foreground: stripHash(def.comment), fontStyle: 'italic' });
            if (def.string) rules.push({ token: 'string', foreground: stripHash(def.string) });
            if (def.keyword) rules.push({ token: 'keyword', foreground: stripHash(def.keyword) }, { token: 'keyword.synapse', foreground: stripHash(def.type || def.keyword) });
            if (def.number) rules.push({ token: 'number', foreground: stripHash(def.number) }, { token: 'constant', foreground: stripHash(def.number) });
            if (def.type) rules.push({ token: 'type', foreground: stripHash(def.type) }, { token: 'keyword.synapse', foreground: stripHash(def.type) });
            if (def.function) rules.push({ token: 'predefined', foreground: stripHash(def.function) }, { token: 'function', foreground: stripHash(def.function) }, { token: 'entity.name.function', foreground: stripHash(def.function) });
            if (def.operator) rules.push({ token: 'operator', foreground: stripHash(def.operator) }, { token: 'delimiter', foreground: stripHash(def.operator) });
            if (def.variable) rules.push({ token: 'variable', foreground: stripHash(def.variable) }, { token: 'identifier', foreground: stripHash(def.variable) });
        }
        
        // Some themes use tokenColors (VS Code style)
        if (def.tokenColors && Array.isArray(def.tokenColors)) {
            def.tokenColors.forEach(tc => {
                if (!tc.settings || !tc.settings.foreground) return;
                const fg = stripHash(tc.settings.foreground);
                const bg = stripHash(tc.settings.background);
                const fontStyle = tc.settings.fontStyle;

                const scopes = Array.isArray(tc.scope)
                    ? tc.scope
                    : (typeof tc.scope === 'string' ? tc.scope.split(/,\s*/) : []);

                scopes.forEach(rawScope => {
                    const scope = rawScope.trim();
                    if (!scope) return;
                    rules.push({ token: scope, foreground: fg, background: bg, fontStyle });

                    // Map TextMate standard scopes to Monarch tokens
                    if (scope.startsWith('keyword') || scope.startsWith('storage')) {
                        rules.push({ token: 'keyword', foreground: fg });
                    }
                    if (scope.startsWith('entity.name.type') || scope.startsWith('support.type') || scope.startsWith('support.class') || scope.startsWith('storage.type.class')) {
                        rules.push({ token: 'type', foreground: fg });
                        rules.push({ token: 'keyword.synapse', foreground: fg });
                    }
                    if (scope.startsWith('entity.name.function') || scope.startsWith('support.function')) {
                        rules.push({ token: 'predefined', foreground: fg });
                    }
                    if (scope.startsWith('string')) {
                        rules.push({ token: 'string', foreground: fg });
                    }
                    if (scope.startsWith('constant.numeric') || scope.startsWith('constant.language')) {
                        rules.push({ token: 'number', foreground: fg });
                    }
                    if (scope.startsWith('comment')) {
                        rules.push({ token: 'comment', foreground: fg, fontStyle: fontStyle || 'italic' });
                    }
                    if (scope.startsWith('variable') || scope.startsWith('entity.name.variable')) {
                        rules.push({ token: 'identifier', foreground: fg });
                    }
                    if (scope.startsWith('keyword.operator') || scope.startsWith('punctuation')) {
                        rules.push({ token: 'operator', foreground: fg });
                        rules.push({ token: 'delimiter', foreground: fg });
                    }
                });
            });
        } 
        
        if (def.rules && Array.isArray(def.rules)) {
            let kwColor, typeColor, fnColor, strColor, numColor, commentColor, varColor;

            def.rules.forEach(r => {
                if (!r.foreground || !r.token) return;
                const fg = stripHash(r.foreground);
                const tok = r.token.trim();

                if (tok === 'keyword' || tok.startsWith('keyword.control') || tok === 'storage.type') {
                    kwColor = fg;
                }
                if (tok === 'support.class' || tok === 'support.type' || tok === 'entity.name.type' || tok === 'support.variable') {
                    typeColor = fg;
                }
                if (tok === 'support.function' || tok === 'entity.name.function' || tok === 'variable.function') {
                    fnColor = fg;
                }
                if (tok === 'string' || tok === 'string.quoted') {
                    strColor = fg;
                }
                if (tok.includes('constant.numeric') || tok.includes('constant.language') || tok === 'constant') {
                    numColor = fg;
                }
                if (tok === 'comment' || tok.startsWith('comment')) {
                    commentColor = fg;
                }
                if (tok === 'variable' || tok === 'variable.other' || tok === 'variable.other.readwrite') {
                    varColor = fg;
                }

                rules.push({
                    token: r.token,
                    foreground: fg,
                    background: stripHash(r.background),
                    fontStyle: r.fontStyle
                });
            });

            if (kwColor) rules.push({ token: 'keyword', foreground: kwColor });
            if (typeColor) {
                rules.push({ token: 'type', foreground: typeColor });
                rules.push({ token: 'keyword.synapse', foreground: typeColor });
            }
            if (fnColor) {
                rules.push({ token: 'predefined', foreground: fnColor });
            }
            if (strColor) rules.push({ token: 'string', foreground: strColor });
            if (numColor) rules.push({ token: 'number', foreground: numColor });
            if (commentColor) rules.push({ token: 'comment', foreground: commentColor, fontStyle: 'italic' });
            if (varColor) rules.push({ token: 'identifier', foreground: varColor });
        }

        const themeName = 'hw-' + (meta?.id || themeId);
        monaco.editor.defineTheme(themeName, {
            base: def.base || 'vs-dark',
            inherit: def.inherit !== false,
            rules: rules,
            colors: colors
        });

        monaco.editor.setTheme(themeName);
    } catch (e) {
        console.error('Failed to load editor theme:', e);
        monaco.editor.setTheme('vs-dark');
    }
}

async function initEditorThemes() {
    document.addEventListener('theme:changed', (e) => {
        applyEditorTheme(e.detail.id);
    });

    if (typeof monaco !== 'undefined' && monaco.editor) {
        applyEditorTheme(typeof currentThemeId !== 'undefined' ? currentThemeId : 'hollywood-novo');
    } else {
        document.addEventListener('monaco:ready', () => {
            applyEditorTheme(typeof currentThemeId !== 'undefined' ? currentThemeId : 'hollywood-novo');
        }, { once: true });
    }
}

document.addEventListener('DOMContentLoaded', initEditorThemes);
