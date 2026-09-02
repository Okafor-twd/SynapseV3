const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// 1. Copy assets folder to dist/assets/
const srcAssets = path.join(__dirname, 'assets');
const destAssets = path.join(distDir, 'assets');
if (fs.existsSync(srcAssets)) {
    fs.cpSync(srcAssets, destAssets, { recursive: true });
    console.log('[copy-assets] Copied assets/ -> dist/assets/');
}

// 2. Also copy assets to dist/assets/assets/ for relative CSS url('assets/...') resolution
const nestedAssets = path.join(destAssets, 'assets');
if (fs.existsSync(srcAssets)) {
    fs.cpSync(srcAssets, nestedAssets, { recursive: true });
    console.log('[copy-assets] Copied assets/ -> dist/assets/assets/');
}

// 3. Copy logo_white.svg to dist/root as fallback
const logoSrc = path.join(srcAssets, 'logo_white.svg');
if (fs.existsSync(logoSrc)) {
    fs.copyFileSync(logoSrc, path.join(distDir, 'logo_white.svg'));
}

// 4. Copy lsp/ folder to dist/lsp/ (for lsp/def/synapse.json)
const lspSrc = path.join(__dirname, 'lsp');
const lspDest = path.join(distDir, 'lsp');
if (fs.existsSync(lspSrc)) {
    fs.cpSync(lspSrc, lspDest, { recursive: true });
    console.log('[copy-assets] Copied lsp/ -> dist/lsp/');
}

// 5. Copy editor.worker.bundle.js
const workerSrc = path.join(__dirname, 'editor.worker.bundle.js');
const workerDest = path.join(distDir, 'editor.worker.bundle.js');
if (fs.existsSync(workerSrc)) {
    fs.copyFileSync(workerSrc, workerDest);
    console.log('[copy-assets] Copied editor.worker.bundle.js -> dist/');
}

// 6. Copy login.html
const loginSrc = path.join(__dirname, 'login.html');
const loginDest = path.join(distDir, 'login.html');
if (fs.existsSync(loginSrc)) {
    fs.copyFileSync(loginSrc, loginDest);
    console.log('[copy-assets] Copied login.html -> dist/');
}
