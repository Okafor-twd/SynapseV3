const { app, BrowserWindow, ipcMain, shell, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const net = require('net');
const SynzApi = require('./API');

let mainWindow = null;

// Base directory where executable / app lives
const isPackaged = app.isPackaged;
const appDir = isPackaged ? path.dirname(process.execPath) : __dirname;

// ── Synapse v3 Directory Architecture & Auto-Initialization ────────────────
function copyDirIfMissing(src, dest) {
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
        try {
            fs.cpSync(src, dest, { recursive: true });
        } catch (e) {
            console.error(`[Init] Failed to copy ${src} to ${dest}:`, e);
        }
    }
}

function ensureAppDirectories() {
    const requiredDirs = [
        path.join(appDir, 'bin'),
        path.join(appDir, 'bin', 'lsp'),
        path.join(appDir, 'lsp'),
        path.join(appDir, 'config'),
        path.join(appDir, 'config', 'editor'),
        path.join(appDir, 'themes'),
        path.join(appDir, 'scripts'),
        path.join(appDir, 'workspace'),
        path.join(appDir, 'autoexec'),
        path.join(appDir, 'plugins'),
        path.join(appDir, 'logs')
    ];

    for (const dir of requiredDirs) {
        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        } catch (err) {
            console.error('[Init] Error creating directory:', dir, err);
        }
    }

    // Seed LSP if missing in appDir/bin/lsp or appDir/lsp
    const bundledLsp = path.join(__dirname, 'lsp');
    const destBinLsp = path.join(appDir, 'bin', 'lsp');
    const destLsp = path.join(appDir, 'lsp');
    if (fs.existsSync(bundledLsp)) {
        if (!fs.existsSync(path.join(destBinLsp, 'lsp-ws-proxy.exe'))) {
            copyDirIfMissing(bundledLsp, destBinLsp);
        }
        if (!fs.existsSync(path.join(destLsp, 'lsp-ws-proxy.exe'))) {
            copyDirIfMissing(bundledLsp, destLsp);
        }
    }

    // Seed themes if appDir/themes is empty
    const bundledThemes = path.join(__dirname, 'themes');
    if (fs.existsSync(bundledThemes) && appDir !== __dirname) {
        try {
            const files = fs.readdirSync(path.join(appDir, 'themes'));
            if (files.length === 0) {
                fs.cpSync(bundledThemes, path.join(appDir, 'themes'), { recursive: true });
            }
        } catch (_) {}
    }

    // Seed scripts if appDir/scripts is empty
    const bundledScripts = path.join(__dirname, 'scripts');
    if (fs.existsSync(bundledScripts) && appDir !== __dirname) {
        try {
            const files = fs.readdirSync(path.join(appDir, 'scripts'));
            if (files.length === 0) {
                fs.cpSync(bundledScripts, path.join(appDir, 'scripts'), { recursive: true });
            }
        } catch (_) {}
    }
}

// Automatically create and seed all directories at executable dir
ensureAppDirectories();

// ── Persistent settings store (JSON file in executable config dir) ────────────

const SETTINGS_KEYS = [
    'theme', 'editorFontSize', 'wordWrap', 'pluginsEnabled', 'bookmarks',
    'navbarStyle', 'sidebarLayout', 'actionbarDirection', 'interfaceScale', 'language'
];

function configDir() {
    const dir = path.join(appDir, 'config');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function settingsFile() {
    return path.join(configDir(), 'settings.json');
}

function readSettings() {
    try {
        const file = settingsFile();
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        const legacyFile = path.join(app.getPath('userData'), 'settings.json');
        if (fs.existsSync(legacyFile)) {
            const data = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
            writeSettings(data);
            return data;
        }
        return {};
    } catch {
        return {};
    }
}

function writeSettings(data) {
    try {
        fs.mkdirSync(configDir(), { recursive: true });
        fs.writeFileSync(settingsFile(), JSON.stringify(data, null, 4), 'utf8');
    } catch (e) {
        console.error('Error writing settings.json:', e);
    }
}

function getSetting(key, fallback = null) {
    const data = readSettings();
    return key in data ? data[key] : fallback;
}

function setSetting(key, value) {
    const data = readSettings();
    data[key] = value;
    writeSettings(data);
}

// ── Theme helpers ────────────────────────────────────────────────────────────

const THEMES_ROOT = path.join(__dirname, 'assets', 'styles', 'default-themes');
const CUSTOM_THEMES_ROOT = path.join(appDir, 'themes');

let sass = null;
try {
    sass = require('sass');
} catch (_) {}

function getCompiledThemesTempDir() {
    const tempDir = path.join(app.getPath('temp'), 'synapse-compiled-themes');
    try {
        fs.mkdirSync(tempDir, { recursive: true });
    } catch (_) {}
    return tempDir;
}

function clearCompiledThemesTemp() {
    try {
        const tempDir = path.join(app.getPath('temp'), 'synapse-compiled-themes');
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log('[Theme Compiler] Cleared compiled themes temp directory');
        }
    } catch (err) {
        console.error('[Theme Compiler] Error clearing temp themes directory:', err);
    }
}

const FILL_PATH = path.join(__dirname, 'assets', 'styles', 'hollywood-fill.scss');
let cachedFill = null;
function getHollywoodFill() {
    if (!cachedFill && fs.existsSync(FILL_PATH)) {
        try {
            cachedFill = fs.readFileSync(FILL_PATH, 'utf8');
        } catch (_) {}
    }
    return cachedFill || '';
}

