/**
 * theme-engine.js
 * Theme loading and switching:
 *   - Reads theme.json metadata via IPC (theme:load)
 *   - Swaps the <link id="theme-style"> prebuilt stylesheet
 *   - Applies metric defaults as CSS variables (--ux-*)
 *   - Loads and maps theme icons dynamically (icons.json)
 *   - Persists the selection via settings:set
 */

const THEME_IDS = [
    'coolkid', 'elysian-fields', 'freeman', 'hollywood-classic', 'hollywood-dark',
    'hollywood-glass', 'hollywood-light', 'hollywood-novo', 'kyoto', 'neon',
    'seven', 'unikoi',
];

const themeMetas = {};   // id -> { id, name, ... }
let currentThemeId = 'hollywood-dark';

function applyMetrics(meta) {
    // Emit metric defaults as CSS variables on :root (e.g. --ux-button-padding-v)
    const metrics = meta.metrics || {};
    const vars = [];
    for (const [key, def] of Object.entries(metrics)) {
        const value = def && typeof def === 'object' && 'default' in def ? def.default : def;
        if (value !== undefined && value !== null) {
            vars.push(`--${key}: ${value}rem;`);
        }
    }
    let styleEl = document.getElementById('theme-metrics');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'theme-metrics';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = vars.length ? `:root { ${vars.join(' ')} }` : '';
}

const DEFAULT_ICONS = {
    '#execute-button iconify-icon': 'fluent:play-20-filled',
    '#clear-button iconify-icon': 'fluent:eraser-20-filled',
    '#openf-button iconify-icon': 'fluent:document-arrow-up-20-filled',
    '#executef-button iconify-icon': 'fluent:settings-20-filled',
    '#savef-button iconify-icon': 'fluent:save-20-filled',

    '#nav-editor iconify-icon': 'fluent:window-console-20-filled',
    '#nav-settings iconify-icon': 'fluent:settings-20-filled',
    '#nav-themes iconify-icon': 'fluent:paint-brush-20-filled',
    '#nav-plugins iconify-icon': 'fluent:puzzle-piece-20-filled',

    '.connection-toggle iconify-icon:not(.absolute)': 'fluent:plug-disconnected-20-filled',
    '#console-icon iconify-icon': 'fluent:pulse-square-20-regular',
    '#documentation-icon iconify-icon': 'fluent:search-square-20-regular',
    '#target-menu iconify-icon': 'fluent:flash-20-filled'
};

const ICON_MAPPINGS = [
    { selector: '#execute-button iconify-icon', keys: ['btn-execute', 'play'] },
    { selector: '#clear-button iconify-icon', keys: ['btn-clear'] },
    { selector: '#openf-button iconify-icon', keys: ['btn-file-open', 'folder-open'] },
    { selector: '#executef-button iconify-icon', keys: ['btn-file-execute', 'settings'] },
    { selector: '#savef-button iconify-icon', keys: ['btn-file-save'] },

    { selector: '#nav-editor iconify-icon', keys: ['page-editor'] },
    { selector: '#nav-settings iconify-icon', keys: ['page-settings'] },
    { selector: '#nav-themes iconify-icon', keys: ['page-customization'] },
    { selector: '#nav-plugins iconify-icon', keys: ['page-powertools'] },

    { selector: '.connection-toggle iconify-icon:not(.absolute)', keys: ['connection-disabled'] },
    { selector: '#console-icon iconify-icon', keys: ['console'] },
    { selector: '#documentation-icon iconify-icon', keys: ['documentation', 'page-documentation'] }
];

let currentThemeIcons = {};

function getThemeIcon(key, fallback) {
    if (currentThemeIcons && currentThemeIcons[key]) {
        return currentThemeIcons[key];
    }
    const meta = themeMetas[currentThemeId] || Object.values(themeMetas).find(m => m.id === currentThemeId || m.folderName === currentThemeId);
    if (meta && meta.icons && meta.icons[key]) {
        return meta.icons[key];
    }
    return fallback;
}
window.getThemeIcon = getThemeIcon;

