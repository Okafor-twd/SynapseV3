/**
 * app.js
 * Main application controller:
 *   - Title bar window controls
 *   - Navigation bar page switching
 *   - Dynamic .hw-dialog popup system
 *   - Sidebar modules (Local Filesystem / Bookmarks / GitHub Gists)
 */

// ── Dialog System (.hw-dialog) ───────────────────────────────────────────────

const HWDialog = {
    /**
     * Spawn a themed dialog over the UI (in #canvas-dialog).
     * Returns a Promise resolving to { button, value } — value is the textbox
     * content when the dialog had a textbox, null otherwise. Rejecting is not
     * used; closing via backdrop resolves { button: -1 }.
     */
    spawn({ icon, iconColor = 'white', title, body, textbox = null, buttons = [] }) {
        return new Promise((resolve) => {
            const canvas = document.getElementById('canvas-dialog');
            if (!canvas) { resolve({ button: -1, value: null }); return; }

            // Backdrop
            const backdrop = document.createElement('div');
            backdrop.className = 'flex h-full w-full select-none items-center justify-center transition-colors pointer-events-auto bg-black/50 backdrop-blur-sm';

            const dlg = document.createElement('div');
            dlg.className = 'hw-dialog flex min-w-[24rem] flex-col rounded-lg';
            dlg.style.animation = '100ms ease-out 0s 1 normal forwards running elem-blur-in';

            // Content row
            const content = document.createElement('div');
            content.className = 'flex grow gap-4 p-4';

            if (icon) {
                const ic = document.createElement('iconify-icon');
                ic.setAttribute('icon', icon);
                ic.className = 'flex items-center justify-center translate-y-1 text-2xl';
                ic.style.color = iconColor;
                content.appendChild(ic);
            }

            const textCol = document.createElement('div');
            textCol.className = 'flex h-full flex-col gap-2';
            const caption = document.createElement('div');
            caption.className = 'caption align-top text-xl font-bold';
            caption.textContent = title;
            textCol.appendChild(caption);
            if (body) {
                const bodyEl = document.createElement('div');
                bodyEl.textContent = body;
                textCol.appendChild(bodyEl);
            }
            content.appendChild(textCol);
            dlg.appendChild(content);

            // Optional textbox row
            let input = null;
            if (textbox !== null) {
                const inputRow = document.createElement('div');
                inputRow.className = 'mx-2 mb-2';
                const box = document.createElement('div');
                box.className = 'hw-textbox rounded-md px-2 py-1';
                const inner = document.createElement('div');
                inner.className = 'inner flex items-center gap-2 border px-1 py-0.5';
                input = document.createElement('input');
                input.className = 'w-full border-none bg-transparent text-inherit outline-none';
                input.type = 'text';
                input.value = textbox || '';
                inner.appendChild(input);
                box.appendChild(inner);
                inputRow.appendChild(box);
                dlg.appendChild(inputRow);
            }

            // Buttons row
            const inputs = document.createElement('div');
            inputs.className = 'inputs flex h-16 w-full rounded-b-lg border-t px-2 py-4';
            const btnCluster = document.createElement('div');
            btnCluster.className = 'ml-auto flex gap-2';

            const finish = (index) => {
                dlg.style.animation = '100ms ease-in 0s 1 normal forwards running elem-blur-out';
                backdrop.style.transition = 'opacity 100ms ease-in';
                backdrop.style.opacity = '0';
                setTimeout(() => {
                    backdrop.remove();
                    resolve({ button: index, value: input ? input.value : null });
                }, 100);
            };

            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        finish(0);
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        finish(1);
                    }
                });
            }

            buttons.forEach((label, index) => {
                const btn = document.createElement('button');
                btn.className = 'hw-button relative flex select-none items-center justify-center gap-1 rounded-md px-2 py-1 cursor-default undefined';
                
                let translatedLabel = label;
                if (typeof window.i18n?.t === 'function') {
                    const normKey = 'dialog-' + String(label).trim().toLowerCase();
                    translatedLabel = window.i18n.t(normKey, label);
                }
                btn.textContent = translatedLabel;
                btn.addEventListener('click', () => finish(index));
                btnCluster.appendChild(btn);
            });

            inputs.appendChild(btnCluster);
            dlg.appendChild(inputs);
            backdrop.appendChild(dlg);
            backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) finish(-1); });
            canvas.appendChild(backdrop);

            // Autofocus textbox after the entry animation
            if (input) setTimeout(() => {
                input.focus();
                input.select();
            }, 120);
        });
    },

    /** "Rename tab" input dialog. Resolves the new title string or null. */
    promptRenameTab(currentTitle = '') {
        const title = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-renametab-title', 'Rename tab') : 'Rename tab';
        const body = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-renametab-body', 'Input the new tab name below.') : 'Input the new tab name below.';
        const okText = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-ok', 'Ok') : 'Ok';
        const cancelText = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-cancel', 'Cancel') : 'Cancel';
        return this.spawn({
            icon: 'fluent:edit-20-filled',
            iconColor: 'white',
            title,
            body,
            textbox: currentTitle,
            buttons: [okText, cancelText],
        }).then(({ button, value }) => (button === 0 && value && value.trim() ? value.trim() : null));
    },

    /** Generic confirmation dialog. Resolves true if confirmed (button 0), false otherwise. */
    confirm({ title, message, icon = 'fluent:warning-20-filled', iconColor = '#fbbf24', confirmText = null, cancelText = null }) {
        const confirmLabel = confirmText || ((typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-yes', 'Yes') : 'Yes');
        const cancelLabel = cancelText || ((typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-no', 'No') : 'No');
        return this.spawn({
            icon,
            iconColor,
            title,
            body: message,
            buttons: [confirmLabel, cancelLabel]
        }).then(({ button }) => button === 0);
    },

    /** "Erase unsaved content" confirmation. Resolves true when the user confirms. */
    confirmEraseUnsaved() {
        const title = (typeof window.i18n?.t === 'function') ? window.i18n.t('warning-erase-title', 'Erase unsaved content') : 'Erase unsaved content';
        const body = (typeof window.i18n?.t === 'function') ? window.i18n.t('warning-erase-text', 'Are you sure you want to do this? All unsaved code will be erased!') : 'Are you sure you want to do this? All unsaved code will be erased!';
        const yesText = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-yes', 'Yes') : 'Yes';
        const noText = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-no', 'No') : 'No';
        return this.spawn({
            icon: 'fluent:warning-20-filled',
            title,
            body,
            buttons: [yesText, noText],
        }).then(({ button }) => button === 0);
    },

    /** "Add bookmark" input dialog. Resolves the URI string or null. */
    promptAddBookmark() {
        const title = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-addbookmark-title', 'Add bookmark') : 'Add bookmark';
        const body = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-addbookmark-body', "Insert your bookmark's URI below.") : "Insert your bookmark's URI below.";
        const okText = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-ok', 'Ok') : 'Ok';
        const cancelText = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-cancel', 'Cancel') : 'Cancel';
        return this.spawn({
            icon: 'fluent:bookmark-add-20-filled',
            iconColor: 'white',
            title,
            body,
            textbox: '',
            buttons: [okText, cancelText],
        }).then(({ button, value }) => (button === 0 && value ? value : null));
    },

    /** "Invalid bookmark" error dialog. Matches original HTML exactly. */
    alertInvalidBookmark() {
        const title = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-addbookmark-title', 'Add bookmark') : 'Add bookmark';
        const body = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-invalidbookmark-body', 'URL is invalid. Please try again') : 'URL is invalid. Please try again';
        const okText = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-ok', 'Ok') : 'Ok';
        return this.spawn({
            icon: 'fluent:bookmark-add-20-filled',
            iconColor: 'white',
            title,
            body,
            buttons: [okText],
        });
    },

    /** "Bookmark name" input dialog. Resolves custom name string, '' for filename fallback, or null if cancelled. */
    promptBookmarkName() {
        const title = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-bookmarkname-title', 'Bookmark name') : 'Bookmark name';
        const body = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-bookmarkname-body', 'Choose a name for your bookmark. If none is provided, it will default to the filename.') : 'Choose a name for your bookmark. If none is provided, it will default to the filename.';
        const okText = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-ok', 'Ok') : 'Ok';
        const cancelText = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-cancel', 'Cancel') : 'Cancel';
        return this.spawn({
            icon: 'fluent:bookmark-add-20-filled',
            iconColor: 'white',
            title,
            body,
            textbox: '',
            buttons: [okText, cancelText],
        }).then(({ button, value }) => (button === 0 ? (value !== null ? value.trim() : '') : null));
    },

    /** "Set accent" dialog matching original Hollywood UI snippet */
    promptSetAccent() {
        return new Promise((resolve) => {
            const canvas = document.getElementById('canvas-dialog');
            if (!canvas) { resolve(null); return; }

            const title = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-setaccent-title', 'Set accent') : 'Set accent';
            const cancelText = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-cancel', 'Cancel') : 'Cancel';

            const backdrop = document.createElement('div');
            backdrop.className = 'flex h-full w-full select-none items-center justify-center transition-colors pointer-events-auto bg-black/50 backdrop-blur-sm';

            const dlg = document.createElement('div');
            dlg.className = 'hw-dialog flex min-w-[24rem] flex-col rounded-lg';
            dlg.style.animation = '100ms ease-out 0s 1 normal forwards running elem-blur-in';

            dlg.innerHTML = `
                <div class="flex grow gap-4 p-4">
                    <iconify-icon icon="fluent:color-20-filled" class="flex items-center justify-center translate-y-1 text-2xl" style="color: white;"></iconify-icon>
                    <div class="flex h-full flex-col gap-2">
                        <div class="caption align-top text-xl font-bold">${title}</div>
                        <div class="flex gap-1">
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: white;" data-color="" title="Default (White)"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(239, 68, 68);" data-color="#ef4444" title="Red"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(249, 115, 22);" data-color="#f97316" title="Orange"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(245, 158, 11);" data-color="#f59e0b" title="Amber"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(234, 179, 8);" data-color="#eab308" title="Yellow"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(132, 204, 22);" data-color="#84cc16" title="Lime"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(34, 197, 94);" data-color="#22c55e" title="Green"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(16, 185, 129);" data-color="#10b981" title="Emerald"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(20, 184, 166);" data-color="#14b8a6" title="Teal"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(6, 182, 212);" data-color="#06b6d4" title="Cyan"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(14, 165, 233);" data-color="#0ea5e9" title="Sky"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(59, 130, 246);" data-color="#3b82f6" title="Blue"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(99, 102, 241);" data-color="#6366f1" title="Indigo"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(139, 92, 246);" data-color="#8b5cf6" title="Purple"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(168, 85, 247);" data-color="#a855f7" title="Violet"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(217, 70, 239);" data-color="#d946ef" title="Fuchsia"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(236, 72, 153);" data-color="#ec4899" title="Pink"></div>
                            <div class="rounded-full p-2 hover:brightness-150 active:opacity-50 cursor-pointer" style="background-color: rgb(244, 63, 94);" data-color="#f43f5e" title="Rose"></div>
                        </div>
                    </div>
                </div>
                <div class="inputs flex h-16 w-full rounded-b-lg border-t px-2 py-4">
                    <div class="ml-auto flex gap-2">
                        <button class="hw-button relative flex select-none items-center justify-center gap-1 rounded-md px-2 py-1 cursor-default" id="dlg-btn-cancel">${cancelText}</button>
                    </div>
                </div>
            `;

            const close = (color) => {
                dlg.style.animation = '100ms ease-in 0s 1 normal forwards running elem-blur-out';
                setTimeout(() => { backdrop.remove(); resolve(color); }, 90);
            };

            dlg.querySelectorAll('[data-color]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    close(btn.getAttribute('data-color'));
                });
            });

            dlg.querySelector('#dlg-btn-cancel')?.addEventListener('click', (e) => {
                e.stopPropagation();
                close(null);
            });

            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) close(null);
            });

            backdrop.appendChild(dlg);
            canvas.appendChild(backdrop);
        });
    },

    /** "Theme settings" confirmation dialog for settingOverrides. Resolves true if Yes, false if No. */
    confirmThemeOverrides() {
        const title = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-themesettings-title', 'Theme settings') : 'Theme settings';
        const body = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-themesettings-body', 'This theme has special setting overrides. Do you want to apply them?') : 'This theme has special setting overrides. Do you want to apply them?';
        const yesText = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-yes', 'Yes') : 'Yes';
        const noText = (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-no', 'No') : 'No';
        return this.spawn({
            icon: 'mdi:palette-outline',
            iconColor: 'white',
            title,
            body,
            buttons: [yesText, noText],
        }).then(({ button }) => button === 0);
    },
};