function compileCustomThemeScss(themeDir, themeId) {
    if (!sass || !fs.existsSync(themeDir)) return null;
    try {
        const files = fs.readdirSync(themeDir);
        const scssFile = files.find(f => f.endsWith('.scss'));
        if (!scssFile) return null;

        const scssPath = path.join(themeDir, scssFile);
        const tempDir = getCompiledThemesTempDir();
        const cssOutPath = path.join(tempDir, `${themeId}.css`);

        // 1. Delete previously compiled temp file if it exists
        if (fs.existsSync(cssOutPath)) {
            try { fs.unlinkSync(cssOutPath); } catch (_) {}
        }

        // 2. Remove any local compiled CSS file from the theme source folder
        const localCompiled = path.join(themeDir, scssFile.replace(/\.scss$/i, '.css'));
        if (fs.existsSync(localCompiled)) {
            try { fs.unlinkSync(localCompiled); } catch (_) {}
        }

        let raw = fs.readFileSync(scssPath, 'utf8');
        // Strip !important from fill's border-color declarations so that theme-defined
        // border-color !important (e.g. hazy-trip's white/black 3D bevels) always wins.
        // Without this, fill's .hw-multimenu .list .entry { border-color: $hw-border !important }
        // at specificity (0,3,0) beats theme's .entry { border-top-color: white !important } at (0,1,0).
        const fill = getHollywoodFill().replace(/border-color:\s*\$hw-border\s*!important/g, 'border-color: $hw-border');

        // Auto-heal SCSS typos commonly present in custom themes:
        // 1. Invalid trailing digits after rgb: e.g. rgb(189, 189, 189)3 -> rgb(189, 189, 189)
        raw = raw.replace(/rgb\(([^)]+)\)\d+/g, 'rgb($1)');
        // 2. Bare hex values missing #: e.g. $var: ffc86a; -> $var: #ffc86a;
        raw = raw.replace(/(\$[a-zA-Z0-9_-]+\s*:\s*)([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(\s*;)/g, '$1#$2$3');

        const source = raw.replace(/@use\s*['"]reset['"]\s*as\s*\*;\s*/g, '').replace('//@STITCH', fill);

        const loadPaths = [
            path.join(__dirname, 'assets', 'styles'),
            path.join(appDir, 'assets', 'styles'),
            themeDir
        ].filter(p => fs.existsSync(p));

        const result = sass.compileString(source, {
            loadPaths,
            quietDeps: true,
            functions: {
                'asset($name)': function(args) {
                    const assetRel = args[0].assertString('name').text;
                    const assetPath = path.resolve(themeDir, assetRel);
                    if (fs.existsSync(assetPath)) {
                        const ext = path.extname(assetPath).toLowerCase();
                        const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.svg' ? 'image/svg+xml' : ext === '.otf' ? 'font/otf' : ext === '.ttf' ? 'font/ttf' : ext === '.woff2' ? 'font/woff2' : 'application/octet-stream';
                        const b64 = fs.readFileSync(assetPath).toString('base64');
                        return new sass.SassString(`url("data:${mime};base64,${b64}")`, { quotes: false });
                    }
                    return new sass.SassString(`url("${assetRel}")`, { quotes: false });
                }
            }
        });

        let css = result.css;

        // In case any asset(...) was not parsed by Sass:
        css = css.replace(/asset\(\s*['"]?([^'")]+)['"]?\s*\)/g, (match, assetRel) => {
            const assetPath = path.resolve(themeDir, assetRel);
            if (fs.existsSync(assetPath)) {
                const ext = path.extname(assetPath).toLowerCase();
                const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.svg' ? 'image/svg+xml' : ext === '.otf' ? 'font/otf' : ext === '.ttf' ? 'font/ttf' : ext === '.woff2' ? 'font/woff2' : 'application/octet-stream';
                const b64 = fs.readFileSync(assetPath).toString('base64');
                return `url("data:${mime};base64,${b64}")`;
            }
            return `url("${assetRel}")`;
        });

        // Map html, body styling to #application so the theme's background ($hw-bg, e.g. #303841)
        // is always applied to the root application container, while keeping html/body
        // transparent for frameless/transparency support.
        css = css.replace(/(^|[\s,{])html,\s*body\s*\{([^}]*)\}/g, (match, prefix, rules) => {
            return `${prefix}html, body {\n  background: transparent !important;\n}\n#application {\n${rules}\n}`;
        });
        css = css.replace(/(?<!,\s*)(?<![\w-])body\s*\{([^}]*)\}/g, (match, rules) => {
            if (rules.includes('#console-body')) return match;
            return `#application {\n${rules}\n}`;
        });

        // Propagate application background to layout containers and settings pages
        css = css.replace(/(^|[\s,{])#application,\s*\.page-container,\s*\.editor-page,\s*\.editor-view(?=[\s,{])/g, '$1#application, $1.page-container, $1.editor-page, $1.editor-view, $1.main-container, $1#content-area, $1#settings-pages');

        // Ensure custom sidebar border declarations (e.g. border-left: 1px solid #ffc86a) have !important
        css = css.replace(/(\.sidebar\s*\{[^}]*?border-(?:left|right)\s*:\s*[^;!]+)(;|\})/g, '$1 !important$2');
        // Map .action-bar rules to .action-bar, #actions, and .editor-view .action-bar
        css = css.replace(/(^|[\s,{])\.action-bar(?=[\s,{])/g, '$1.action-bar, $1#actions, $1.editor-view .action-bar');
        // Map .tabs-container rules to both .tabs-container and .editor-view .tabs-container
        css = css.replace(/(^|[\s,{])\.tabs-container(?=[\s,{])/g, '$1.tabs-container, $1.editor-view .tabs-container');
        // Map .action-list button rules to both .action-list button and .action-list .hw-button
        css = css.replace(/(^|[\s,{])\.action-list\s+button(?=[\s,{])/g, '$1.action-list button, $1.action-list .hw-button');

        // Map root-level .entry rules to .hw-multimenu .list .entry so theme's 3D beveled borders win
        css = css.replace(/(^|[\n}])\s*\.entry\s*\{/g, '$1\n.entry, .hw-multimenu .list .entry {');
        css = css.replace(/(^|[\n}])\s*\.entry:active\s*\{/g, '$1\n.entry:active, .hw-multimenu .list .entry:active {');

        // Promote theme-defined border-color rules to !important so they always win
        css = css.replace(/(\.editor-view\s+\.tabs-container[^{]*\{[^}]*?border-color:\s*[^;!]+)(;|\})/g, '$1 !important$2');
        css = css.replace(/(\.editor-view\s+\.action-bar[^{]*\{[^}]*?border-color:\s*[^;!]+)(;|\})/g, '$1 !important$2');
        css = css.replace(/(\.sidebar[^{]*\{[^}]*?border-color:\s*[^;!]+)(;|\})/g, '$1 !important$2');
        css = css.replace(/(#actions[^{]*\{[^}]*?border-color:\s*[^;!]+)(;|\})/g, '$1 !important$2');

        const bgMatch = raw.match(/\$hw-bg\s*:\s*([^;!]+)/);
        if (bgMatch) {
            const bgVal = bgMatch[1].trim();
            css += `\n#application, :root { --hw-bg: ${bgVal}; background-color: ${bgVal} !important; }\n`;
        }

        fs.writeFileSync(cssOutPath, css, 'utf8');
        console.log(`[Theme Compiler] Successfully compiled ${themeId} to temp: ${cssOutPath}`);
        return cssOutPath;
    } catch (err) {
        console.error(`[Theme Compiler] Error compiling SCSS for ${themeId}:`, err.message);
        return null;
    }
}

function listAllThemes() {
    const themeRoots = [THEMES_ROOT, CUSTOM_THEMES_ROOT];
    const themes = [];
    const seen = new Set();

    themeRoots.forEach(root => {
        if (!fs.existsSync(root)) return;
        try {
            const entries = fs.readdirSync(root, { withFileTypes: true });
            for (const dirent of entries) {
                if (!dirent.isDirectory()) continue;
                const folderName = dirent.name;
                const lowerFolderName = folderName.toLowerCase();
                if (seen.has(lowerFolderName)) continue;
                seen.add(lowerFolderName);

                const themeDir = path.join(root, folderName);
                let meta = null;
                const metaPath = path.join(themeDir, 'theme.json');
                if (fs.existsSync(metaPath)) {
                    try {
                        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    } catch (_) {}
                }
                if (!meta) {
                    const formatted = folderName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    meta = { id: folderName, name: formatted };
                }
                const themeId = meta.id || folderName;
                if (!meta.id) meta.id = themeId;
                if (!meta.name) {
                    meta.name = folderName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                }

                // 1. Check prebuilt CSS
                const prebuilt1 = path.join(__dirname, 'assets', 'styles', 'prebuilt', `_prebuilt-${themeId}.css`);
                const prebuilt2 = path.join(__dirname, 'assets', 'styles', 'prebuilt', `_prebuilt-${folderName}.css`);
                let cssPath = null;
                if (fs.existsSync(prebuilt1)) cssPath = prebuilt1;
                else if (fs.existsSync(prebuilt2)) cssPath = prebuilt2;

                // 2. Check CSS files in theme directory (e.g. themes/brasil/brasil.css)
                if (!cssPath) {
                    try {
                        const files = fs.readdirSync(themeDir);
                        const cssFile = files.find(f => f.endsWith('.css'));
                        if (cssFile) cssPath = path.join(themeDir, cssFile);
                    } catch (_) {}
                }

                // 3. Check for .scss and compile to Windows Temp directory
                if (!cssPath) {
                    try {
                        const files = fs.readdirSync(themeDir);
                        const scssFile = files.find(f => f.endsWith('.scss'));
                        if (scssFile) {
                            cssPath = compileCustomThemeScss(themeDir, themeId);
                        }
                    } catch (_) {}
                }

                let icons = {};
                const iconsPath = path.join(themeDir, 'icons.json');
                if (fs.existsSync(iconsPath)) {
                    try {
                        icons = JSON.parse(fs.readFileSync(iconsPath, 'utf8'));
                    } catch (_) {}
                }

                let editorTheme = null;
                const editorPath = path.join(themeDir, 'editor.json');
                if (fs.existsSync(editorPath)) {
                    try {
                        editorTheme = JSON.parse(fs.readFileSync(editorPath, 'utf8'));
                    } catch (_) {}
                }

                let cssContent = null;
                if (cssPath && fs.existsSync(cssPath)) {
                    try {
                        cssContent = fs.readFileSync(cssPath, 'utf8');
                    } catch (_) {}
                }

                const isCustom = !cssPath || (!cssPath.includes('prebuilt'));

                themes.push({
                    id: themeId,
                    folderName,
                    name: meta.name,
                    meta,
                    icons,
                    editorTheme,
                    themeDir: themeDir,
                    cssPath: cssPath ? cssPath.replace(/\\/g, '/') : null,
                    cssContent,
                    cssExists: !!cssPath,
                    isCustom,
                });
            }
        } catch (e) {
            console.error(`Error listing themes from ${root}:`, e);
        }
    });

    return themes;
}

function loadThemeMeta(themeId) {
    const themes = listAllThemes();
    let found = themes.find(t => 
        t.id.toLowerCase() === themeId.toLowerCase() || 
        (t.folderName && t.folderName.toLowerCase() === themeId.toLowerCase()) ||
        (t.meta && t.meta.id && t.meta.id.toLowerCase() === themeId.toLowerCase())
    );

    if (found) {
        if (found.isCustom) {
            const themeDir = found.themeDir;
            if (themeDir && fs.existsSync(themeDir)) {
                const files = fs.readdirSync(themeDir);
                const scssFile = files.find(f => f.endsWith('.scss'));
                if (scssFile) {
                    // Recompile fresh on theme switch / load
                    const tempCss = compileCustomThemeScss(themeDir, found.id);
                    if (tempCss) {
                        found.cssPath = tempCss.replace(/\\/g, '/');
                        found.cssExists = true;
                        try {
                            found.cssContent = fs.readFileSync(tempCss, 'utf8');
                        } catch (_) {}
                    }
                } else {
                    const cssFile = files.find(f => f.endsWith('.css'));
                    if (cssFile) {
                        const directCss = path.join(themeDir, cssFile);
                        found.cssPath = directCss.replace(/\\/g, '/');
                        found.cssExists = true;
                        try {
                            found.cssContent = fs.readFileSync(directCss, 'utf8');
                        } catch (_) {}
                    }
                }
            }
        }
        return found;
    }

    const prebuiltPath = path.join(__dirname, 'assets', 'styles', 'prebuilt', `_prebuilt-${themeId}.css`);
    const metaPath = path.join(THEMES_ROOT, themeId, 'theme.json');
    let meta = { id: themeId, name: themeId };
    try {
        if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch (_) {}

    let icons = {};
    const iconsPath = path.join(THEMES_ROOT, themeId, 'icons.json');
    try {
        if (fs.existsSync(iconsPath)) icons = JSON.parse(fs.readFileSync(iconsPath, 'utf8'));
    } catch (_) {}

    let editorTheme = null;
    const editorPath = path.join(THEMES_ROOT, themeId, 'editor.json');
    try {
        if (fs.existsSync(editorPath)) editorTheme = JSON.parse(fs.readFileSync(editorPath, 'utf8'));
    } catch (_) {}

    return {
        id: themeId,
        name: meta.name || themeId,
        meta,
        icons,
        editorTheme,
        cssPath: fs.existsSync(prebuiltPath) ? `assets/styles/prebuilt/_prebuilt-${themeId}.css` : null,
        cssExists: fs.existsSync(prebuiltPath),
        isCustom: false,
    };
}

// Scripts directory used by the "Local Filesystem" sidebar module
function scriptsDir() {
    let dir = getSetting('scriptsDir');
    if (!dir) {
        dir = path.join(appDir, 'scripts');
    }
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function createLoginWindow() {
    const win = new BrowserWindow({
        width: 942,
        height: 555,
        frame: false,
        resizable: false,
        transparent: true,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        show: false,
        icon: path.join(__dirname, 'assets', 'tray.ico'),
    });

    win.loadFile('login.html');
    win.once('ready-to-show', () => win.show());

    // After login completes, open the main window
    ipcMain.once('login:complete', () => {
        openMainWindow();
        win.close();
    });

    return win;
}

// ── Window State Store (config/windows.json with protocol "2") ──────────────

function windowsConfigPath() {
    return path.join(configDir(), 'windows.json');
}

function readWindowsConfig() {
    try {
        const file = windowsConfigPath();
        if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            return data.value || {};
        }
    } catch (e) {
        console.error('Error reading windows.json:', e);
    }
    return {
        editor: { x: -1, y: -1, width: 942, height: 555, maximized: false },
        console: { width: 700, height: 500, x: -1, y: -1, maximized: false }
    };
}

function saveWindowsConfig(editorBounds, isMaximized) {
    try {
        const current = readWindowsConfig();
        current.editor = {
            x: editorBounds.x,
            y: editorBounds.y,
            width: editorBounds.width,
            height: editorBounds.height,
            maximized: isMaximized
        };
        if (!current.console) {
            current.console = {
                width: 700,
                height: 500,
                x: -1,
                y: -1,
                maximized: false
            };
        }
        const doc = {
            protocol: "2",
            value: current
        };
        fs.writeFileSync(windowsConfigPath(), JSON.stringify(doc, null, 4), 'utf8');
    } catch (e) {
        console.error('Error saving windows.json:', e);
    }
}

let normalBounds = { x: -1, y: -1, width: 942, height: 555 };

function openMainWindow() {
    const isTransparent = getSetting('transparent_window', false) === true;
    const winConfig = readWindowsConfig();
    const editorState = winConfig.editor || { x: -1, y: -1, width: 942, height: 555, maximized: false };

    const winOptions = {
        width: editorState.width || 942,
        height: editorState.height || 555,
        minWidth: 700,
        minHeight: 400,
        frame: false,
        transparent: isTransparent,
        backgroundColor: isTransparent ? '#00000000' : '#1c1917',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        show: false,
        icon: path.join(__dirname, 'assets', 'tray.ico'),
    };

    if (editorState.x !== undefined && editorState.x !== -1 && editorState.y !== undefined && editorState.y !== -1) {
        winOptions.x = editorState.x;
        winOptions.y = editorState.y;
    }

    mainWindow = new BrowserWindow(winOptions);

    if (editorState.maximized) {
        mainWindow.maximize();
    }

    const distHtml = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(distHtml)) {
        mainWindow.loadFile(distHtml);
    } else {
        mainWindow.loadFile('index.html');
    }

    let hasShown = false;
    const revealMainWindow = () => {
        if (hasShown || !mainWindow || mainWindow.isDestroyed()) return;
        hasShown = true;
        mainWindow.show();
        watchScriptsDir();
        watchThemesDir();
        updateAttachStatus();

        if (getSetting('show_console_at_launch', false) === true) {
            setTimeout(() => {
                openConsoleWindow();
            }, 600);
        }
    };

    mainWindow.once('ready-to-show', revealMainWindow);
    mainWindow.webContents.once('did-finish-load', revealMainWindow);
    setTimeout(revealMainWindow, 1200);

    const updateNormalBounds = () => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
            normalBounds = mainWindow.getBounds();
        }
    };

    mainWindow.on('resize', updateNormalBounds);
    mainWindow.on('move', updateNormalBounds);

    mainWindow.on('close', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const isMax = mainWindow.isMaximized();
            const bounds = isMax ? normalBounds : mainWindow.getBounds();
            saveWindowsConfig(bounds, isMax);
        }
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Console Window ───────────────────────────────────────────────────────────

let consoleWindow = null;
let consoleBounds = { x: -1, y: -1, width: 700, height: 500 };
const consoleLogBuffer = [];

function saveConsoleWindowsConfig(bounds, isMaximized) {
    try {
        const current = readWindowsConfig();
        current.console = {
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            maximized: isMaximized
        };
        const doc = {
            protocol: "2",
            value: current
        };
        fs.writeFileSync(windowsConfigPath(), JSON.stringify(doc, null, 4), 'utf8');
    } catch (e) {
        console.error('Error saving console windows.json:', e);
    }
}

function windowIconPath() {
    const ico = path.join(__dirname, 'assets', 'tray.ico');
    return fs.existsSync(ico) ? ico : undefined;
}

function formatConsoleTime(d = new Date()) {
    return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
}

function clampWindowBounds(x, y, width, height) {
    const w = Math.max(400, width || 700);
    const h = Math.max(250, height || 500);
    try {
        const displays = screen.getAllDisplays();
        const visible = displays.some((d) => {
            const a = d.workArea;
            return x < a.x + a.width && x + w > a.x && y < a.y + a.height && y + h > a.y;
        });
        if (visible) return { x, y, width: w, height: h };
        const nearest = screen.getDisplayNearestPoint({ x: x || 0, y: y || 0 }).workArea;
        return {
            x: Math.round(nearest.x + (nearest.width - w) / 2),
            y: Math.round(nearest.y + (nearest.height - h) / 2),
            width: w,
            height: h,
        };
    } catch (_) {
        return { x, y, width: w, height: h };
    }
}

function bringConsoleToFront() {
    if (!consoleWindow || consoleWindow.isDestroyed()) return;
    if (consoleWindow.isMinimized()) consoleWindow.restore();
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isAlwaysOnTop()) {
        consoleWindow.setAlwaysOnTop(true);
    } else {
        consoleWindow.setAlwaysOnTop(true, 'screen-saver');
        setTimeout(() => {
            if (consoleWindow && !consoleWindow.isDestroyed() && !(mainWindow && !mainWindow.isDestroyed() && mainWindow.isAlwaysOnTop())) {
                consoleWindow.setAlwaysOnTop(false);
            }
        }, 400);
    }
    consoleWindow.setOpacity(1);
    consoleWindow.show();
    consoleWindow.focus();
    try { consoleWindow.moveTop(); } catch (_) {}
}

function pushConsoleLog(msg) {
    if (!msg || typeof msg !== 'object') {
        msg = { level: 'print', text: String(msg ?? ''), time: formatConsoleTime() };
    }
    if (!msg.time) msg.time = formatConsoleTime();
    if (msg.level === 'warn') msg.level = 'warning';
    consoleLogBuffer.push(msg);
    if (consoleLogBuffer.length > 500) consoleLogBuffer.shift();
    if (consoleWindow && !consoleWindow.isDestroyed()) {
        try {
            consoleWindow.webContents.send('console:message', msg);
        } catch (_) {}
    }
}

function openConsoleWindow() {
    if (consoleWindow && !consoleWindow.isDestroyed()) {
        bringConsoleToFront();
        return true;
    }

    const winConfig = readWindowsConfig();
    const consoleState = winConfig.console || { x: -1, y: -1, width: 700, height: 500, maximized: false };
    let width = (consoleState.width && consoleState.width >= 300) ? consoleState.width : 700;
    let height = (consoleState.height && consoleState.height >= 200) ? consoleState.height : 500;

    let x;
    let y;
    if (typeof consoleState.x === 'number' && consoleState.x >= 0 && typeof consoleState.y === 'number' && consoleState.y >= 0) {
        const clamped = clampWindowBounds(consoleState.x, consoleState.y, width, height);
        x = clamped.x;
        y = clamped.y;
        width = clamped.width;
        height = clamped.height;
    } else if (mainWindow && !mainWindow.isDestroyed()) {
        const mb = mainWindow.getBounds();
        x = Math.round(mb.x + (mb.width - width) / 2);
        y = Math.round(mb.y + (mb.height - height) / 2);
        const clamped = clampWindowBounds(x, y, width, height);
        x = clamped.x;
        y = clamped.y;
        width = clamped.width;
        height = clamped.height;
    }

    // Opaque frameless window: a second transparent BrowserWindow on Windows
    // often never paints, which looks like the Console "does not open".
    const winOptions = {
        title: 'Console',
        width,
        height,
        minWidth: 400,
        minHeight: 250,
        frame: false,
        transparent: false,
        backgroundColor: '#1c1917',
        hasShadow: true,
        skipTaskbar: false,
        focusable: true,
        paintWhenInitiallyHidden: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
        },
        show: false,
    };
    if (typeof x === 'number' && typeof y === 'number') {
        winOptions.x = x;
        winOptions.y = y;
    }
    const iconPath = windowIconPath();
    if (iconPath) winOptions.icon = iconPath;

    consoleWindow = new BrowserWindow(winOptions);
    consoleWindow.setMenuBarVisibility(false);

    consoleBounds = { x: winOptions.x ?? -1, y: winOptions.y ?? -1, width, height };

    const consoleHtmlPath = path.join(__dirname, 'console', 'index.html');
    consoleWindow.loadFile(consoleHtmlPath).catch((err) => {
        console.error('[Console] loadFile failed:', err);
    });
    // Show immediately so a second-window paint bug cannot leave it hidden.
    try { consoleWindow.show(); } catch (_) {}

    let hasFlushedLogs = false;
    const revealConsoleWindow = () => {
        if (!consoleWindow || consoleWindow.isDestroyed()) return;
        if (consoleState.maximized && !consoleWindow.isMaximized()) {
            consoleWindow.maximize();
        }
        bringConsoleToFront();
        if (!hasFlushedLogs) {
            hasFlushedLogs = true;
            consoleLogBuffer.forEach(msg => {
                try {
                    consoleWindow.webContents.send('console:message', msg);
                } catch (_) {}
            });
        }
    };

    consoleWindow.once('ready-to-show', revealConsoleWindow);
    consoleWindow.webContents.once('did-finish-load', revealConsoleWindow);
    consoleWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
        console.error('[Console] did-fail-load', code, desc, url);
        revealConsoleWindow();
    });
    setTimeout(revealConsoleWindow, 250);
    setTimeout(revealConsoleWindow, 800);

    const updateConsoleBounds = () => {
        if (consoleWindow && !consoleWindow.isDestroyed() && !consoleWindow.isMaximized()) {
            consoleBounds = consoleWindow.getBounds();
        }
    };

    consoleWindow.on('resize', updateConsoleBounds);
    consoleWindow.on('move', updateConsoleBounds);

    consoleWindow.on('close', () => {
        if (consoleWindow && !consoleWindow.isDestroyed()) {
            const isMax = consoleWindow.isMaximized();
            const bounds = isMax ? consoleBounds : consoleWindow.getBounds();
            saveConsoleWindowsConfig(bounds, isMax);
        }
    });

    consoleWindow.on('closed', () => {
        consoleWindow = null;
    });
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.on('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
});

ipcMain.on('window:close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) {
        if (win === mainWindow) {
            const isMax = mainWindow.isMaximized();
            const bounds = isMax ? normalBounds : mainWindow.getBounds();
            saveWindowsConfig(bounds, isMax);
        } else if (win === consoleWindow) {
            const isMax = consoleWindow.isMaximized();
            const bounds = isMax ? consoleBounds : consoleWindow.getBounds();
            saveConsoleWindowsConfig(bounds, isMax);
        }
        win.close();
    }
});

ipcMain.on('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    win.isMaximized() ? win.unmaximize() : win.maximize();
});

ipcMain.on('window:is-maximized', (e) => {
    e.returnValue = BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false;
});

ipcMain.on('window:set-always-on-top', (e, flag) => {
    BrowserWindow.fromWebContents(e.sender)?.setAlwaysOnTop(!!flag);
});

ipcMain.on('shell:open-path', (e, filePath) => {
    shell.openPath(filePath);
});

// Changelog reader
ipcMain.handle('app:get-changelog', async () => {
    const changelogPaths = [
        path.join(appDir, 'CHANGELOG.md'),
        path.join(__dirname, 'CHANGELOG.md'),
        path.join(appDir, 'changelog.md'),
        path.join(__dirname, 'changelog.md')
    ];
    for (const p of changelogPaths) {
        if (fs.existsSync(p)) {
            try {
                return fs.readFileSync(p, 'utf8');
            } catch (_) {}
        }
    }
    return '';
});

// Network Raw Text Fetch (for bookmarks / gists without CORS/CSP restrictions)
ipcMain.handle('net:fetch-url', async (_e, targetUrl) => {
    try {
        if (!targetUrl || typeof targetUrl !== 'string') return { ok: false, status: 0, text: '' };
        const https = require('https');
        const http = require('http');
        
        function fetchContent(urlStr, redirects = 0) {
            return new Promise((resolve) => {
                if (redirects > 5) return resolve({ ok: false, status: 310, text: '' });
                try {
                    const client = urlStr.startsWith('http:') ? http : https;
                    const req = client.get(urlStr, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SynapseX/3.0',
                            'Accept': 'text/plain, text/html, */*'
                        }
                    }, (res) => {
                        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
                            let loc = res.headers.location;
                            if (!loc.startsWith('http')) {
                                const u = new URL(urlStr);
                                loc = new URL(loc, u.origin).href;
                            }
                            return resolve(fetchContent(loc, redirects + 1));
                        }
                        let data = '';
                        res.setEncoding('utf8');
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, text: data }));
                        res.on('error', (err) => resolve({ ok: false, status: 0, text: '', error: err.message }));
                    });
                    req.on('error', (err) => resolve({ ok: false, status: 0, text: '', error: err.message }));
                    req.setTimeout(10000, () => {
                        req.destroy();
                        resolve({ ok: false, status: 408, text: '', error: 'Timeout' });
                    });
                } catch (err) {
                    resolve({ ok: false, status: 0, text: '', error: err.message });
                }
            });
        }

        return await fetchContent(targetUrl);
    } catch (_) {
        return { ok: false, status: 0, text: '' };
    }
});

