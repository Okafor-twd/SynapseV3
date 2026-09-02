const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('hwAPI', {
    // Window controls
    minimize: () => ipcRenderer.send('window:minimize'),
    close: () => ipcRenderer.send('window:close'),
    maximize: () => ipcRenderer.send('window:maximize'),
    isMaximized: () => ipcRenderer.sendSync('window:is-maximized'),
    setAlwaysOnTop: (flag) => ipcRenderer.send('window:set-always-on-top', flag),
    setZoomFactor: (factor) => webFrame.setZoomFactor(factor),

    // Login
    loginComplete: () => ipcRenderer.send('login:complete'),

    // Shell
    openPath: (p) => ipcRenderer.send('shell:open-path', p),
    openExternal: (url) => ipcRenderer.send('shell:open-external', url),
    showScriptsFolder: () => ipcRenderer.invoke('shell:show-in-folder'),
    showItemInFolder: (p) => ipcRenderer.send('shell:show-item-in-folder', p),

    // Settings (persistent via JSON file in userData)
    getSetting: (key, fallback) => ipcRenderer.invoke('settings:get', key, fallback),
    setSetting: (key, value) => ipcRenderer.send('settings:set', key, value),

    // Themes
    listThemes: () => ipcRenderer.invoke('themes:list'),
    loadTheme: (themeId) => ipcRenderer.invoke('theme:load', themeId),
    onThemesChanged: (cb) => ipcRenderer.on('themes:changed', () => cb()),

    // Editor
    execute: (source) => ipcRenderer.send('editor:execute', source),
    onExecuted: (cb) => ipcRenderer.on('editor:executed', cb),
    openFile: () => ipcRenderer.invoke('dialog:open-file'),
    saveFile: (content, existingPath) => ipcRenderer.invoke('dialog:save-file', content, existingPath),

    // Editor config files (config/editor/*.json)
    getEditorConfig: (name) => ipcRenderer.invoke('config:get-editor', name),
    setEditorConfig: (name, data) => ipcRenderer.invoke('config:set-editor', name, data),

    // Filesystem sidebar
    listScripts: () => ipcRenderer.invoke('fs:list-scripts'),
    readScript: (filePath) => ipcRenderer.invoke('fs:read-script', filePath),
    saveScript: (filePath, content) => ipcRenderer.invoke('fs:save-script', filePath, content),
    deleteScript: (filePath) => ipcRenderer.invoke('fs:delete-item', filePath),
    onFilesystemChanged: (cb) => ipcRenderer.on('fs:changed', () => cb()),

    // Console window
    openConsole: () => ipcRenderer.invoke('console:open'),
    onConsoleMessage: (cb) => ipcRenderer.on('console:message', (_e, msg) => cb(msg)),
    sendConsoleLog: (msg) => ipcRenderer.send('console:log', msg),
    flushConsoleLogs: () => ipcRenderer.send('console:flush'),

    // Lua Language Server bridge (lsp-ws-proxy WebSocket)
    getLspWsInfo: () => ipcRenderer.invoke('lsp:get-ws-info'),
    lspWorkspace: () => ipcRenderer.invoke('lsp:workspace'),
    lspDefDir: () => ipcRenderer.invoke('lsp:defdir'),

    // Network text fetch
    fetchUrl: (url) => ipcRenderer.invoke('net:fetch-url', url),
});
