import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const preserveBackdropFilterPlugin = () => ({
    name: 'preserve-backdrop-filter',
    generateBundle(_, bundle) {
        for (const file of Object.values(bundle)) {
            if (file.type === 'asset' && file.fileName.endsWith('.css')) {
                file.source = file.source.replace(
                    /-webkit-backdrop-filter:\s*([^;]+);/g,
                    (match, val) => `backdrop-filter:${val};-webkit-backdrop-filter:${val};`
                );
            }
        }
    }
});

export default defineConfig({
    plugins: [react(), preserveBackdropFilterPlugin()],
    base: './',
    root: '.',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'chrome120',
        cssTarget: 'chrome120',
        rollupOptions: {
            input: path.resolve(__dirname, 'index.html'),
        },
    },
    server: {
        port: 5173,
    },
});