// Settings
ipcMain.handle('settings:get', (e, key, fallback) => getSetting(key, fallback));
ipcMain.on('settings:set', (e, key, value) => {
    setSetting(key, value);
    if (key === 'theme') {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('themes:changed', value);
        }
        if (consoleWindow && !consoleWindow.isDestroyed()) {
            consoleWindow.webContents.send('themes:changed', value);
        }
    }
});

// Themes
ipcMain.handle('themes:list', async () => {
    try {
        return listAllThemes();
    } catch (e) {
        console.error('Error in themes:list:', e);
        return [];
    }
});
ipcMain.handle('theme:load', async (e, themeId) => {
    try {
        return loadThemeMeta(themeId);
    } catch (e) {
        console.error(`Error in theme:load ${themeId}:`, e);
        return null;
    }
});

// Console IPC
ipcMain.handle('console:open', () => {
    openConsoleWindow();
    return true;
});
ipcMain.on('console:open', () => {
    openConsoleWindow();
});

ipcMain.on('console:log', (_e, msg) => {
    if (!msg) return;
    pushConsoleLog(msg);
});

ipcMain.on('console:flush', (e) => {
    consoleLogBuffer.forEach(msg => {
        try {
            e.sender.send('console:message', msg);
        } catch (_) {}
    });
});