window.HWDialog = HWDialog;

// ── Notifications ────────────────────────────────────────────────────────────

function notify(text) {
    const canvas = document.getElementById('canvas-notifications');
    if (!canvas) return;
    const host = canvas.firstElementChild || canvas;
    const el = document.createElement('div');
    el.className = 'hw-dialog flex min-w-[16rem] flex-col rounded-lg border p-3 m-2 text-sm';
    el.style.animation = '100ms ease-out 0s 1 normal forwards running elem-blur-in';
    el.textContent = text;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// ── Navigation ───────────────────────────────────────────────────────────────

const NAV_MAP = [
    { navId: 'nav-editor',   pageId: 'page-editor'   },
    { navId: 'nav-settings', pageId: 'page-settings' },
    { navId: 'nav-themes',   pageId: 'page-themes'   },
    { navId: 'nav-plugins',  pageId: 'page-plugins'  },
];

function toggleClassicMenu(forceOpen) {
    const navBar = document.querySelector('.hw-navigationbar');
    const backdrop = document.getElementById('classic-nav-backdrop');
    if (!navBar) return;
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !navBar.classList.contains('open');
    navBar.classList.toggle('open', shouldOpen);
    if (backdrop) backdrop.classList.toggle('open', shouldOpen);
}

function navigateTo(targetNavId) {
    NAV_MAP.forEach(({ navId, pageId }) => {
        const navEl  = document.getElementById(navId);
        const pageEl = document.getElementById(pageId);
        if (!navEl || !pageEl) return;

        const isTarget = navId === targetNavId;

        // Nav entry active state
        navEl.classList.toggle('select', isTarget);
        navEl.classList.toggle('drop-shadow-md', isTarget);

        // Page visibility
        pageEl.classList.toggle('visible-page', isTarget);
        pageEl.classList.toggle('hidden-page', !isTarget);
    });

    // If navigating to editor, trigger Monaco layout recalculation
    if (targetNavId === 'nav-editor' && typeof monacoEditor !== 'undefined' && monacoEditor) {
        setTimeout(() => monacoEditor.layout(), 10);
    }

    // In classic layout mode, close the vertical navbar after selection
    if (document.getElementById('application')?.classList.contains('classic-layout')) {
        toggleClassicMenu(false);
    }
}

function initNavigation() {
    NAV_MAP.forEach(({ navId }) => {
        const el = document.getElementById(navId);
        if (el) el.addEventListener('click', () => navigateTo(navId));
    });

    // Default: editor is active
    navigateTo('nav-editor');
}

// ── Title Bar ────────────────────────────────────────────────────────────────

function initTitleBar() {
    document.getElementById('ban_control_minimize')?.addEventListener('click', () => {
        window.hwAPI?.minimize();
    });

    document.getElementById('ban_control_maximize')?.addEventListener('click', () => {
        window.hwAPI?.maximize();
    });

    document.getElementById('ban_control_restore')?.addEventListener('click', () => {
        window.hwAPI?.maximize();
    });

    document.getElementById('ban_control_close')?.addEventListener('click', () => {
        window.hwAPI?.close();
    });

    document.getElementById('ban_control_language')?.addEventListener('click', () => {
        if (typeof window.hwAPI?.openExternal === 'function') {
            window.hwAPI.openExternal('https://github.com/Okafor-twd/SynapseV3/');
        } else {
            window.open('https://github.com/Okafor-twd/SynapseV3/', '_blank');
        }
    });

    const hamburgerBtn = document.getElementById('ban_control_hamburger');
    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const appEl = document.getElementById('application');
            const classic = appEl?.classList.contains('classic-layout')
                || document.body.classList.contains('classic-layout');
            if (!classic) return;
            toggleClassicMenu();
        });
    }

    const backdrop = document.getElementById('classic-nav-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleClassicMenu(false);
        });
    }

    document.addEventListener('click', (e) => {
        const navBar = document.querySelector('.hw-navigationbar');
        if (navBar && navBar.classList.contains('open') && !navBar.contains(e.target) && !e.target.closest('#ban_control_hamburger')) {
            toggleClassicMenu(false);
        }
    });

    const classicSaved = localStorage.getItem('synapse_setting_classic_layout') === 'true';
    if (typeof window.applyClassicLayout === 'function') {
        window.applyClassicLayout(classicSaved);
    }
}

