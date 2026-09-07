# Changelog

## [3.0.0] - 2026-09-06

### Architecture
- Modern Electron + React 19 + Vite frontend
- Monaco editor with Luau syntax highlighting
- Lua Language Server (Luau LSP) via WebSocket proxy
- Multi-tab editor with dirty state tracking

### Themes & Customization
- Dynamic SCSS theme compiler with temp caching
- New community themes: Hazy Trips, Scarlet, Hollywood Fluent
- Full compatibility with Hollywood Dark, Light, Seven, Kyoto, Neon, Freeman, Elysian Fields, Unikoi, Coolkid
- Dynamic metric scaling per theme

### Layout & Controls
- Configurable action bar position (top/bottom) and alignment (left/right)
- Compact tabs and compact buttons modes
- Top or left navigation bar layouts
- Theme-respecting button typography via :where() fallbacks

### UI & Quality of Life
- Multi-language support (English, German, Hungarian, Filipino, Indonesian)
- Toast notifications with adjustable scaling
- Dedicated console window for script output
- Centralized settings for font size, tab length, minimap, word wrap, and more