// ── Synapse Z Integration (V1 & V2 RS API) ──────────────────────────────────
let isSynzAttached = false;

function sendToRenderer(channel, ...args) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args);
    }
}

function updateAttachStatus() {
    const instances = SynzApi.SynapseZAPI2.getInstances();
    const attached = instances.size > 0 || SynzApi.GetSynzRobloxInstances().length > 0;
    if (attached !== isSynzAttached) {
        isSynzAttached = attached;
        sendToRenderer('client:attach-status', isSynzAttached);
    }
}

function isSessionNotificationsEnabled() {
    return getSetting('session_notifications', true) !== false && globalSettings.session_notifications !== false;
}

// Track session_notifications setting from renderer via IPC
let globalSettings = { session_notifications: true };
ipcMain.on('settings:set', (_e, key, value) => {
    if (key === 'session_notifications') {
        globalSettings.session_notifications = value !== false && value !== 'false';
    }
});

SynzApi.SynapseZAPI2.onSessionAdded((session) => {
    updateAttachStatus();
    sendToRenderer('client:session-added', session.pid);

    pushConsoleLog({
        level: 'info',
        text: `[Synapse Z] Attached to Roblox instance (PID: ${session.pid})`,
        time: formatConsoleTime(),
    });

    // HW.addMessage notification (respects session_notifications setting)
    if (isSessionNotificationsEnabled()) {
        const pid = session.pid;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(`
                (function() {
                    try {
                        const i18n = window._i18n || window.i18n || null;
                        const t = (key, def) => (i18n && i18n.t ? i18n.t(key, def) : def);
                        window.HW && window.HW.addMessage({
                            header: t('clients-session-added', 'Session Added'),
                            desc: t('clients-session-added-body', 'The session with the PID: "{pid}" has been added to the Client page.').replace('{pid}', ${JSON.stringify(String(pid))}),
                            icon: 'fluent:desktop-arrow-down-20-filled',
                            state: 'done',
                            autoDismiss: 4000,
                        });
                    } catch(_) {}
                })();
            `).catch(() => {});
        }
    }
});