// ── Sidebar modules ──────────────────────────────────────────────────────────

function isValidBookmarkUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    const str = urlStr.trim();
    if (!str) return false;
    try {
        const u = new URL(str.includes('://') ? str : `https://${str}`);
        return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'file:';
    } catch {
        return false;
    }
}

function getFilenameFromUrl(urlStr) {
    try {
        const u = new URL(urlStr.includes('://') ? urlStr : `https://${urlStr}`);
        const segments = u.pathname.split('/').filter(Boolean);
        if (segments.length > 0) {
            const last = decodeURIComponent(segments[segments.length - 1]);
            if (last) return last;
        }
        return u.hostname || 'Bookmark';
    } catch (_) {
        return 'Bookmark';
    }
}

// ── Context Menus ────────────────────────────────────────────────────────────

let activeSidebarContextMenu = null;

document.addEventListener('click', (e) => {
    if (activeSidebarContextMenu && !activeSidebarContextMenu.contains(e.target)) {
        activeSidebarContextMenu.remove();
        activeSidebarContextMenu = null;
    }
});
document.addEventListener('contextmenu', (e) => {
    if (activeSidebarContextMenu && !activeSidebarContextMenu.contains(e.target)) {
        activeSidebarContextMenu.remove();
        activeSidebarContextMenu = null;
    }
});

