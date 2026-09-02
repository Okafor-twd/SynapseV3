/**
 * themes-page.js
 * Customization page: theme dropdown UI + directory/layout buttons.
 */

function initThemesPage() {
    const list = document.getElementById('theme-dropdown-list');
    const trigger = document.getElementById('theme-selector-trigger');
    const selector = document.getElementById('theme-selector');
    const chevron = selector?.querySelector('iconify-icon');

    if (!list || !trigger || !selector) return;

    const getThemes = () => {
        if (typeof themeMetas !== 'undefined' && Object.keys(themeMetas).length > 0) {
            const seen = new Set();
            const list = [];
            for (const theme of Object.values(themeMetas)) {
                if (!theme || !theme.name) continue;
                const idKey = (theme.id || '').toLowerCase();
                const nameKey = theme.name.toLowerCase();
                if (seen.has(idKey) || seen.has(nameKey)) continue;
                seen.add(idKey);
                seen.add(nameKey);
                list.push(theme);
            }
            return list.sort((a, b) => a.name.localeCompare(b.name));
        }
        const ids = (typeof THEME_IDS !== 'undefined') ? THEME_IDS : [
            'coolkid', 'elysian-fields', 'freeman', 'hollywood-classic', 'hollywood-dark',
            'hollywood-glass', 'hollywood-light', 'hollywood-novo', 'kyoto', 'neon',
            'seven', 'unikoi',
        ];
        return ids.map(id => {
            const formatted = id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            return { id, name: formatted };
        }).sort((a, b) => a.name.localeCompare(b.name));
    };

    const rebuild = () => {
        list.innerHTML = '';
        const themes = getThemes();
        const activeId = typeof currentThemeId !== 'undefined' ? currentThemeId : 'hollywood-dark';
        themes.forEach(theme => {
            const isSelected = theme.id === activeId || theme.folderName === activeId;
            const option = document.createElement('div');
            option.className = `opacity-70 active:opacity-50 hover:opacity-100 ${isSelected ? 'highlight' : ''}`;
            option.dataset.themeId = theme.id;

            const entry = document.createElement('div');
            entry.className = 'dropdown-entry p-1';
            entry.textContent = theme.name;
            option.appendChild(entry);

            option.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof loadTheme === 'function') loadTheme(theme.id, true);
                const label = document.getElementById('theme-selected-label');
                if (label) label.textContent = theme.name;
                list.querySelectorAll(':scope > div').forEach(d => d.classList.remove('highlight'));
                option.classList.add('highlight');
                list.classList.add('hidden');
                list.classList.remove('flex');
                if (chevron) chevron.classList.remove('rotate-180');
            });
            list.appendChild(option);
        });
    };

    const syncLabel = () => {
        const label = document.getElementById('theme-selected-label');
        const activeId = typeof currentThemeId !== 'undefined' ? currentThemeId : 'hollywood-dark';
        const meta = typeof themeMetas !== 'undefined' ? (themeMetas[activeId] || Object.values(themeMetas).find(m => m.id === activeId || m.folderName === activeId)) : null;
        if (label && meta) label.textContent = meta.name;
        list.querySelectorAll(':scope > div').forEach(opt => {
            const isMatch = opt.dataset.themeId === activeId || (meta && opt.dataset.themeId === meta.id);
            opt.classList.toggle('highlight', !!isMatch);
        });
    };

    // Initial build
    rebuild();
    syncLabel();

    // Rebuild whenever theme changes or new themes are detected
    document.addEventListener('theme:changed', () => { rebuild(); syncLabel(); });
    document.addEventListener('themes:updated', () => { rebuild(); syncLabel(); });

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        rebuild();
        syncLabel();
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
        list.classList.add('hidden');
        list.classList.remove('flex');
        if (chevron) chevron.classList.remove('rotate-180');
    });

    // "Open" the theme directory
    document.getElementById('btn-open-theme-dir')?.addEventListener('click', () => {
        window.hwAPI?.openPath('themes');
    });

    // "Reset layout" -> Restore modern layout defaults
    document.getElementById('btn-reset-layout')?.addEventListener('click', () => {
        // Disable classic layout mode
        if (window.applyClassicLayout) window.applyClassicLayout(false);
        localStorage.setItem('synapse_setting_classic_layout', 'false');
        window.hwAPI?.setSetting?.('classic_layout', false);
        const cbClassic = document.getElementById('setting-classic-layout');
        if (cbClassic && window.setCheckbox) window.setCheckbox(cbClassic, false);

        // Modern nav bar: Top (0)
        if (window.selectOption) window.selectOption('navbarstyle', 0);
        localStorage.setItem('synapse_setting_navbarstyle', '0');
        window.hwAPI?.setSetting?.('navbarstyle', 0);

        // Action bar: Actions on bottom, tabs on top (0)
        if (window.selectOption) window.selectOption('editorstyle', 0);
        localStorage.setItem('synapse_setting_editorstyle', '0');
        window.hwAPI?.setSetting?.('editorstyle', 0);

        // Action bar direction: Align to right (Modern style) (1)
        if (window.selectOption) window.selectOption('actionbar-direction', 1);
        localStorage.setItem('synapse_setting_actionbar_direction', '1');
        window.hwAPI?.setSetting?.('actionbar_direction', 1);

        // Sidebar layout: Align to right (1)
        if (window.selectOption) window.selectOption('sidebarlayout', 1);
        localStorage.setItem('synapse_setting_sidebarlayout', '1');
        window.hwAPI?.setSetting?.('sidebarlayout', 1);

        // Compact tabs: false
        if (window.applyCompactTabs) window.applyCompactTabs(false);
        localStorage.setItem('synapse_setting_compact_tabs', 'false');
        window.hwAPI?.setSetting?.('compact_tabs', false);
        const cbTabs = document.getElementById('setting-compact-tabs');
        if (cbTabs && window.setCheckbox) window.setCheckbox(cbTabs, false);

        // Compact editor buttons: false
        if (window.applyCompactButtons) window.applyCompactButtons(false);
        localStorage.setItem('synapse_setting_compact_btns', 'false');
        window.hwAPI?.setSetting?.('compact_btns', false);
        const cbBtns = document.getElementById('setting-compact-btns');
        if (cbBtns && window.setCheckbox) window.setCheckbox(cbBtns, false);

        if (typeof notify === 'function') notify('Layout settings were reset to Modern style.');
    });
}

document.addEventListener('DOMContentLoaded', initThemesPage);