SynzApi.SynapseZAPI2.onSessionRemoved((session) => {
    updateAttachStatus();
    sendToRenderer('client:session-removed', session.pid);

    pushConsoleLog({
        level: 'warning',
        text: `[Synapse Z] Detached from Roblox instance (PID: ${session.pid})`,
        time: formatConsoleTime(),
    });

    // HW.addMessage notification (respects session_notifications setting)
    if (isSessionNotificationsEnabled()) {
        const pid = session.pid;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(`
                (function() {
                    try {
                        const i18n = window._i18n || window.i18n || null;
                        const t = (key, def) => (i18n && i18n.t ? i18n.t(key, def) : def);
                        window.HW && window.HW.addMessage({
                            header: t('clients-session-removed', 'Session Removed'),
                            desc: t('clients-session-removed-body', 'The session with the PID: "{pid}" has been removed from the Client page.').replace('{pid}', ${JSON.stringify(String(pid))}),
                            icon: 'fluent:desktop-arrow-up-20-filled',
                            state: 'warning',
                            autoDismiss: 4000,
                        });
                    } catch(_) {}
                })();
            `).catch(() => {});
        }
    }
});

SynzApi.SynapseZAPI2.onSessionOutput((session, outType, output) => {
    // RS API output types: 0=print, 1=info, 2=warn, 3=error
    let level;
    switch (outType) {
        case 0:  level = 'print';   break;
        case 1:  level = 'info';    break;
        case 2:  level = 'warning'; break;
        case 3:  level = 'error';   break;
        default: level = 'print';   break;
    }
    pushConsoleLog({
        level,
        text: `[PID ${session.pid}] ${output}`,
        time: formatConsoleTime(),
    });
});