async function openBookmarkInEditor(name, uri) {
    if (!uri) return;

    // If an existing tab is already open with this bookmark, just switch to it
    if (typeof tabs !== 'undefined' && Array.isArray(tabs)) {
        const existing = tabs.find(t => t.title === name || (t.bookmarkUri && t.bookmarkUri === uri));
        if (existing) {
            if (typeof switchTab === 'function') switchTab(existing.id);
            return;
        }
    }

    let content = '';
    let isOk = false;

    // 1. Try Electron main process native fetch
    if (window.hwAPI?.fetchUrl) {
        try {
            const res = await window.hwAPI.fetchUrl(uri);
            if (res && res.ok && res.status === 200) {
                content = res.text || '';
                isOk = true;
            } else if (typeof res === 'string' && res) {
                content = res;
                isOk = true;
            }
        } catch (_) {
            // Main process IPC not ready; fallback to browser fetch
        }
    }

    // 2. Try browser standard fetch
    if (!isOk && /^https?:\/\//i.test(uri)) {
        try {
            const res = await fetch(uri);
            if (res.status === 200) {
                content = await res.text();
                isOk = true;
            }
        } catch (_) {}
    }

    if (isOk && typeof openFileInEditor === 'function') {
        const headerComment = `-- ${uri}\n\n`;
        const finalContent = content.startsWith(`-- ${uri}`) ? content : `${headerComment}${content}`;
        openFileInEditor(name, finalContent, {
            isBookmark: true,
            bookmarkUri: uri
        });
    } else if (!isOk && typeof openFileInEditor === 'function') {
        if (typeof notify === 'function') notify('Failed to fetch bookmark');
        openFileInEditor(name, `-- [Failed to fetch bookmark]: ${uri}\n`, {
            isBookmark: true,
            bookmarkUri: uri
        });
    }
}

function showBookmarkContextMenu(e, item, index) {
    e.preventDefault();
    e.stopPropagation();

    if (activeSidebarContextMenu) {
        activeSidebarContextMenu.remove();
        activeSidebarContextMenu = null;
    }

    const appEl = document.getElementById('application') || document.body;
    const appRect = appEl.getBoundingClientRect();

    const name = (typeof item === 'object' && item && item.name) ? item.name : (typeof item === 'string' ? getFilenameFromUrl(item) : 'Bookmark');
    const uri = (typeof item === 'object' && item && item.uri) ? item.uri : (typeof item === 'string' ? item : '');

    const menu = document.createElement('div');
    menu.className = 'hw-contextmenu pointer-events-auto absolute z-50 flex flex-col rounded-md';

    let posX = e.clientX - appRect.left;
    let posY = e.clientY - appRect.top;
    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;

    const txtExec = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-execute', 'Execute') : 'Execute';
    const txtOpen = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-open', 'Open') : 'Open';
    const txtDelete = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-delete', 'Delete') : 'Delete';
    const txtOpenBrowser = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-open-in-browser', 'Open in browser') : 'Open in browser';
    const txtCopyShare = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-copy-share-link', 'Copy share link') : 'Copy share link';

    menu.innerHTML = `
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="execute">
            <iconify-icon icon="fluent:play-20-regular" class="flex items-center justify-center undefined"></iconify-icon> ${txtExec}
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="open">
            <iconify-icon icon="fluent:document-arrow-up-20-filled" class="flex items-center justify-center undefined"></iconify-icon> ${txtOpen}
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="delete">
            <iconify-icon icon="fluent:delete-20-filled" class="flex items-center justify-center undefined"></iconify-icon> ${txtDelete}
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="open-in-browser">
            <iconify-icon icon="fluent:open-in-browser-24-filled" class="flex items-center justify-center undefined"></iconify-icon> ${txtOpenBrowser}
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="copy-share-link">
            <iconify-icon icon="fluent:share-24-filled" class="flex items-center justify-center undefined"></iconify-icon> ${txtCopyShare}
        </div>
    `;

    menu.addEventListener('click', async (evt) => {
        const entry = evt.target.closest('.entry');
        if (!entry) return;
        const action = entry.getAttribute('data-action');
        menu.remove();
        activeSidebarContextMenu = null;

        switch (action) {
            case 'execute': {
                let content = '';
                try {
                    if (window.hwAPI?.fetchUrl) {
                        const res = await window.hwAPI.fetchUrl(uri);
                        if (res && res.ok && res.status === 200) content = res.text || '';
                        else if (typeof res === 'string') content = res;
                    }
                    if (!content && uri && /^https?:\/\//i.test(uri)) {
                        const res = await fetch(uri);
                        if (res.status === 200) content = await res.text();
                    }
                } catch (_) {}
                if (!content) content = uri ? `-- ${uri}\n` : '';
                window.hwAPI?.execute(content);
                break;
            }
            case 'open': {
                await openBookmarkInEditor(name, uri);
                break;
            }
            case 'delete': {
                const list = (await window.hwAPI?.getSetting('bookmarks', [])) || [];
                list.splice(index, 1);
                window.hwAPI?.setSetting('bookmarks', list);
                renderBookmarks();
                break;
            }
            case 'open-in-browser': {
                if (uri) {
                    if (window.hwAPI?.openExternal) {
                        window.hwAPI.openExternal(uri);
                    } else {
                        window.open(uri, '_blank');
                    }
                }
                break;
            }
            case 'copy-share-link': {
                if (uri) {
                    try {
                        await navigator.clipboard.writeText(uri);
                        notify('Copied bookmark URL to clipboard');
                    } catch (_) {}
                }
                break;
            }
        }
    });

    appEl.appendChild(menu);
    activeSidebarContextMenu = menu;

    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > appRect.right) {
        menu.style.left = `${Math.max(10, appRect.width - menuRect.width - 10)}px`;
    }
    if (menuRect.bottom > appRect.bottom) {
        menu.style.top = `${Math.max(10, appRect.height - menuRect.height - 10)}px`;
    }
}

