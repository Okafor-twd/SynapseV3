/**
 * plugins-page.js
 * Plugins page: persists the "Enable plugins" toggle.
 */
(function () {
    function setPluginCheckbox(checkbox, on) {
        if (typeof window.setCheckbox === 'function') {
            window.setCheckbox(checkbox, on);
            return;
        }
        if (!checkbox) return;
        const inner = checkbox.querySelector('.icon') || checkbox.querySelector('div');
        checkbox.classList.toggle('on', on);
        if (on) checkbox.setAttribute('value', 'true');
        else checkbox.removeAttribute('value');
        if (inner) {
            inner.classList.toggle('translate-x-5', on);
            inner.classList.toggle('translate-x-1', !on);
        }
    }

    function initPluginsPage() {
        const page = document.getElementById('page-plugins');
        if (!page) return;

        const checkbox = page.querySelector('.hw-checkbox');

        window.hwAPI?.getSetting('pluginsEnabled', false).then((enabled) => {
            if (enabled) setPluginCheckbox(checkbox, true);
        });

        checkbox?.addEventListener('click', () => {
            // The generic toggle handler flips classes first; persist after a tick
            setTimeout(() => {
                window.hwAPI?.setSetting('pluginsEnabled', checkbox.classList.contains('on'));
            }, 0);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPluginsPage);
    } else {
        initPluginsPage();
    }
})();