// Automatically poll for Synapse Z instances
SynzApi.SynapseZAPI2.startInstancesTimer(2000);

ipcMain.handle('client:get-attach-status', () => {
    const instances = SynzApi.SynapseZAPI2.getInstances();
    if (instances.size > 0) return true;
    return SynzApi.GetSynzRobloxInstances().length > 0;
});

ipcMain.handle('client:get-sessions', () => {
    // Returns an array of PIDs for all currently active sessions
    const instances = SynzApi.SynapseZAPI2.getInstances();
    return Array.from(instances.keys());
});

// Editor
ipcMain.on('editor:execute', (e, source) => {
    const scriptText = String(source || '').trim();
    if (!scriptText) {
        console.log('[editor:execute] ignoring blank script');
        return;
    }
    const scriptLen = scriptText.length;
    console.log(`[editor:execute] executing ${scriptLen} bytes via Synapse Z API`);

    // Execute via Synapse Z API (broadcasts to connected sessions & scheduler folder)
    const result = SynzApi.SynapseZAPI2.execute(scriptText, 0);

    e.sender.send('editor:executed');

    pushConsoleLog({
        level: result === 0 ? 'info' : 'error',
        text: result === 0
            ? `[Execution] Script executed (${scriptLen} bytes)`
            : `[Execution] Failed: ${SynzApi.GetLatestErrorMessage()}`,
        time: formatConsoleTime(),
    });
});