function showFileContextMenu(e, file) {
    e.preventDefault();
    e.stopPropagation();

    if (activeSidebarContextMenu) {
        activeSidebarContextMenu.remove();
        activeSidebarContextMenu = null;
    }

    const appEl = document.getElementById('application') || document.body;
    const appRect = appEl.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.className = 'hw-contextmenu pointer-events-auto absolute z-50 flex flex-col rounded-md';

    let posX = e.clientX - appRect.left;
    let posY = e.clientY - appRect.top;
    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;

    const txtExec = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-execute', 'Execute') : 'Execute';
    const txtOpen = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-open', 'Open') : 'Open';
    const txtDelete = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-delete', 'Delete') : 'Delete';
    const txtOpenFolder = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-open-in-folder', 'Open in folder') : 'Open in folder';

    menu.innerHTML = `
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="execute">
            <iconify-icon icon="fluent:play-20-regular" class="flex items-center justify-center undefined"></iconify-icon> ${txtExec}
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="open">
            <iconify-icon icon="fluent:document-arrow-up-20-filled" class="flex items-center justify-center undefined"></iconify-icon> ${txtOpen}
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="delete">
            <iconify-icon icon="fluent:delete-20-filled" class="flex items-center justify-center undefined"></iconify-icon> ${txtDelete}
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="open-in-folder">
            <iconify-icon icon="fluent:folder-20-filled" class="flex items-center justify-center undefined"></iconify-icon> ${txtOpenFolder}
        </div>
    `;

    menu.addEventListener('click', async (evt) => {
        const entry = evt.target.closest('.entry');
        if (!entry) return;
        const action = entry.getAttribute('data-action');
        menu.remove();
        activeSidebarContextMenu = null;

        switch (action) {
            case 'execute': {
                let content = '';
                const res = await window.hwAPI?.readScript(file.path);
                if (res && res.content) content = res.content;
                else if (typeof require !== 'undefined') {
                    try {
                        const fs = require('fs');
                        if (fs.existsSync(file.path)) content = fs.readFileSync(file.path, 'utf8');
                    } catch (_) {}
                }
                if (content) window.hwAPI?.execute(content);
                break;
            }
            case 'open': {
                let content = '';
                const res = await window.hwAPI?.readScript(file.path);
                if (res && typeof res.content === 'string') {
                    content = res.content;
                } else if (typeof require !== 'undefined') {
                    try {
                        const fs = require('fs');
                        if (fs.existsSync(file.path)) content = fs.readFileSync(file.path, 'utf8');
                    } catch (_) {}
                }
                if (typeof openFileInEditor === 'function') {
                    openFileInEditor(file.name, content, { isFile: true, filePath: file.path });
                }
                break;
            }
            case 'delete': {
                const ok = await window.hwAPI?.deleteScript(file.path);
                renderFilesystem();
                break;
            }
            case 'open-in-folder': {
                window.hwAPI?.showItemInFolder(file.path);
                break;
            }
        }
    });

    appEl.appendChild(menu);
    activeSidebarContextMenu = menu;

    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > appRect.right) {
        menu.style.left = `${Math.max(10, appRect.width - menuRect.width - 10)}px`;
    }
    if (menuRect.bottom > appRect.bottom) {
        menu.style.top = `${Math.max(10, appRect.height - menuRect.height - 10)}px`;
    }
}

function showFolderContextMenu(e, folder) {
    e.preventDefault();
    e.stopPropagation();

    if (activeSidebarContextMenu) {
        activeSidebarContextMenu.remove();
        activeSidebarContextMenu = null;
    }

    const appEl = document.getElementById('application') || document.body;
    const appRect = appEl.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.className = 'hw-contextmenu pointer-events-auto absolute z-50 flex flex-col rounded-md';

    let posX = e.clientX - appRect.left;
    let posY = e.clientY - appRect.top;
    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;

    const txtDelete = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-delete', 'Delete') : 'Delete';
    const txtOpenFolder = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-open-in-folder', 'Open in folder') : 'Open in folder';
    const txtSetAccent = (typeof window.i18n?.t === 'function') ? window.i18n.t('contextmenu-set-accent', 'Set accent') : 'Set accent';

    menu.innerHTML = `
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="delete">
            <iconify-icon icon="fluent:delete-20-filled" class="flex items-center justify-center undefined"></iconify-icon> ${txtDelete}
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="open-in-folder">
            <iconify-icon icon="fluent:folder-20-filled" class="flex items-center justify-center undefined"></iconify-icon> ${txtOpenFolder}
        </div>
        <div class="entry relative flex items-center gap-2 py-1 px-2 min-w-[10rem] whitespace-nowrap cursor-default" data-action="set-accent">
            <iconify-icon icon="fluent:color-20-filled" class="flex items-center justify-center undefined"></iconify-icon> ${txtSetAccent}
        </div>
    `;

    menu.addEventListener('click', async (evt) => {
        const entry = evt.target.closest('.entry');
        if (!entry) return;
        const action = entry.getAttribute('data-action');

        menu.remove();
        activeSidebarContextMenu = null;

        switch (action) {
            case 'delete': {
                const ok = await window.hwAPI?.deleteScript(folder.path);
                renderFilesystem();
                break;
            }
            case 'open-in-folder': {
                window.hwAPI?.showItemInFolder(folder.path);
                break;
            }
            case 'set-accent': {
                const color = await HWDialog.promptSetAccent();
                if (color !== null) {
                    const cfg = (await window.hwAPI?.getEditorConfig?.('filesystem')) || {};
                    const folderColors = cfg.folderColors || {};
                    if (color) {
                        folderColors[folder.path] = color;
                    } else {
                        delete folderColors[folder.path];
                    }
                    cfg.folderColors = folderColors;
                    await window.hwAPI?.setEditorConfig?.('filesystem', cfg);
                    localStorage.setItem('synapse_folder_accents', JSON.stringify(folderColors));
                    renderFilesystem();
                }
                break;
            }
        }
    });

    appEl.appendChild(menu);
    activeSidebarContextMenu = menu;

    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > appRect.right) {
        menu.style.left = `${Math.max(10, appRect.width - menuRect.width - 10)}px`;
    }
    if (menuRect.bottom > appRect.bottom) {
        menu.style.top = `${Math.max(10, appRect.height - menuRect.height - 10)}px`;
    }
}

// ── Sidebar Search & State ──────────────────────────────────────────────────

let currentSidebarSearchQuery = '';
let cachedFsItems = [];
let cachedBookmarks = [];

// ── Bookmarks Renderer ───────────────────────────────────────────────────────

