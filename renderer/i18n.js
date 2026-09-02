/**
 * i18n.js
 * Internationalization & Localization Engine for Synapse X v3.
 * Supports 15 languages loaded from assets/lang/*.json.
 */

(function () {
    const LANGUAGE_KEY = 'synapse_setting_language';

    const LANGUAGES = [
        { id: 'english', name: 'English', file: 'english.json' },
        { id: 'portuguese-brazil', name: 'Português (Brasil)', file: 'portuguese-brazil.json' },
        { id: 'spanish', name: 'Español', file: 'spanish.json' },
        { id: 'filipino', name: 'Filipino', file: 'filipino.json' },
        { id: 'german', name: 'Deutsch', file: 'german.json' },
        { id: 'hungarian', name: 'Magyar', file: 'hungarian.json' },
        { id: 'indonesian', name: 'Bahasa Indonesia', file: 'indonesian.json' },
        { id: 'italian', name: 'Italiano', file: 'italian.json' },
        { id: 'korean', name: '한국어', file: 'korean.json' },
        { id: 'polish', name: 'Polski', file: 'polish.json' },
        { id: 'romanian', name: 'Română', file: 'romanian.json' },
        { id: 'slovak', name: 'Slovenčina', file: 'slovak.json' },
        { id: 'thai', name: 'ภาษาไทย', file: 'thai.json' },
        { id: 'turkish', name: 'Türkçe', file: 'turkish.json' },
        { id: 'vietnamese', name: 'Tiếng Việt', file: 'vietnamese.json' }
    ];

    let currentLanguageId = 'english';
    let translations = {};
    let fallbackTranslations = {};

    const SELECTOR_MAP = [
        // Navigation bar labels (pure hover labels, no native title tooltips)
        { sel: '#nav-editor .label', key: 'page-editor', prefixIcon: 'fluent:window-console-20-filled' },
        { sel: '#nav-themes .label', key: 'page-customization', fallback: 'Customizations', prefixIcon: 'fluent:paint-brush-20-filled' },
        { sel: '#nav-plugins .label', key: 'page-powertools', fallback: 'Plugins', prefixIcon: 'fluent:puzzle-piece-20-filled' },
        { sel: '#nav-settings .label', key: 'page-settings', prefixIcon: 'fluent:settings-20-filled' },

        // Action bar buttons
        { sel: '#execute-button .btn-text', key: 'button-execute' },
        { sel: '#clear-button .btn-text', key: 'button-clear' },
        { sel: '#openf-button .btn-text', key: 'button-open-file' },
        { sel: '#executef-button .btn-text', key: 'button-execute-file' },
        { sel: '#savef-button .btn-text', key: 'button-save-file' },
        { sel: '#console-icon', attr: 'title', key: 'settings-category-console', fallback: 'Open console' },
        { sel: '#documentation-icon', attr: 'title', key: 'page-documentation', fallback: 'Open documentation' },

        // Settings Sidebar entries
        { sel: '#settings-sidebar [data-page="appsettings"] .caption', key: 'settings-appcategory', fallback: 'Application' },
        { sel: '#settings-sidebar [data-page="settings-category-editor"] .caption', key: 'settings-category-editor' },
        { sel: '#settings-sidebar [data-page="settings-category-console"] .caption', key: 'settings-category-console', fallback: 'Console' },
        { sel: '#settings-sidebar [data-page="settings-category-interface"] .caption', key: 'settings-category-interface', fallback: 'Layout' },
        { sel: '#settings-sidebar [data-page="settings-category-misc"] .caption', key: 'settings-category-misc', fallback: 'Miscellaneous' },

        // Settings dropdown selectors
        { sel: '#optsel-0-editorstyle div', key: 'settings-editor-opt1', fallback: 'Actions on bottom, tabs on top' },
        { sel: '#optsel-1-editorstyle div', key: 'settings-editor-opt2', fallback: 'Actions on top, tabs on bottom' },
        { sel: '#optsel-0-actionbar-direction div', key: 'settings-actionbar-opt1', fallback: 'Align to left (Classic style)' },
        { sel: '#optsel-1-actionbar-direction div', key: 'settings-actionbar-opt2', fallback: 'Align to right (Modern style)' },
        { sel: '#optsel-0-sidebarlayout div', key: 'settings-sidebar-opt1', fallback: 'Left' },
        { sel: '#optsel-1-sidebarlayout div', key: 'settings-sidebar-opt2', fallback: 'Right' },
        { sel: '#optsel-0-navbarstyle div', key: 'settings-navbar-opt1', fallback: 'Top' },
        { sel: '#optsel-1-navbarstyle div', key: 'settings-navbar-opt2', fallback: 'Left' },
        { sel: '#optsel-0-minimap div', key: 'settings-minimap-opt1', fallback: 'Disabled' },
        { sel: '#optsel-1-minimap div', key: 'settings-minimap-opt2', fallback: 'Right' },
        { sel: '#optsel-2-minimap div', key: 'settings-minimap-opt3', fallback: 'Left' }
    ];

    function t(key, fallback = '') {
        if (!key) return fallback;
        if (translations && translations[key] !== undefined) return translations[key];
        if (fallbackTranslations && fallbackTranslations[key] !== undefined) return fallbackTranslations[key];
        return fallback || key;
    }

    async function loadTranslationData(langId) {
        const langObj = LANGUAGES.find(l => l.id === langId || l.name.toLowerCase() === langId.toLowerCase()) || LANGUAGES[0];
        
        // 1. Try Node fs if available (Electron environment)
        if (typeof require !== 'undefined') {
            try {
                const fs = require('fs');
                const path = require('path');
                const possiblePaths = [
                    path.join(__dirname, '..', 'assets', 'lang', langObj.file),
                    path.join(__dirname, 'assets', 'lang', langObj.file),
                    path.join(process.cwd(), 'assets', 'lang', langObj.file),
                    path.join(process.cwd(), 'ReconstructedApp', 'assets', 'lang', langObj.file)
                ];
                for (const p of possiblePaths) {
                    if (fs.existsSync(p)) {
                        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                        if (data && data.translation) return data.translation;
                    }
                }
            } catch (e) {}
        }

        // 2. Try window.hwAPI if available
        if (window.hwAPI?.readAsset) {
            try {
                const content = await window.hwAPI.readAsset(`assets/lang/${langObj.file}`);
                if (content) {
                    const data = JSON.parse(content);
                    if (data && data.translation) return data.translation;
                }
            } catch (_) {}
        }

        // 3. Try fetch
        const urls = [
            `assets/lang/${langObj.file}`,
            `../assets/lang/${langObj.file}`,
            `./assets/lang/${langObj.file}`
        ];
        for (const u of urls) {
            try {
                const resp = await fetch(u);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && data.translation) return data.translation;
                }
            } catch (_) {}
        }

        return {};
    }

    async function setLanguage(langId, save = true) {
        const langObj = LANGUAGES.find(l => l.id === langId || l.name.toLowerCase() === langId.toLowerCase() || (l.flag + ' ' + l.name).toLowerCase() === langId.toLowerCase()) || LANGUAGES[0];
        currentLanguageId = langObj.id;

        if (save) {
            localStorage.setItem(LANGUAGE_KEY, currentLanguageId);
        }

        // Load translations
        translations = await loadTranslationData(currentLanguageId);

        // Ensure fallback english is also loaded
        if (currentLanguageId !== 'english' && Object.keys(fallbackTranslations).length === 0) {
            fallbackTranslations = await loadTranslationData('english');
        } else if (currentLanguageId === 'english') {
            fallbackTranslations = translations;
        }

        // Check if default tab content is untouched / standard default:
        const DEFAULT_TAB_CONTENT_KEY = 'synapse_setting_default_tab_content';
        const currentDefContent = localStorage.getItem(DEFAULT_TAB_CONTENT_KEY);
        const allDefaults = [
            'Synapse winning!', 'Nananalo ang Synapse!', 'Synapse gewinnt!', 'Synapse legelső!',
            'Synapse menang!', 'Synapse vince!', '시냅스(Synapse) 성공!', 'Synapse zwycięża!',
            'Synapse Ganha!', 'Synapse câștigă mereu!', 'Synapse vyhráva!', '¡Synapse gana! 🇪🇸',
            'Synapse ชนะ!', 'Synapse aman vermiyor!', 'Synapse Muôn Năm!'
        ];
        const isDefault = !currentDefContent || allDefaults.some(d => 
            currentDefContent.trim() === d || 
            currentDefContent.trim() === `print('${d}')` || 
            currentDefContent.trim() === `print("${d}")`
        );
        if (isDefault) {
            const newDefault = t('tab-defaults', 'Synapse winning!');
            const newContent = `print('${newDefault}')`;
            localStorage.setItem(DEFAULT_TAB_CONTENT_KEY, newContent);
            const defTabInput = document.querySelector('#newtabcontent input') || document.getElementById('setting-default-tab-content');
            if (defTabInput) {
                defTabInput.value = newContent;
            }
        }

        // Apply translations to UI
        applyTranslations();

        // Update language dropdown representation
        updateLanguageDropdown();

        document.dispatchEvent(new CustomEvent('language:changed', { detail: { language: currentLanguageId } }));
    }

    function applyTranslations() {
        // 1. Selector Map
        SELECTOR_MAP.forEach(item => {
            const el = document.querySelector(item.sel);
            if (!el) return;

            const text = t(item.key, item.fallback || '');
            if (!text) return;

            if (item.attr) {
                el.setAttribute(item.attr, text);
            } else if (item.prefixIcon) {
                const iconClass = item.iconClass ? ` class="${item.iconClass}"` : '';
                el.innerHTML = `<iconify-icon icon="${item.prefixIcon}"${iconClass}></iconify-icon> ${text}`;
            } else {
                el.textContent = text;
            }
        });

        // 2. Generic data-i18n attributes
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translated = t(key, el.textContent);
            if (translated) el.textContent = translated;
        });

        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            const translated = t(key, el.getAttribute('title'));
            if (translated) el.setAttribute('title', translated);
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const translated = t(key, el.getAttribute('placeholder'));
            if (translated) el.setAttribute('placeholder', translated);
        });

        // Ensure no native tooltips exist on navigation buttons, window controls, and sidebar entries
        document.querySelectorAll('#nav-editor, #nav-themes, #nav-plugins, #nav-settings, .hw-navigationbar .entry, #controls .control, #settings-sidebar .entry').forEach(el => {
            el.removeAttribute('title');
        });
    }

    function updateLanguageDropdown() {
        const dropdown = document.getElementById('setting-ui-language-dropdown');
        if (!dropdown) return;

        const currentLang = LANGUAGES.find(l => l.id === currentLanguageId) || LANGUAGES[0];
        const selectorEntry = dropdown.querySelector('.selector .dropdown-entry');
        if (selectorEntry) {
            selectorEntry.textContent = currentLang.name;
        }

        const selector = dropdown.querySelector('.selector');
        const list = dropdown.querySelector('.list');
        const chevron = selector?.querySelector('iconify-icon');

        if (selector && !dropdown._boundToggle) {
            dropdown._boundToggle = true;
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

            document.addEventListener('click', () => {
                if (list) {
                    list.classList.add('hidden');
                    list.classList.remove('flex');
                }
                if (chevron) chevron.classList.remove('rotate-180');
            });
        }

        if (list) {
            list.innerHTML = '';
            LANGUAGES.forEach(lang => {
                const item = document.createElement('div');
                item.className = 'opacity-70 active:opacity-50 hover:opacity-100 cursor-pointer' + (lang.id === currentLanguageId ? ' highlight' : '');
                item.innerHTML = `<div class="dropdown-entry p-1.5">${lang.name}</div>`;
                
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    list.classList.add('hidden');
                    list.classList.remove('flex');
                    if (chevron) chevron.classList.remove('rotate-180');
                    setLanguage(lang.id);
                });

                list.appendChild(item);
            });
        }
    }

    async function initI18n() {
        const saved = localStorage.getItem(LANGUAGE_KEY) || 'english';
        await setLanguage(saved, false);
    }

    // Expose API globally
    const i18nAPI = {
        t,
        setLanguage,
        getCurrentLanguage: () => currentLanguageId,
        getAvailableLanguages: () => LANGUAGES,
        applyTranslations
    };
    window.i18n = i18nAPI;
    window.t = t;
    window.setLanguage = setLanguage;
    window.getCurrentLanguage = () => currentLanguageId;
    window.getAvailableLanguages = () => LANGUAGES;
    window.applyTranslations = applyTranslations;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initI18n);
    } else {
        initI18n();
    }
})();