// File open/save dialogs
ipcMain.handle('dialog:open-file', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const result = await dialog.showOpenDialog(win, {
        title: 'Open script',
        defaultPath: scriptsDir(),
        filters: [{ name: 'Lua scripts', extensions: ['lua', 'txt'] }, { name: 'All files', extensions: ['*'] }],
        properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    try {
        return { filePath, name: path.basename(filePath), content: fs.readFileSync(filePath, 'utf8') };
    } catch {
        return null;
    }
});

ipcMain.handle('dialog:save-file', async (e, content, existingPath) => {
    try {
        if (existingPath && typeof existingPath === 'string' && existingPath.trim()) {
            let targetPath = existingPath.trim();
            if (!path.isAbsolute(targetPath)) {
                targetPath = path.join(scriptsDir(), targetPath);
            }
            const parentDir = path.dirname(targetPath);
            if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
            }
            fs.writeFileSync(targetPath, String(content ?? ''), 'utf8');
            return { filePath: targetPath, name: path.basename(targetPath) };
        }

        const win = BrowserWindow.fromWebContents(e.sender);
        const result = await dialog.showSaveDialog(win, {
            title: 'Save script',
            defaultPath: path.join(scriptsDir(), 'script.lua'),
            filters: [{ name: 'Lua scripts', extensions: ['lua', 'luau', 'txt'] }, { name: 'All files', extensions: ['*'] }],
        });
        if (result.canceled || !result.filePath) return null;
        fs.writeFileSync(result.filePath, String(content ?? ''), 'utf8');
        return { filePath: result.filePath, name: path.basename(result.filePath) };
    } catch (err) {
        console.error('Error in dialog:save-file:', err);
        return null;
    }
});

// Local filesystem sidebar module (recursive directory scanner)
function scanScriptsDir(dirPath) {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries
            .map(dirent => {
                const fullPath = path.join(dirPath, dirent.name);
                if (dirent.isDirectory()) {
                    return {
                        name: dirent.name,
                        path: fullPath,
                        isDirectory: true,
                        children: scanScriptsDir(fullPath),
                    };
                } else {
                    return {
                        name: dirent.name,
                        path: fullPath,
                        isDirectory: false,
                    };
                }
            })
            .sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });
    } catch {
        return [];
    }
}

ipcMain.handle('fs:list-scripts', () => {
    return scanScriptsDir(scriptsDir());
});

ipcMain.handle('fs:read-script', (e, filePath) => {
    try {
        return { name: path.basename(filePath), content: fs.readFileSync(filePath, 'utf8') };
    } catch {
        return null;
    }
});

ipcMain.handle('fs:save-script', (e, filePath, content) => {
    try {
        let targetPath = filePath;
        if (!path.isAbsolute(targetPath)) {
            targetPath = path.join(scriptsDir(), targetPath);
        }
        const parentDir = path.dirname(targetPath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(targetPath, String(content ?? ''), 'utf8');
        return { ok: true, filePath: targetPath, name: path.basename(targetPath) };
    } catch (err) {
        console.error('fs:save-script error:', err);
        return { ok: false, error: err.message };
    }
});

ipcMain.handle('fs:delete-item', (e, targetPath) => {
    try {
        if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
            return true;
        }
        return false;
    } catch (err) {
        console.error('fs:delete-item error:', err);
        return false;
    }
});