async function renderBookmarks(refreshFromDisk = true) {
    const module = document.getElementById('module-bookmarks');
    if (!module) return;

    if (refreshFromDisk || !cachedBookmarks || cachedBookmarks.length === 0) {
        cachedBookmarks = (await window.hwAPI?.getSetting('bookmarks', [])) || [];
    }

    const q = currentSidebarSearchQuery.trim().toLowerCase();
    const items = q
        ? cachedBookmarks.filter(item => {
            const name = (typeof item === 'object' && item && item.name) ? item.name : (typeof item === 'string' ? getFilenameFromUrl(item) : 'Bookmark');
            const uri = (typeof item === 'object' && item && item.uri) ? item.uri : (typeof item === 'string' ? item : '');
            return name.toLowerCase().includes(q) || uri.toLowerCase().includes(q);
        })
        : cachedBookmarks;

    module.innerHTML = '';

    items.forEach((item, index) => {
        const name = (typeof item === 'object' && item && item.name) ? item.name : (typeof item === 'string' ? getFilenameFromUrl(item) : 'Bookmark');
        const uri = (typeof item === 'object' && item && item.uri) ? item.uri : (typeof item === 'string' ? item : '');

        const bookmarkIconName = (typeof window.getThemeIcon === 'function') ? window.getThemeIcon('file', 'fluent:document-20-filled') : 'fluent:document-20-filled';
        const node = document.createElement('div');
        node.className = 'node';
        node.innerHTML = `
            <div>
                <div class="node-caption group flex items-center py-0.5 pl-1 opacity-70 hover:opacity-100 active:opacity-50 cursor-default" draggable="true">
                    <iconify-icon icon="${bookmarkIconName}" class="flex items-center justify-center w-4 min-w-[1rem]"></iconify-icon>
                    <div class="ml-2 overflow-ellipsis whitespace-nowrap">${name}</div>
                </div>
            </div>
        `;

        const caption = node.querySelector('.node-caption');
        caption.title = uri || name;

        // Left click to open in editor
        caption.addEventListener('click', async () => {
            await openBookmarkInEditor(name, uri);
        });

        // Right click to open context menu
        caption.addEventListener('contextmenu', (e) => {
            showBookmarkContextMenu(e, item, index);
        });

        module.appendChild(node);
    });
}

// ── Filesystem Tree Renderer ─────────────────────────────────────────────────

const expandedFolders = new Set();

function getFolderAccent(itemPath, accents) {
    if (!itemPath || !accents) return '';
    if (accents[itemPath]) return accents[itemPath];
    const norm = itemPath.replace(/\\/g, '/').toLowerCase();
    for (const [k, v] of Object.entries(accents)) {
        if (k.replace(/\\/g, '/').toLowerCase() === norm) {
            return v;
        }
    }
    return '';
}

function filterFsTree(items, query) {
    if (!query) return items;
    const q = query.toLowerCase();
    const result = [];

    for (const item of items) {
        if (item.isDirectory) {
            const nameMatch = item.name.toLowerCase().includes(q);
            const filteredChildren = filterFsTree(item.children || [], query);
            if (nameMatch || (filteredChildren && filteredChildren.length > 0)) {
                result.push({
                    ...item,
                    children: nameMatch && (!filteredChildren || filteredChildren.length === 0) ? (item.children || []) : filteredChildren,
                    isSearchAutoExpanded: true
                });
            }
        } else {
            if (item.name.toLowerCase().includes(q)) {
                result.push(item);
            }
        }
    }
    return result;
}