async function loadThemeIcons(themeId) {
    let icons = {};
    const meta = themeMetas[themeId] || Object.values(themeMetas).find(m => m.id === themeId || m.folderName === themeId);
    if (meta && meta.icons && Object.keys(meta.icons).length > 0) {
        icons = meta.icons;
    } else {
        try {
            const res = await window.hwAPI?.loadTheme(themeId);
            if (res && res.icons) {
                icons = res.icons;
                if (meta) meta.icons = icons;
            }
        } catch (_) {}
    }
    currentThemeIcons = icons || {};

    ICON_MAPPINGS.forEach(({ selector, keys }) => {
        let iconToSet = null;
        for (const k of keys) {
            if (icons && icons[k]) {
                iconToSet = icons[k];
                break;
            }
        }
        if (!iconToSet) {
            iconToSet = DEFAULT_ICONS[selector];
        }

        if (iconToSet) {
            document.querySelectorAll(selector).forEach(el => {
                try { el.icon = iconToSet; } catch (_) {}
                el.setAttribute('icon', iconToSet);
            });
        }
    });
}

function applyThemeSettingOverrides(overrides) {
    if (!overrides) return;
    if (overrides.classiclayout !== undefined) {
        window.hwAPI?.setSetting('classic_layout', overrides.classiclayout);
        localStorage.setItem('synapse_setting_classic_layout', String(overrides.classiclayout));
        const cb = document.getElementById('setting-classic-layout');
        if (cb && window.setCheckbox) window.setCheckbox(cb, overrides.classiclayout);
        else if (window.applyClassicLayout) window.applyClassicLayout(overrides.classiclayout);
    }
    if (overrides.squaretabs !== undefined) {
        window.hwAPI?.setSetting('compact_tabs', overrides.squaretabs);
        localStorage.setItem('synapse_setting_compact_tabs', String(overrides.squaretabs));
        const cb = document.getElementById('setting-compact-tabs');
        if (cb && window.setCheckbox) window.setCheckbox(cb, overrides.squaretabs);
        else if (window.applyCompactTabs) window.applyCompactTabs(overrides.squaretabs);
    }
    if (overrides['actionbar-direction'] !== undefined) {
        window.hwAPI?.setSetting('actionbar_direction', overrides['actionbar-direction']);
        localStorage.setItem('synapse_setting_actionbar_direction', String(overrides['actionbar-direction']));
        if (window.selectOption) window.selectOption('actionbar-direction', overrides['actionbar-direction']);
    }
    if (overrides.navbarstyle !== undefined) {
        window.hwAPI?.setSetting('navbarstyle', String(overrides.navbarstyle));
        localStorage.setItem('synapse_setting_navbarstyle', String(overrides.navbarstyle));
        if (window.selectOption) window.selectOption('navbarstyle', overrides.navbarstyle);
    }
}