ipcMain.handle('shell:show-in-folder', () => scriptsDir());
ipcMain.on('shell:show-item-in-folder', (_, targetPath) => {
    if (targetPath) shell.showItemInFolder(targetPath);
});
ipcMain.on('shell:open-path', (_, targetPath) => {
    if (targetPath) shell.openPath(targetPath);
});
ipcMain.on('shell:open-external', (_, url) => {
    if (url && typeof url === 'string') shell.openExternal(url);
});

// ── Editor Config Helpers (config/editor/*.json with protocol "1") ───────────

function editorConfigPath(name) {
    const dir = path.join(configDir(), 'editor');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${name}.json`);
}

function readEditorConfig(name, fallback = {}) {
    try {
        const file = editorConfigPath(name);
        if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            return data.value !== undefined ? data.value : data;
        }
    } catch (e) {
        console.error(`Error reading config ${name}:`, e);
    }
    return fallback;
}

function writeEditorConfig(name, value) {
    try {
        const file = editorConfigPath(name);
        const doc = {
            protocol: "1",
            value: value
        };
        fs.writeFileSync(file, JSON.stringify(doc, null, 4), 'utf8');
        return true;
    } catch (e) {
        console.error(`Error writing config ${name}:`, e);
        return false;
    }
}

ipcMain.handle('config:get-editor', (e, name) => {
    return readEditorConfig(name);
});

ipcMain.handle('config:set-editor', (e, name, value) => {
    return writeEditorConfig(name, value);
});

// Live file system watcher for scripts directory
let fsWatcher = null;
function watchScriptsDir() {
    if (fsWatcher) return;
    try {
        const dir = scriptsDir();
        fsWatcher = fs.watch(dir, { recursive: true }, () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('fs:changed');
            }
        });
    } catch (err) {
        console.error('watchScriptsDir error:', err);
    }
}

// Live file system watcher for themes directories
let themesWatcher = null;
let themesDebounce = null;
function watchThemesDir() {
    if (themesWatcher) return;
    try {
        const roots = [THEMES_ROOT, CUSTOM_THEMES_ROOT];
        roots.forEach(root => {
            if (!fs.existsSync(root)) {
                try { fs.mkdirSync(root, { recursive: true }); } catch (_) {}
            }
            if (fs.existsSync(root)) {
                fs.watch(root, { recursive: true }, (eventType, filename) => {
                    if (filename && (filename.endsWith('.css') || filename.endsWith('.tmp') || filename.startsWith('.'))) return;
                    clearTimeout(themesDebounce);
                    themesDebounce = setTimeout(() => {
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('themes:changed');
                        }
                    }, 500);
                });
            }
        });
        themesWatcher = true;
    } catch (err) {
        console.error('watchThemesDir error:', err);
    }
}

// ── Lua Language Server WebSocket Proxy (Synapse X v3 Architecture) ──────────
// Spawns lsp-ws-proxy.exe with PSK authentication and attaches to
// lua-language-server.exe main.lua in lsp/.

let lspProxyProc = null;
let lspWsInfo = null;

function getFreePort() {
    return new Promise((resolve) => {
        const srv = net.createServer();
        srv.listen(0, '127.0.0.1', () => {
            const port = srv.address().port;
            srv.close(() => resolve(port));
        });
        srv.on('error', () => resolve(6378));
    });
}

function getLspDir() {
    const candidates = [
        path.join(appDir, 'bin', 'lsp'),
        path.join(appDir, 'lsp'),
        path.join(appDir, 'bin', 'bin', 'lsp'),
        path.join(process.resourcesPath, 'lsp'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'lsp'),
        path.join(__dirname, 'lsp')
    ];
    for (const cand of candidates) {
        if (fs.existsSync(path.join(cand, 'lsp-ws-proxy.exe'))) {
            return cand;
        }
    }
    return path.join(appDir, 'bin', 'lsp');
}

async function startLSP() {
    if (lspWsInfo) return lspWsInfo;
    const lspDir = getLspDir();
    const proxyExe = path.join(lspDir, 'lsp-ws-proxy.exe');
    const serverExe = path.join(lspDir, 'lua-language-server.exe');

    if (!fs.existsSync(proxyExe) || !fs.existsSync(serverExe)) {
        console.error('[LSP] Executables not found in', lspDir);
        return null;
    }

    const port = await getFreePort();
    const key = crypto.randomBytes(32).toString('hex');

    try {
        lspProxyProc = spawn(proxyExe, [
            '--key', key,
            '--listen', `127.0.0.1:${port}`,
            '--',
            serverExe, 'main.lua'
        ], {
            cwd: lspDir,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });
    } catch (err) {
        console.error('[LSP] Failed to spawn LSP process:', err);
        return null;
    }

    lspProxyProc.on('error', (err) => {
        console.error('[LSP] Proxy error:', err);
        lspWsInfo = null;
    });

    lspProxyProc.stdout.on('data', d => {
        // debug logging if needed
    });
    lspProxyProc.stderr.on('data', d => console.error('[LSP stderr]', d.toString()));
    lspProxyProc.on('exit', () => {
        lspProxyProc = null;
        lspWsInfo = null;
    });

    lspWsInfo = {
        port,
        key,
        url: `ws://127.0.0.1:${port}/?auth=${key}`
    };

    return lspWsInfo;
}

function killLSP() {
    if (lspProxyProc) {
        try {
            lspProxyProc.kill();
        } catch (_) {}
        lspProxyProc = null;
        lspWsInfo = null;
    }
}

ipcMain.handle('lsp:get-ws-info', async () => {
    return await startLSP();
});

// Workspace root handed to the LSP (matches the sidebar "Local Filesystem" dir)
ipcMain.handle('lsp:workspace', () => scriptsDir());

// Synapse API definition folder shipped with the language server
ipcMain.handle('lsp:defdir', () => {
    const lspDir = getLspDir();
    return path.join(lspDir, 'def');
});

// ── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
    // If active saved theme is a custom SCSS theme, pre-compile it first into Windows Temp
    const savedTheme = getSetting('theme', 'hollywood-dark');
    try {
        loadThemeMeta(savedTheme);
    } catch (_) {}

    openMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) openMainWindow();
    });
});

app.on('will-quit', () => {
    clearCompiledThemesTemp();
    killLSP();
});

app.on('window-all-closed', () => {
    clearCompiledThemesTemp();
    killLSP();
    if (process.platform !== 'darwin') app.quit();
});