function createFsNode(item, isSearching = false) {
    const accents = JSON.parse(localStorage.getItem('synapse_folder_accents') || '{}');
    const folderAccent = getFolderAccent(item.path, accents);

    const node = document.createElement('div');
    node.className = 'node';

    if (item.isDirectory) {
        let isExpanded = isSearching || item.isSearchAutoExpanded || expandedFolders.has(item.path);
        const children = item.children || [];
        const folderIconName = (typeof window.getThemeIcon === 'function') ? window.getThemeIcon('folder', 'fluent:folder-20-filled') : 'fluent:folder-20-filled';

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div class="node-caption group flex items-center py-0.5 pl-1 opacity-70 hover:opacity-100 active:opacity-50 cursor-default" draggable="true">
                <iconify-icon icon="fluent:chevron-right-20-filled" class="flex items-center justify-center transition-all ${isExpanded ? 'rotate-90 text-base' : 'rotate-0 text-[0] opacity-0 group-hover:text-base'}"></iconify-icon>
                <iconify-icon icon="${folderIconName}" class="flex items-center justify-center w-4 min-w-[1rem]" ${folderAccent ? `style="color: ${folderAccent} !important;"` : ''}></iconify-icon>
                <div class="ml-2 overflow-ellipsis whitespace-nowrap">${item.name}</div>
            </div>
        `;
        node.appendChild(wrapper);

        const caption = wrapper.querySelector('.node-caption');
        const chevron = wrapper.querySelector('iconify-icon[icon="fluent:chevron-right-20-filled"]');
        const folderIcon = wrapper.querySelector('.node-caption > iconify-icon:nth-child(2)');
        if (folderIcon && folderAccent) {
            folderIcon.style.setProperty('color', folderAccent, 'important');
        }
        caption.title = item.path;

        let childrenContainer = null;
        if (children.length > 0) {
            childrenContainer = document.createElement('div');
            childrenContainer.className = `children ml-2 ${isExpanded ? '' : 'collapsed'}`;
            children.forEach(child => {
                childrenContainer.appendChild(createFsNode(child, isSearching));
            });
            node.appendChild(childrenContainer);
        }

        caption.addEventListener('click', (e) => {
            e.stopPropagation();
            isExpanded = !isExpanded;
            if (isExpanded) {
                expandedFolders.add(item.path);
                if (childrenContainer) childrenContainer.classList.remove('collapsed');
                if (chevron) {
                    chevron.className = 'flex items-center justify-center transition-all rotate-90 text-base';
                }
            } else {
                expandedFolders.delete(item.path);
                if (childrenContainer) childrenContainer.classList.add('collapsed');
                if (chevron) {
                    chevron.className = 'flex items-center justify-center transition-all rotate-0 text-[0] opacity-0 group-hover:text-base';
                }
            }
        });

        caption.addEventListener('contextmenu', (e) => {
            showFolderContextMenu(e, item);
        });
    } else {
        const ext = item.name.split('.').pop().toLowerCase();
        let iconName = (typeof window.getThemeIcon === 'function') ? window.getThemeIcon('file', 'fluent:document-20-filled') : 'fluent:document-20-filled';
        let iconStyle = 'color: rgb(96, 165, 250);';

        if (ext === 'lua' || ext === 'luau') {
            iconName = (typeof window.getThemeIcon === 'function') ? (window.getThemeIcon('file-script') || window.getThemeIcon('file', 'file-icons:lua')) : 'file-icons:lua';
            iconStyle = 'color: rgb(96, 165, 250);';
        } else if (ext === 'txt') {
            iconName = (typeof window.getThemeIcon === 'function') ? (window.getThemeIcon('file-text') || window.getThemeIcon('file', 'fluent:document-20-filled')) : 'fluent:document-20-filled';
            iconStyle = 'color: rgb(96, 165, 250);';
        }

        node.innerHTML = `
            <div>
                <div class="node-caption group flex items-center py-0.5 pl-1 opacity-70 hover:opacity-100 active:opacity-50 cursor-default" draggable="true">
                    <iconify-icon icon="${iconName}" class="flex items-center justify-center w-4 min-w-[1rem]" style="${iconStyle}"></iconify-icon>
                    <div class="ml-2 overflow-ellipsis whitespace-nowrap">${item.name}</div>
                </div>
            </div>
        `;

        const caption = node.querySelector('.node-caption');
        caption.title = item.path;

        caption.addEventListener('click', async () => {
            let content = '';
            const res = await window.hwAPI?.readScript(item.path);
            if (res && typeof res.content === 'string') {
                content = res.content;
            } else if (typeof require !== 'undefined') {
                try {
                    const fs = require('fs');
                    if (fs.existsSync(item.path)) content = fs.readFileSync(item.path, 'utf8');
                } catch (_) {}
            }
            if (typeof openFileInEditor === 'function') {
                openFileInEditor(item.name, content, { isFile: true, filePath: item.path });
            }
        });

        caption.addEventListener('contextmenu', (e) => {
            showFileContextMenu(e, item);
        });
    }

    return node;
}

async function renderFilesystem(refreshFromDisk = true) {
    const module = document.getElementById('module-filesystem');
    if (!module) return;

    try {
        const fsConfig = await window.hwAPI?.getEditorConfig?.('filesystem');
        if (fsConfig && fsConfig.folderColors) {
            localStorage.setItem('synapse_folder_accents', JSON.stringify(fsConfig.folderColors));
        }
    } catch (_) {}

    if (refreshFromDisk || !cachedFsItems || cachedFsItems.length === 0) {
        try {
            cachedFsItems = (await window.hwAPI?.listScripts()) || [];
        } catch (e) {
            console.error('Error listing scripts:', e);
        }
    }

    const q = currentSidebarSearchQuery.trim();
    const displayItems = q ? filterFsTree(cachedFsItems, q) : cachedFsItems;

    module.innerHTML = '';
    displayItems.forEach(item => {
        module.appendChild(createFsNode(item, !!q));
    });
}

function renderGists() {
    const module = document.getElementById('module-gists');
    if (!module) return;
    module.innerHTML = '';
}

// ── Sidebar Config Helpers (config/editor/sidebar.json) ─────────────────────

function getCachedSidebarConfig() {
    try {
        const stored = JSON.parse(localStorage.getItem('synapse_sidebar_config') || '{}');
        const widthVal = typeof stored.width === 'number' ? stored.width : parseInt(localStorage.getItem('synapse_sidebar_width') || '285', 10);
        return {
            width: !isNaN(widthVal) && widthVal >= 150 && widthVal <= 450 ? widthVal : 285,
            filesystem: stored.filesystem !== false,
            bookmarks: stored.bookmarks !== false,
            gists: stored.gists !== false,
            ...stored
        };
    } catch {
        return { width: 285, filesystem: true, bookmarks: true, gists: true };
    }
}

async function loadSidebarConfig() {
    try {
        const diskCfg = (await window.hwAPI?.getEditorConfig?.('sidebar')) || {};
        const merged = { ...getCachedSidebarConfig(), ...diskCfg };
        localStorage.setItem('synapse_sidebar_config', JSON.stringify(merged));
        if (typeof merged.width === 'number') {
            localStorage.setItem('synapse_sidebar_width', merged.width.toString());
        }
        return merged;
    } catch {
        return getCachedSidebarConfig();
    }
}

async function saveSidebarConfig(partial) {
    const current = getCachedSidebarConfig();
    const updated = { ...current, ...partial };
    localStorage.setItem('synapse_sidebar_config', JSON.stringify(updated));
    if (typeof updated.width === 'number') {
        localStorage.setItem('synapse_sidebar_width', updated.width.toString());
    }
    try {
        await window.hwAPI?.setEditorConfig?.('sidebar', updated);
    } catch (e) {
        console.error('Error saving sidebar config:', e);
    }
    return updated;
}

async function initSidebar() {
    const moduleKeyMap = {
        'module-filesystem': 'filesystem',
        'module-bookmarks': 'bookmarks',
        'module-gists': 'gists',
    };

    function applyModuleState(moduleId, isActive) {
        const module = document.getElementById(moduleId);
        if (!module) return;
        const caption = module.previousElementSibling;
        const chevron = caption?.querySelector('.chevron');

        if (isActive) {
            module.classList.remove('collapsed');
            if (chevron) {
                chevron.classList.remove('rotate-180', '-rotate-180', 'collapsed');
                chevron.classList.add('rotate-0');
                chevron.style.transform = 'rotate(0deg)';
            }
        } else {
            module.classList.add('collapsed');
            if (chevron) {
                chevron.classList.remove('rotate-0');
                chevron.classList.add('rotate-180', 'collapsed');
                chevron.style.transform = 'rotate(180deg)';
            }
        }
    }

    // 1. Synchronous restore from cache immediately
    const cachedCfg = getCachedSidebarConfig();
    Object.entries(moduleKeyMap).forEach(([modId, key]) => {
        applyModuleState(modId, cachedCfg[key] !== false);
    });

    // 2. Async sync with disk
    loadSidebarConfig().then(diskCfg => {
        Object.entries(moduleKeyMap).forEach(([modId, key]) => {
            applyModuleState(modId, diskCfg[key] !== false);
        });
    });

    // Collapsible module captions
    document.querySelectorAll('.module-caption').forEach(caption => {
        caption.addEventListener('click', async (e) => {
            if (e.target.closest('#add-bookmark-btn') || e.target.closest('.actions')) return;
            const chevron = caption.querySelector('.chevron');
            const module = caption.nextElementSibling;
            if (!module || !module.classList.contains('module')) return;

            const isCurrentlyCollapsed = module.classList.contains('collapsed');
            const nextActiveState = isCurrentlyCollapsed; // true = expand, false = collapse

            applyModuleState(module.id, nextActiveState);

            const key = moduleKeyMap[module.id];
            if (key) {
                await saveSidebarConfig({ [key]: nextActiveState });
            }
        });
    });

    document.getElementById('add-bookmark-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const uri = await HWDialog.promptAddBookmark();
        if (uri === null || uri === undefined) return;
        let trimmed = uri.trim();
        if (!trimmed) return;

        if (!trimmed.includes('://')) {
            trimmed = 'https://' + trimmed;
        }

        if (!isValidBookmarkUrl(trimmed)) {
            await HWDialog.alertInvalidBookmark();
            return;
        }

        const nameInput = await HWDialog.promptBookmarkName();
        if (nameInput === null) return; // Cancelled

        const finalName = nameInput || getFilenameFromUrl(trimmed);

        const bookmarks = (await window.hwAPI?.getSetting('bookmarks', [])) || [];
        bookmarks.push({ name: finalName, uri: trimmed });
        window.hwAPI?.setSetting('bookmarks', bookmarks);
        renderBookmarks();
    });

    // Realtime filesystem change watcher from Windows Explorer
    window.hwAPI?.onFilesystemChanged?.(() => {
        renderFilesystem(true);
    });

    // Sidebar search input (Live filtering for scripts, folders, and bookmarks)
    const searchInput = document.getElementById('sidebar-search-input') || document.querySelector('.sidebar .hw-textbox input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSidebarSearchQuery = e.target.value;
            renderFilesystem(false);
            renderBookmarks(false);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                currentSidebarSearchQuery = '';
                renderFilesystem(false);
                renderBookmarks(false);
                searchInput.blur();
            }
        });
    }

    renderFilesystem(true);
    renderBookmarks(true);
    renderGists();
}

// ── Sidebar Resizing (Left/Right adaptive) ───────────────────────────────────

function initSidebarResizing() {
    const sidebarWrapper = document.getElementById('sidebar-wrapper');
    const resizeLeft = document.getElementById('resize-left');
    const resizeRight = document.getElementById('resize-right');
    if (!sidebarWrapper) return;

    // 1. Immediate synchronous restore from cache
    const cachedCfg = getCachedSidebarConfig();
    sidebarWrapper.style.width = `${cachedCfg.width}px`;

    // 2. Async sync with disk
    loadSidebarConfig().then(diskCfg => {
        if (typeof diskCfg.width === 'number' && diskCfg.width >= 150 && diskCfg.width <= 450) {
            sidebarWrapper.style.width = `${diskCfg.width}px`;
        }
    });

    function updateHandles() {
        const isLeftSidebar = sidebarWrapper.style.order === '-1';
        if (resizeLeft) {
            resizeLeft.style.display = isLeftSidebar ? 'none' : 'block';
        }
        if (resizeRight) {
            resizeRight.style.display = isLeftSidebar ? 'block' : 'none';
        }
    }

    updateHandles();
    window.updateSidebarResizeHandles = updateHandles;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    let currentSide = 'right';

    function startResize(e, side) {
        e.preventDefault();
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebarWrapper.getBoundingClientRect().width;
        currentSide = side;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e) {
        if (!isResizing) return;
        const dx = e.clientX - startX;
        let newWidth;

        if (currentSide === 'right') {
            // Sidebar on right side of screen: dragging left increases width
            newWidth = startWidth - dx;
        } else {
            // Sidebar on left side of screen: dragging right increases width
            newWidth = startWidth + dx;
        }

        // Clamp width between min 150px and max 450px
        const minWidth = 150;
        const maxWidth = 450;
        newWidth = Math.max(minWidth, Math.min(maxWidth, Math.round(newWidth)));

        sidebarWrapper.style.width = `${newWidth}px`;

        if (typeof monacoEditor !== 'undefined' && monacoEditor) {
            monacoEditor.layout();
        }
    }

    async function onMouseUp() {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        const currentW = parseInt(sidebarWrapper.style.width, 10);
        if (!isNaN(currentW)) {
            await saveSidebarConfig({ width: currentW });
        }

        if (typeof monacoEditor !== 'undefined' && monacoEditor) {
            monacoEditor.layout();
        }
    }

    if (resizeLeft) {
        resizeLeft.addEventListener('mousedown', (e) => startResize(e, 'right'));
    }
    if (resizeRight) {
        resizeRight.addEventListener('mousedown', (e) => startResize(e, 'left'));
    }
}

function initGateway() {
    const gateway = document.getElementById('gateway-page');
    if (!gateway) return;

    // Time-of-day background fallback
    const hour = new Date().getHours();
    let bgImage = 'day.jpg';
    if (hour >= 17 && hour < 19) {
        bgImage = 'evening.jpg';
    } else if (hour >= 19 || hour < 6) {
        bgImage = 'night.jpg';
    }
    // Only set background image if theme has not explicitly disabled it
    const activeTheme = localStorage.getItem('synapse_setting_theme') || '';
    if (!activeTheme.includes('fluent')) {
        gateway.style.backgroundImage = `url('assets/loginbgs/${bgImage}')`;
    }

    // Keep bootscreen visible for 3 seconds, then trigger a smooth slow slide-out fade
    setTimeout(() => {
        gateway.classList.add('sliding-out');
        setTimeout(() => {
            gateway.remove();
        }, 1200);
    }, 3000);
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

function bootstrapApp() {
    initGateway();
    initTitleBar();
    initNavigation();
    initSidebar();
    initSidebarResizing();

    // Global action bar icon delegation
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#console-icon')) return;
        try {
            window.hwAPI?.openConsole?.();
        } catch (err) {
            console.error('[console-icon] openConsole failed', err);
        }
    }, true);

    document.addEventListener('theme:changed', () => {
        if (typeof renderFilesystem === 'function') renderFilesystem(false);
        if (typeof renderBookmarks === 'function') renderBookmarks();
    });

    // Show console at launch if configured
    try {
        if (localStorage.getItem('synapse_setting_show_console_at_launch') === 'true') {
            setTimeout(() => {
                window.hwAPI?.openConsole?.();
            }, 800);
        }
    } catch (_) {}
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
    bootstrapApp();
}
