/**
 * settings.js
 * Settings page category sidebar navigation, checkbox interactivity, and option button groups.
 */
(function () {
    const CLASSIC_LAYOUT_KEY = 'synapse_setting_classic_layout';
    const EDITOR_STYLE_KEY = 'synapse_setting_editorstyle';
    const ACTIONBAR_DIR_KEY = 'synapse_setting_actionbar_direction';
    const SIDEBAR_LAYOUT_KEY = 'synapse_setting_sidebarlayout';
    const NAVBAR_STYLE_KEY = 'synapse_setting_navbarstyle';
    const COMPACT_TABS_KEY = 'synapse_setting_compact_tabs';
    const COMPACT_BTNS_KEY = 'synapse_setting_compact_btns';
    const DEFAULT_TAB_CONTENT_KEY = 'synapse_setting_default_tab_content';
    const FONT_SIZE_KEY = 'synapse_setting_fontsize';
    const SMOOTH_CURSOR_KEY = 'synapse_setting_smooth_cursor';
    const SMOOTH_MOVEMENT_KEY = 'synapse_setting_smooth_movement';
    const UNSAVED_WARNINGS_KEY = 'synapse_setting_unsaved_warnings';
    const WORD_WRAP_KEY = 'synapse_setting_word_wrap';
    const ALWAYS_ON_TOP_KEY = 'synapse_setting_always_on_top';
    const INTERFACE_SCALE_KEY = 'synapse_setting_interface_scale';
    const ANIMATE_COLLAPSE_KEY = 'synapse_setting_animate_collapse';
    const TRANSPARENT_WINDOW_KEY = 'synapse_setting_transparent_window';
    const TAB_LENGTH_KEY = 'synapse_setting_tab_length';
    const MINIMAP_KEY = 'synapse_setting_minimap';
    const LANGUAGE_KEY = 'synapse_setting_language';
    const LOG_LSP_ERRORS_KEY = 'synapse_setting_log_lsp_errors';
    const MAX_LOG_COUNT_KEY = 'synapse_setting_max_log_count';
    const SHOW_CONSOLE_LAUNCH_KEY = 'synapse_setting_show_console_at_launch';
    const LUA_LANGUAGE_SERVER_KEY = 'synapse_setting_lua_language_server';
    const TOAST_SCALE_KEY = 'synapse_setting_toast_scale';
    let settingsBound = false;

    function initSettings() {
        const sidebar = document.getElementById('settings-sidebar');
        if (!sidebar) return;

        const entries = sidebar.querySelectorAll('.entry');
        const pages = document.getElementById('settings-pages');

        entries.forEach(entry => {
            entry.addEventListener('click', () => {
                const targetId = entry.dataset.page;
                if (!targetId) return;

                entries.forEach(e => {
                    e.classList.remove('select');
                    const icon = e.querySelector('iconify-icon');
                    const caption = e.querySelector('.caption');
                    if (icon) {
                        icon.classList.remove('opacity-100');
                        icon.classList.add('opacity-50', 'group-active:opacity-50');
                    }
                    if (caption) {
                        caption.classList.remove('opacity-100');
                        caption.classList.add('opacity-50', 'group-active:opacity-50');
                    }
                });

                entry.classList.add('select');
                const icon = entry.querySelector('iconify-icon');
                const caption = entry.querySelector('.caption');
                if (icon) {
                    icon.classList.add('opacity-100');
                    icon.classList.remove('opacity-50', 'group-active:opacity-50');
                }
                if (caption) {
                    caption.classList.add('opacity-100');
                    caption.classList.remove('opacity-50', 'group-active:opacity-50');
                }

                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        if (settingsBound) {
            restoreSettings();
            return;
        }
        settingsBound = true;

        // Single delegated handler on #application
        const settingsRoot = document.getElementById('application') || document;
        settingsRoot.addEventListener('click', (e) => {
            // Checkbox click
            const checkbox = e.target.closest('.hw-checkbox');
            if (checkbox && settingsRoot.contains(checkbox)) {
                e.stopPropagation();
                const next = !checkbox.classList.contains('on');
                if (checkbox.id === 'setting-classic-layout') {
                    console.log('[Settings] Toggling checkbox setting-classic-layout to:', next);
                }
                setCheckbox(checkbox, next);
                return;
            }

            // Option selector button click
            const optBtn = e.target.closest('button[id^="optsel-"]');
            if (optBtn && settingsRoot.contains(optBtn)) {
                e.stopPropagation();
                const match = optBtn.id.match(/^optsel-(\d+)-(.+)$/);
                if (match) {
                    const index = parseInt(match[1], 10);
                    const key = match[2];
                    selectOption(key, index);
                }
                return;
            }

            // Action container row click
            const container = e.target.closest('.action-container');
            if (!container || !settingsRoot.contains(container)) return;
            if (e.target.closest('button, input, .hw-dropdown, .hw-slider, .hw-button')) return;
            const rowCheckbox = container.querySelector('.hw-checkbox');
            if (!rowCheckbox) return;
            const next = !rowCheckbox.classList.contains('on');
            if (rowCheckbox.id === 'setting-classic-layout') {
                console.log('[Settings] Toggling checkbox setting-classic-layout to:', next);
            }
            setCheckbox(rowCheckbox, next);
        });

        const defTabInput = document.querySelector('#newtabcontent input') || document.getElementById('setting-default-tab-content');
        const defTabSaveBtn = document.getElementById('setting-default-tab-save-btn') || document.querySelector('#newtabcontent')?.parentElement?.querySelector('button');
        if (defTabSaveBtn && defTabInput) {
            const saveDefContent = () => {
                const val = defTabInput.value;
                localStorage.setItem(DEFAULT_TAB_CONTENT_KEY, val);
                const originalHtml = defTabSaveBtn.innerHTML;
                defTabSaveBtn.innerHTML = '<iconify-icon icon="fluent:checkmark-20-filled" class="flex items-center justify-center undefined"></iconify-icon> Saved';
                setTimeout(() => {
                    defTabSaveBtn.innerHTML = originalHtml;
                }, 1500);
            };
            defTabSaveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                saveDefContent();
            });
            defTabInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveDefContent();
                }
            });
        }

        // Reset all settings button handler
        const resetAllSettingsBtn = document.getElementById('btn-reset-all-settings') || document.querySelector('#appsettings .action-container button');
        if (resetAllSettingsBtn) {
            resetAllSettingsBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const confirmMsg = (typeof window.i18n?.t === 'function') 
                    ? window.i18n.t('settings-reset-confirm', 'Are you sure you want to reset all settings to their defaults?')
                    : 'Are you sure you want to reset all settings to their defaults?';
                
                let confirmed = false;
                if (typeof HWDialog !== 'undefined' && typeof HWDialog.confirm === 'function') {
                    confirmed = await HWDialog.confirm({
                        title: (typeof window.i18n?.t === 'function') ? window.i18n.t('settings-reset', 'Reset all settings') : 'Reset all settings',
                        message: confirmMsg,
                        confirmText: (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-yes', 'Yes') : 'Yes',
                        cancelText: (typeof window.i18n?.t === 'function') ? window.i18n.t('dialog-no', 'No') : 'No'
                    });
                } else {
                    confirmed = window.confirm(confirmMsg);
                }

                if (!confirmed) return;

                // Clear all synapse settings from localStorage
                const settingKeys = [
                    CLASSIC_LAYOUT_KEY, EDITOR_STYLE_KEY, ACTIONBAR_DIR_KEY, SIDEBAR_LAYOUT_KEY,
                    NAVBAR_STYLE_KEY, COMPACT_TABS_KEY, COMPACT_BTNS_KEY, DEFAULT_TAB_CONTENT_KEY,
                    FONT_SIZE_KEY, SMOOTH_CURSOR_KEY, SMOOTH_MOVEMENT_KEY, UNSAVED_WARNINGS_KEY,
                    WORD_WRAP_KEY, ALWAYS_ON_TOP_KEY, INTERFACE_SCALE_KEY, TOAST_SCALE_KEY,
                    ANIMATE_COLLAPSE_KEY, TRANSPARENT_WINDOW_KEY, TAB_LENGTH_KEY, MINIMAP_KEY,
                    LANGUAGE_KEY, LOG_LSP_ERRORS_KEY, MAX_LOG_COUNT_KEY, SHOW_CONSOLE_LAUNCH_KEY,
                    LUA_LANGUAGE_SERVER_KEY, 'synapse_setting_theme', 'synapse_active_theme'
                ];
                settingKeys.forEach(k => localStorage.removeItem(k));

                // Re-apply defaults
                if (typeof window.setLanguage === 'function') {
                    await window.setLanguage('english');
                }
                if (typeof window.loadTheme === 'function') {
                    window.loadTheme('hollywood-dark', true);
                }

                restoreSettings();

                if (typeof HW !== 'undefined' && HW.addMessage) {
                    HW.addMessage({
                        header: (typeof window.i18n?.t === 'function') ? window.i18n.t('tasks-header', 'Tasks') : 'Tasks',
                        desc: (typeof window.i18n?.t === 'function') ? window.i18n.t('settings-reset-feedback', 'Settings reset to defaults.') : 'Settings reset to defaults.',
                        state: 'complete',
                        autoDismiss: 3000
                    });
                }
            });
        }

        // Show changelog button handler
        const showChangelogBtn = document.getElementById('btn-show-changelog');
        if (showChangelogBtn) {
            showChangelogBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const changelogUrl = 'https://github.com/Okafor-twd/SynapseV3/Changelog.html';
                if (window.hwAPI?.openExternal) {
                    window.hwAPI.openExternal(changelogUrl);
                } else if (typeof require !== 'undefined') {
                    try {
                        const { shell } = require('electron');
                        if (shell) shell.openExternal(changelogUrl);
                        else window.open(changelogUrl, '_blank');
                    } catch (_) {
                        window.open(changelogUrl, '_blank');
                    }
                } else {
                    window.open(changelogUrl, '_blank');
                }
            });
        }

        /*
        const testConsoleLogsBtn = document.getElementById('btn-test-console-logs');
        if (testConsoleLogsBtn) {
            testConsoleLogsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.hwAPI?.openConsole?.();
                const time = new Date().toLocaleTimeString();
                setTimeout(() => {
                    window.hwAPI?.sendConsoleLog?.({ level: 'print', text: 'Hello from Lua print() output [Print test]', time });
                    window.hwAPI?.sendConsoleLog?.({ level: 'info', text: 'Script initialized successfully [Info test]', time });
                    window.hwAPI?.sendConsoleLog?.({ level: 'warn', text: 'Deprecated function call detected at line 14 [Warning test]', time });
                    window.hwAPI?.sendConsoleLog?.({ level: 'error', text: 'Workspace script runtime error: attempt to index nil with \'Character\' [Error test]', time });
                }, 300);
            });
        }
        */

        // Live slider value text update & bindings
        document.querySelectorAll('.hw-slider').forEach(slider => {
            const range = slider.querySelector('input[type="range"]');
            const span = slider.querySelector('span');
            const numInput = slider.querySelector('input[type="number"]');
            if (range) {
                range.addEventListener('input', () => {
                    if (span) span.textContent = range.value;
                    if (numInput) numInput.value = range.value;
                    if (range.id === 'setting-font-size') {
                        applyFontSize(range.value);
                    } else if (range.id === 'setting-tab-length') {
                        applyTabLength(range.value);
                    } else if (range.id === 'setting-interface-scale') {
                        applyInterfaceScale(range.value);
                    } else if (range.id === 'setting-toast-scale') {
                        applyToastScale(range.value);
                    } else if (range.id === 'setting-max-log-count') {
                        applyMaxLogCount(range.value);
                    }
                });
            }
            if (numInput) {
                const commitNumInput = () => {
                    let val = parseInt(numInput.value, 10);
                    if (isNaN(val)) val = 100;
                    const min = parseInt(numInput.min || '25', 10);
                    const max = parseInt(numInput.max || '150', 10);
                    val = Math.max(min, Math.min(max, val));
                    numInput.value = val;
                    if (range) range.value = val;
                    if (numInput.id === 'setting-interface-scale-input') {
                        applyInterfaceScale(val);
                    } else if (numInput.id === 'setting-toast-scale-input') {
                        applyToastScale(val);
                    }
                };

                numInput.addEventListener('change', commitNumInput);
                numInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commitNumInput();
                        numInput.blur();
                    }
                });
            }
        });

        // Dropdown toggle & selection handling (for Settings page)
        document.querySelectorAll('#page-settings .hw-dropdown').forEach(dropdown => {
            if (dropdown.id === 'setting-ui-language-dropdown') return;
            const selector = dropdown.querySelector('.selector');
            const list = dropdown.querySelector('.list');
            const chevron = selector?.querySelector('iconify-icon');

            if (selector && list) {
                selector.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isClosed = list.classList.contains('hidden');
                    document.querySelectorAll('.hw-dropdown .list').forEach(l => {
                        l.classList.add('hidden');
                        l.classList.remove('flex');
                    });
                    document.querySelectorAll('.hw-dropdown .selector iconify-icon').forEach(c => c.classList.remove('rotate-180'));
                    if (isClosed) {
                        list.classList.remove('hidden');
                        list.classList.add('flex');
                        if (chevron) chevron.classList.add('rotate-180');
                    }
                });

                list.querySelectorAll(':scope > div').forEach(item => {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const entryText = (item.querySelector('.dropdown-entry')?.textContent || item.textContent).trim();
                        const selEntry = selector.querySelector('.dropdown-entry');
                        if (selEntry) selEntry.textContent = entryText;
                        list.querySelectorAll('.highlight').forEach(h => h.classList.remove('highlight'));
                        item.classList.add('highlight');
                        list.classList.add('hidden');
                        list.classList.remove('flex');
                        if (chevron) chevron.classList.remove('rotate-180');
                        if (dropdown.id === 'setting-ui-language-dropdown') {
                            localStorage.setItem(LANGUAGE_KEY, entryText);
                        }
                    });
                });
            }
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.hw-dropdown .list').forEach(l => {
                l.classList.add('hidden');
                l.classList.remove('flex');
            });
            document.querySelectorAll('.hw-dropdown .selector iconify-icon').forEach(c => c.classList.remove('rotate-180'));
        });

        restoreSettings();
    }

    function selectOption(key, index) {
        // Toggle outline on buttons in that group
        document.querySelectorAll(`button[id^="optsel-"][id$="-${key}"]`).forEach(btn => {
            if (btn.id === `optsel-${index}-${key}`) {
                btn.classList.add('outline', 'outline-2');
            } else {
                btn.classList.remove('outline', 'outline-2');
            }
        });

        if (key === 'editorstyle') {
            applyEditorStyle(index);
        } else if (key === 'actionbar-direction') {
            applyActionBarDirection(index);
        } else if (key === 'sidebarlayout') {
            applySidebarLayout(index);
        } else if (key === 'navbarstyle') {
            applyNavbarStyle(index);
        } else if (key === 'minimap') {
            applyMinimap(index);
        }
    }

    function applyEditorStyle(index) {
        const tabsContainer = document.querySelector('.tabs-container');
        const mainContainer = document.querySelector('.main-container');
        const actionsBar = document.getElementById('actions');

        if (index === 1) {
            // Actions on top, tabs on bottom
            if (actionsBar) {
                actionsBar.style.order = '0';
                actionsBar.classList.remove('border-t');
                actionsBar.classList.add('border-b');
            }
            if (mainContainer) {
                mainContainer.style.order = '1';
            }
            if (tabsContainer) {
                tabsContainer.style.order = '2';
                tabsContainer.classList.remove('border-b');
                tabsContainer.classList.add('border-t');
            }
        } else {
            // Actions on bottom, tabs on top (default)
            if (tabsContainer) {
                tabsContainer.style.order = '0';
                tabsContainer.classList.remove('border-t');
                tabsContainer.classList.add('border-b');
            }
            if (mainContainer) {
                mainContainer.style.order = '1';
            }
            if (actionsBar) {
                actionsBar.style.order = '2';
                actionsBar.classList.remove('border-b');
                actionsBar.classList.add('border-t');
            }
        }

        if (typeof monacoEditor !== 'undefined' && monacoEditor) {
            setTimeout(() => monacoEditor.layout(), 20);
        }
        localStorage.setItem(EDITOR_STYLE_KEY, index.toString());
    }

    function applyActionBarDirection(index) {
        const actionsBar = document.getElementById('actions');
        if (!actionsBar) return;
        const actionIcons = actionsBar.querySelector('.flex.gap-1.px-1') || actionsBar.firstElementChild;
        const actionList = actionsBar.querySelector('.action-list');

        if (index === 0) {
            // Align to left (Classic style): disable margin-left: auto on action-list, enable on action-icons
            if (actionList) {
                actionList.style.order = '0';
                actionList.style.marginLeft = '0px';
                actionList.style.marginRight = 'auto';
                actionList.classList.remove('ml-auto', 'mr-0');
                actionList.classList.add('mr-auto', 'ml-0');
            }
            if (actionIcons) {
                actionIcons.style.order = '10';
                actionIcons.style.marginLeft = 'auto';
                actionIcons.style.marginRight = '0px';
                actionIcons.classList.remove('mr-auto');
                actionIcons.classList.add('ml-auto');
            }
        } else {
            // Align to right (Modern style): restore margin-left: auto on action-list, disable on action-icons
            if (actionIcons) {
                actionIcons.style.order = '0';
                actionIcons.style.marginLeft = '0px';
                actionIcons.style.marginRight = '0px';
                actionIcons.classList.remove('ml-auto');
            }
            if (actionList) {
                actionList.style.order = '10';
                actionList.style.marginLeft = 'auto';
                actionList.style.marginRight = '0px';
                actionList.classList.remove('mr-auto', 'ml-0');
                actionList.classList.add('ml-auto', 'mr-0');
            }
        }
        localStorage.setItem(ACTIONBAR_DIR_KEY, index.toString());
    }

    function applySidebarLayout(index) {
        const sidebarWrapper = document.getElementById('sidebar-wrapper');
        const sidebarInner = sidebarWrapper?.querySelector('.sidebar');
        if (index === 0) {
            // Align to left
            if (sidebarWrapper) sidebarWrapper.style.order = '-1';
            if (sidebarInner) {
                sidebarInner.classList.remove('border-l');
                sidebarInner.classList.add('border-r');
            }
        } else {
            // Align to right
            if (sidebarWrapper) sidebarWrapper.style.order = '10';
            if (sidebarInner) {
                sidebarInner.classList.remove('border-r');
                sidebarInner.classList.add('border-l');
            }
        }
        if (typeof window.updateSidebarResizeHandles === 'function') {
            window.updateSidebarResizeHandles();
        }
        if (typeof monacoEditor !== 'undefined' && monacoEditor) {
            setTimeout(() => monacoEditor.layout(), 20);
        }
        localStorage.setItem(SIDEBAR_LAYOUT_KEY, index.toString());
    }

    function applyMinimap(index) {
        index = parseInt(index, 10);
        if (isNaN(index) || index < 0 || index > 2) index = 1;

        if (typeof monacoEditor !== 'undefined' && monacoEditor) {
            if (index === 0) {
                monacoEditor.updateOptions({ minimap: { enabled: false } });
            } else if (index === 1) {
                monacoEditor.updateOptions({ minimap: { enabled: true, side: 'right' } });
            } else if (index === 2) {
                monacoEditor.updateOptions({ minimap: { enabled: true, side: 'left' } });
            }
        }
        localStorage.setItem(MINIMAP_KEY, index.toString());
    }

    function applyFontSize(size) {
        size = parseInt(size, 10) || 16;
        if (typeof monacoEditor !== 'undefined' && monacoEditor) {
            monacoEditor.updateOptions({ fontSize: size });
        }
        localStorage.setItem(FONT_SIZE_KEY, size.toString());
    }

    function applyTabLength(length) {
        length = parseInt(length, 10) || 4;
        if (typeof monacoEditor !== 'undefined' && monacoEditor) {
            monacoEditor.updateOptions({ tabSize: length, indentSize: length });
        }
        localStorage.setItem(TAB_LENGTH_KEY, length.toString());
    }

    function applySmoothCursor(enabled) {
        enabled = !!enabled;
        if (typeof monacoEditor !== 'undefined' && monacoEditor) {
            monacoEditor.updateOptions({ cursorSmoothCaretAnimation: enabled ? 'on' : 'off' });
        }
        localStorage.setItem(SMOOTH_CURSOR_KEY, enabled ? 'true' : 'false');
    }

    function applySmoothMovement(enabled) {
        enabled = !!enabled;
        if (typeof monacoEditor !== 'undefined' && monacoEditor) {
            monacoEditor.updateOptions({ smoothScrolling: enabled });
        }
        localStorage.setItem(SMOOTH_MOVEMENT_KEY, enabled ? 'true' : 'false');
    }

    function applyUnsavedWarnings(enabled) {
        enabled = !!enabled;
        localStorage.setItem(UNSAVED_WARNINGS_KEY, enabled ? 'true' : 'false');
    }

    function applyWordWrap(enabled) {
        enabled = !!enabled;
        if (typeof monacoEditor !== 'undefined' && monacoEditor) {
            monacoEditor.updateOptions({ wordWrap: enabled ? 'on' : 'off' });
        }
        localStorage.setItem(WORD_WRAP_KEY, enabled ? 'true' : 'false');
    }

    function applyAlwaysOnTop(enabled) {
        enabled = !!enabled;
        if (window.hwAPI?.setAlwaysOnTop) {
            window.hwAPI.setAlwaysOnTop(enabled);
        } else if (typeof require !== 'undefined') {
            try {
                const { ipcRenderer } = require('electron');
                ipcRenderer.send('window:set-always-on-top', enabled);
            } catch (e) {}
        }
        localStorage.setItem(ALWAYS_ON_TOP_KEY, enabled ? 'true' : 'false');
    }

    function applyInterfaceScale(scale) {
        scale = parseInt(scale, 10) || 100;
        const factor = scale / 100;

        if (window.hwAPI?.setZoomFactor) {
            window.hwAPI.setZoomFactor(factor);
        } else if (typeof require !== 'undefined') {
            try {
                const { webFrame } = require('electron');
                if (webFrame) webFrame.setZoomFactor(factor);
            } catch (e) {}
        } else {
            document.documentElement.style.zoom = factor;
        }

        if (typeof monacoEditor !== 'undefined' && monacoEditor) {
            setTimeout(() => monacoEditor.layout(), 50);
        }
        localStorage.setItem(INTERFACE_SCALE_KEY, scale.toString());
    }

    function applyToastScale(scale) {
        scale = parseInt(scale, 10) || 100;
        document.documentElement.style.setProperty('--toast-scale', (scale / 100).toString());
        localStorage.setItem(TOAST_SCALE_KEY, scale.toString());
    }

    function applyNavbarStyle(index) {
        const isLeft = index === 1;
        const appEl = document.getElementById('application');
        if (appEl) appEl.classList.toggle('left-nav-layout', isLeft);
        document.documentElement.classList.toggle('left-nav-layout', isLeft);
        if (document.body) document.body.classList.toggle('left-nav-layout', isLeft);

        if (typeof monacoEditor !== 'undefined' && monacoEditor) {
            setTimeout(() => monacoEditor.layout(), 20);
        }
        localStorage.setItem(NAVBAR_STYLE_KEY, index.toString());
    }

    function restoreSettings() {
        restoreClassicLayout();

        // Restore Editor style (default 0: actions bottom, tabs top)
        const savedEditorStyle = parseInt(localStorage.getItem(EDITOR_STYLE_KEY) || '0', 10);
        selectOption('editorstyle', savedEditorStyle);

        // Restore Action bar direction (default 1: modern/right)
        const savedActionbarDir = parseInt(localStorage.getItem(ACTIONBAR_DIR_KEY) || '1', 10);
        selectOption('actionbar-direction', savedActionbarDir);

        // Restore Sidebar layout (default 1: right)
        const savedSidebarLayout = parseInt(localStorage.getItem(SIDEBAR_LAYOUT_KEY) || '1', 10);
        selectOption('sidebarlayout', savedSidebarLayout);

        // Restore Navbar style (default 0: top)
        const savedNavbarStyle = parseInt(localStorage.getItem(NAVBAR_STYLE_KEY) || '0', 10);
        selectOption('navbarstyle', savedNavbarStyle);

        // Restore Minimap (default 1: right)
        const savedMinimap = parseInt(localStorage.getItem(MINIMAP_KEY) || '1', 10);
        selectOption('minimap', savedMinimap);

        // Restore Compact tabs
        const compactTabsSaved = localStorage.getItem(COMPACT_TABS_KEY) === 'true';
        const compactTabsCheckbox = document.getElementById('setting-compact-tabs');
        if (compactTabsCheckbox) {
            setCheckbox(compactTabsCheckbox, compactTabsSaved);
        } else {
            applyCompactTabs(compactTabsSaved);
        }

        // Restore Compact editor buttons
        const compactBtnsSaved = localStorage.getItem(COMPACT_BTNS_KEY) === 'true';
        const compactBtnsCheckbox = document.getElementById('setting-compact-btns');
        if (compactBtnsCheckbox) {
            setCheckbox(compactBtnsCheckbox, compactBtnsSaved);
        } else {
            applyCompactButtons(compactBtnsSaved);
        }

        // Restore Default Tab Content
        const defTabInput = document.querySelector('#newtabcontent input') || document.getElementById('setting-default-tab-content');
        if (defTabInput) {
            const savedContent = localStorage.getItem(DEFAULT_TAB_CONTENT_KEY);
            if (savedContent !== null) {
                defTabInput.value = savedContent;
            } else {
                defTabInput.value = "print('Synapse winning!')";
            }
        }

        // Restore Font size (default: 16)
        const savedFontSize = localStorage.getItem(FONT_SIZE_KEY) || '16';
        const fontSlider = document.getElementById('setting-font-size');
        if (fontSlider) {
            fontSlider.value = savedFontSize;
            const span = fontSlider.parentElement?.querySelector('span');
            if (span) span.textContent = savedFontSize;
        }
        applyFontSize(savedFontSize);

        // Restore Tab Length (default: 4)
        const savedTabLength = localStorage.getItem(TAB_LENGTH_KEY) || '4';
        const tabSlider = document.getElementById('setting-tab-length');
        if (tabSlider) {
            tabSlider.value = savedTabLength;
            const span = tabSlider.parentElement?.querySelector('span');
            if (span) span.textContent = savedTabLength;
        }
        applyTabLength(savedTabLength);

        // Restore Smooth Cursor (default: true)
        const smoothCursorSaved = localStorage.getItem(SMOOTH_CURSOR_KEY) !== 'false';
        const smoothCursorCheckbox = document.getElementById('setting-smooth-cursor');
        if (smoothCursorCheckbox) setCheckbox(smoothCursorCheckbox, smoothCursorSaved);
        else applySmoothCursor(smoothCursorSaved);

        // Restore Smooth Movement (default: true)
        const smoothMovementSaved = localStorage.getItem(SMOOTH_MOVEMENT_KEY) !== 'false';
        const smoothMovementCheckbox = document.getElementById('setting-smooth-movement');
        if (smoothMovementCheckbox) setCheckbox(smoothMovementCheckbox, smoothMovementSaved);
        else applySmoothMovement(smoothMovementSaved);

        // Restore Unsaved Warnings (default: true)
        const unsavedWarningsSaved = localStorage.getItem(UNSAVED_WARNINGS_KEY) !== 'false';
        const unsavedWarningsCheckbox = document.getElementById('setting-unsaved-warnings');
        if (unsavedWarningsCheckbox) setCheckbox(unsavedWarningsCheckbox, unsavedWarningsSaved);
        else applyUnsavedWarnings(unsavedWarningsSaved);

        // Restore Word Wrap (default: false)
        const wordWrapSaved = localStorage.getItem(WORD_WRAP_KEY) === 'true';
        const wordWrapCheckbox = document.getElementById('setting-word-wrap');
        if (wordWrapCheckbox) setCheckbox(wordWrapCheckbox, wordWrapSaved);
        else applyWordWrap(wordWrapSaved);

        // Restore Always on top (default: false)
        const alwaysOnTopSaved = localStorage.getItem(ALWAYS_ON_TOP_KEY) === 'true';
        const alwaysOnTopCheckbox = document.getElementById('setting-always-on-top');
        if (alwaysOnTopCheckbox) setCheckbox(alwaysOnTopCheckbox, alwaysOnTopSaved);
        else applyAlwaysOnTop(alwaysOnTopSaved);

        // Restore Animate collapse (default: false)
        const animateCollapseSaved = localStorage.getItem(ANIMATE_COLLAPSE_KEY) === 'true';
        const animateCollapseCheckbox = document.getElementById('setting-animate-collapse');
        if (animateCollapseCheckbox) setCheckbox(animateCollapseCheckbox, animateCollapseSaved);
        else applyAnimateCollapse(animateCollapseSaved);

        // Restore Transparent window (default: false)
        const transparentWindowSaved = localStorage.getItem(TRANSPARENT_WINDOW_KEY) === 'true';
        const transparentWindowCheckbox = document.getElementById('setting-transparent-window');
        if (transparentWindowCheckbox) setCheckbox(transparentWindowCheckbox, transparentWindowSaved);
        else applyTransparentWindow(transparentWindowSaved);

        // Restore Interface Scale (default: 100)
        const savedScale = localStorage.getItem(INTERFACE_SCALE_KEY) || '100';
        const scaleSlider = document.getElementById('setting-interface-scale');
        const scaleInput = document.getElementById('setting-interface-scale-input');
        if (scaleSlider) {
            scaleSlider.value = savedScale;
        }
        if (scaleInput) {
            scaleInput.value = savedScale;
        }
        applyInterfaceScale(savedScale);

        // Restore Toast Scale (default: 100)
        const savedToastScale = localStorage.getItem(TOAST_SCALE_KEY) || '100';
        const toastScaleSlider = document.getElementById('setting-toast-scale');
        const toastScaleInput = document.getElementById('setting-toast-scale-input');
        if (toastScaleSlider) {
            toastScaleSlider.value = savedToastScale;
        }
        if (toastScaleInput) {
            toastScaleInput.value = savedToastScale;
        }
        applyToastScale(savedToastScale);

        // Restore UI Language
        const savedLanguage = localStorage.getItem(LANGUAGE_KEY) || 'English (default)';
        const langDropdown = document.getElementById('setting-ui-language-dropdown');
        if (langDropdown) {
            const selEntry = langDropdown.querySelector('.selector .dropdown-entry');
            if (selEntry) selEntry.textContent = savedLanguage;
            langDropdown.querySelectorAll('.list > div').forEach(item => {
                const text = (item.querySelector('.dropdown-entry')?.textContent || item.textContent).trim();
                if (text === savedLanguage.trim()) {
                    langDropdown.querySelectorAll('.highlight').forEach(h => h.classList.remove('highlight'));
                    item.classList.add('highlight');
                }
            });
        }

        // Restore Console settings
        const logLspErrorsSaved = localStorage.getItem(LOG_LSP_ERRORS_KEY) === 'true';
        const logLspCheckbox = document.getElementById('setting-log-lsp-errors');
        if (logLspCheckbox) setCheckbox(logLspCheckbox, logLspErrorsSaved);
        else applyLogLspErrors(logLspErrorsSaved);

        const savedMaxLogs = localStorage.getItem(MAX_LOG_COUNT_KEY) || '720';
        const maxLogsSlider = document.getElementById('setting-max-log-count');
        if (maxLogsSlider) {
            maxLogsSlider.value = savedMaxLogs;
            const span = document.getElementById('setting-max-log-count-val') || maxLogsSlider.parentElement?.querySelector('span');
            if (span) span.textContent = savedMaxLogs;
        }
        applyMaxLogCount(savedMaxLogs);

        const showConsoleLaunchSaved = localStorage.getItem(SHOW_CONSOLE_LAUNCH_KEY) === 'true';
        const showConsoleLaunchCheckbox = document.getElementById('setting-show-console-at-launch');
        if (showConsoleLaunchCheckbox) setCheckbox(showConsoleLaunchCheckbox, showConsoleLaunchSaved);
        else applyShowConsoleAtLaunch(showConsoleLaunchSaved);

        // Restore Lua Language Server (default: true)
        const luaLspSaved = localStorage.getItem(LUA_LANGUAGE_SERVER_KEY) !== 'false';
        const luaLspCheckbox = document.getElementById('setting-lua-language-server');
        if (luaLspCheckbox) setCheckbox(luaLspCheckbox, luaLspSaved);
        else applyLuaLanguageServer(luaLspSaved);
    }

    function restoreClassicLayout() {
        const classicSaved = localStorage.getItem(CLASSIC_LAYOUT_KEY) === 'true';
        const classicCheckbox = document.getElementById('setting-classic-layout');
        if (classicCheckbox) {
            setCheckbox(classicCheckbox, classicSaved);
        } else {
            applyClassicLayout(classicSaved);
        }
    }

    function setCheckbox(checkbox, state) {
        if (!checkbox) return;
        const icon = checkbox.querySelector('.icon') || checkbox.querySelector('div');
        if (state) {
            checkbox.classList.add('on');
            checkbox.setAttribute('value', 'true');
            if (icon) {
                icon.classList.remove('translate-x-1');
                icon.classList.add('translate-x-5');
            }
        } else {
            checkbox.classList.remove('on');
            checkbox.removeAttribute('value');
            if (icon) {
                icon.classList.remove('translate-x-5');
                icon.classList.add('translate-x-1');
            }
        }

        if (checkbox.id === 'setting-classic-layout') {
            applyClassicLayout(state);
        } else if (checkbox.id === 'setting-compact-tabs') {
            applyCompactTabs(state);
        } else if (checkbox.id === 'setting-compact-btns') {
            applyCompactButtons(state);
        } else if (checkbox.id === 'setting-smooth-cursor') {
            applySmoothCursor(state);
        } else if (checkbox.id === 'setting-smooth-movement') {
            applySmoothMovement(state);
        } else if (checkbox.id === 'setting-unsaved-warnings') {
            applyUnsavedWarnings(state);
        } else if (checkbox.id === 'setting-word-wrap') {
            applyWordWrap(state);
        } else if (checkbox.id === 'setting-always-on-top') {
            applyAlwaysOnTop(state);
        } else if (checkbox.id === 'setting-animate-collapse') {
            applyAnimateCollapse(state);
        } else if (checkbox.id === 'setting-transparent-window') {
            applyTransparentWindow(state);
        } else if (checkbox.id === 'setting-log-lsp-errors') {
            applyLogLspErrors(state);
        } else if (checkbox.id === 'setting-show-console-at-launch') {
            applyShowConsoleAtLaunch(state);
        } else if (checkbox.id === 'setting-lua-language-server') {
            applyLuaLanguageServer(state);
        }
    }

    function applyLuaLanguageServer(enabled) {
        enabled = !!enabled;
        localStorage.setItem(LUA_LANGUAGE_SERVER_KEY, enabled ? 'true' : 'false');
        window.hwAPI?.setSetting?.('lua_language_server', enabled);
    }

    function applyLogLspErrors(enabled) {
        enabled = !!enabled;
        localStorage.setItem(LOG_LSP_ERRORS_KEY, enabled ? 'true' : 'false');
        window.hwAPI?.setSetting?.('log_lsp_errors', enabled);
    }

    function applyMaxLogCount(count) {
        count = parseInt(count, 10) || 720;
        localStorage.setItem(MAX_LOG_COUNT_KEY, count.toString());
        window.hwAPI?.setSetting?.('max_log_count', count);
    }

    function applyShowConsoleAtLaunch(enabled) {
        enabled = !!enabled;
        localStorage.setItem(SHOW_CONSOLE_LAUNCH_KEY, enabled ? 'true' : 'false');
        window.hwAPI?.setSetting?.('show_console_at_launch', enabled);
    }

    function applyTransparentWindow(enabled) {
        enabled = !!enabled;
        localStorage.setItem(TRANSPARENT_WINDOW_KEY, enabled ? 'true' : 'false');
        window.hwAPI?.setSetting?.('transparent_window', enabled);
    }

    function applyAnimateCollapse(enabled) {
        enabled = !!enabled;
        const appEl = document.getElementById('application');
        if (appEl) appEl.classList.toggle('animate-collapse', enabled);
        document.documentElement.classList.toggle('animate-collapse', enabled);
        if (document.body) document.body.classList.toggle('animate-collapse', enabled);

        localStorage.setItem(ANIMATE_COLLAPSE_KEY, enabled ? 'true' : 'false');
    }

    function applyCompactButtons(enabled) {
        enabled = !!enabled;
        const appEl = document.getElementById('application');
        if (appEl) appEl.classList.toggle('compact-btns', enabled);
        document.documentElement.classList.toggle('compact-btns', enabled);
        if (document.body) document.body.classList.toggle('compact-btns', enabled);

        localStorage.setItem(COMPACT_BTNS_KEY, enabled ? 'true' : 'false');
    }

    function applyCompactTabs(enabled) {
        enabled = !!enabled;
        const appEl = document.getElementById('application');
        if (appEl) appEl.classList.toggle('compact-tabs', enabled);
        document.documentElement.classList.toggle('compact-tabs', enabled);
        if (document.body) document.body.classList.toggle('compact-tabs', enabled);

        if (typeof monacoEditor !== 'undefined' && monacoEditor) {
            setTimeout(() => monacoEditor.layout(), 20);
        }
        localStorage.setItem(COMPACT_TABS_KEY, enabled ? 'true' : 'false');
    }

    function applyClassicLayout(enabled) {
        enabled = !!enabled;
        const appEl = document.getElementById('application');
        if (appEl) appEl.classList.toggle('classic-layout', enabled);
        document.documentElement.classList.toggle('classic-layout', enabled);
        if (document.body) document.body.classList.toggle('classic-layout', enabled);

        const hamburger = document.getElementById('ban_control_hamburger');
        if (hamburger) {
            hamburger.style.setProperty('display', enabled ? 'flex' : 'none', 'important');
            hamburger.setAttribute('aria-hidden', enabled ? 'false' : 'true');
        }

        const navBar = document.querySelector('.hw-navigationbar');
        if (navBar) navBar.classList.remove('open');
        const backdrop = document.getElementById('classic-nav-backdrop');
        if (backdrop) backdrop.classList.remove('open');

        if (enabled) {
            applyActionBarDirection(0);
        } else {
            const savedActionbarDir = parseInt(localStorage.getItem(ACTIONBAR_DIR_KEY) || '1', 10);
            applyActionBarDirection(savedActionbarDir);
        }

        localStorage.setItem(CLASSIC_LAYOUT_KEY, enabled ? 'true' : 'false');
    }

    window.setCheckbox = setCheckbox;
    window.applyClassicLayout = applyClassicLayout;
    window.selectOption = selectOption;
    window.testConsoleLogs = (level = 'all', text = '') => {
        const time = new Date().toLocaleTimeString();
        window.hwAPI?.openConsole?.();
        setTimeout(() => {
            if (level === 'all' || !level) {
                window.hwAPI?.sendConsoleLog?.({ level: 'print', text: text || 'Hello from Lua print() output [Print test]', time });
                window.hwAPI?.sendConsoleLog?.({ level: 'info', text: text || 'Script initialized successfully [Info test]', time });
                window.hwAPI?.sendConsoleLog?.({ level: 'warn', text: text || 'Deprecated function call detected at line 14 [Warning test]', time });
                window.hwAPI?.sendConsoleLog?.({ level: 'error', text: text || 'Workspace script runtime error: attempt to index nil with \'Character\' [Error test]', time });
            } else {
                window.hwAPI?.sendConsoleLog?.({ level, text: text || `Test message with level ${level}`, time });
            }
        }, 200);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSettings);
    } else {
        initSettings();
    }
})();