async function loadTheme(themeId, userInitiated = false) {
    let meta = themeMetas[themeId] || Object.values(themeMetas).find(m => m.id === themeId || m.folderName === themeId);
    if (!meta) {
        const res = await window.hwAPI?.loadTheme(themeId);
        if (res) {
            meta = {
                ...res.meta,
                ...res,
                id: res.id,
                name: res.name,
                icons: res.icons || {},
                editorTheme: res.editorTheme || (res.meta && res.meta.editorTheme) || null,
                cssPath: res.cssPath,
                cssAvailable: res.cssExists,
                isCustom: res.isCustom
            };
            themeMetas[res.id] = meta;
            themeMetas[themeId] = meta;
            if (res.folderName) themeMetas[res.folderName] = meta;
        }
    }
    if (!meta) return false;

    currentThemeId = meta.id;

    // If user explicitly picked this theme and it has special settingOverrides, prompt dialog
    if (userInitiated && meta.settingOverrides) {
        let confirmed = false;
        if (window.HWDialog && typeof window.HWDialog.confirmThemeOverrides === 'function') {
            confirmed = await window.HWDialog.confirmThemeOverrides();
        }
        if (confirmed) {
            applyThemeSettingOverrides(meta.settingOverrides);
        }
    }

    // Swap the stylesheet link to custom CSS or prebuilt CSS
    const link = document.getElementById('theme-style');
    if (link) {
        if (meta.cssPath) {
            const formatted = meta.cssPath.replace(/\\/g, '/');
            link.href = formatted.includes(':') && !formatted.startsWith('file:') 
                ? 'file:///' + formatted 
                : formatted;
        } else {
            link.href = `assets/styles/prebuilt/_prebuilt-${meta.id}.css`;
        }
    }

    // Apply metric defaults (button padding, border radius, etc.)
    applyMetrics(meta);

    // Apply icon overrides
    loadThemeIcons(meta.id || themeId);

    // Patch for Seven theme layout classes
    const appEl = document.getElementById('application');
    if (appEl) {
        if (meta.id === 'seven') {
            appEl.classList.add('window', 'glass', 'is-bright');
            document.querySelectorAll('.page-container, .hw-multimenu, .hw-multimenu .pages').forEach(el => el.classList.add('window-body'));
        } else {
            appEl.classList.remove('window', 'glass', 'is-bright');
            document.querySelectorAll('.page-container, .hw-multimenu, .hw-multimenu .pages').forEach(el => el.classList.remove('window-body'));
        }
    }

    // Apply editor theme syntax highlighting & background
    if (typeof applyEditorTheme === 'function') {
        applyEditorTheme(meta.id);
    }

    // Persist selection
    window.hwAPI?.setSetting('theme', meta.id);

    // Notify listeners (themes page updates the dropdown label/highlight)
    document.dispatchEvent(new CustomEvent('theme:changed', { detail: { id: meta.id, name: meta.name } }));
    return true;
}

async function refreshThemes() {
    try {
        const installedThemes = await window.hwAPI?.listThemes?.();
        if (installedThemes && Array.isArray(installedThemes) && installedThemes.length > 0) {
            installedThemes.forEach(t => {
                const data = {
                    ...t.meta,
                    ...t,
                    id: t.id,
                    folderName: t.folderName || t.id,
                    name: t.name,
                    icons: t.icons || (t.meta && t.meta.icons) || {},
                    editorTheme: t.editorTheme || (t.meta && t.meta.editorTheme) || null,
                    cssPath: t.cssPath,
                    cssAvailable: t.cssExists,
                    isCustom: t.isCustom
                };
                themeMetas[t.id] = data;
                if (t.folderName && t.folderName !== t.id) {
                    themeMetas[t.folderName] = data;
                }
            });
            document.dispatchEvent(new CustomEvent('themes:updated'));
            return true;
        }
    } catch (_) {}
    return false;
}

async function initThemeEngine() {
    const refreshed = await refreshThemes();
    if (!refreshed) {
        // Fallback: fetch metadata for default theme list
        await Promise.all(THEME_IDS.map(async (id) => {
            const result = await window.hwAPI?.loadTheme(id);
            if (result && result.meta) {
                themeMetas[id] = { ...result.meta, ...result, id, name: result.name || result.meta.name, icons: result.icons || {}, editorTheme: result.editorTheme || null, cssPath: result.cssPath, cssAvailable: result.cssExists };
            } else {
                themeMetas[id] = { id, name: id, icons: {}, editorTheme: null, cssAvailable: false };
            }
        }));
    }

    // Live update when custom themes are added to folder
    window.hwAPI?.onThemesChanged?.(async () => {
        await refreshThemes();
    });

    // Restore persisted theme (fallback: hollywood-dark)
    const saved = await window.hwAPI?.getSetting('theme', 'hollywood-dark');
    const initial = themeMetas[saved] ? saved : 'hollywood-dark';
    await loadTheme(initial);
}

document.addEventListener('DOMContentLoaded', initThemeEngine);
