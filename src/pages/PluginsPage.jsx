import React, { useState, useEffect } from 'react';
import { i18n } from '../services/i18nService';
import { SettingRow } from '../components/settings/controls/SettingRow';
import { Checkbox } from '../components/settings/controls/Checkbox';

export function PluginsPage() {
    const [pluginsEnabled, setPluginsEnabled] = useState(false);

    useEffect(() => {
        window.hwAPI?.getSetting?.('pluginsEnabled', false).then((enabled) => {
            setPluginsEnabled(!!enabled);
        });
    }, []);

    const handleToggle = (val) => {
        setPluginsEnabled(val);
        window.hwAPI?.setSetting?.('pluginsEnabled', val);
    };

    return (
        <div id="page-plugins" className="page-container flex h-full w-full flex-col overflow-y-auto">
            <div className="hw-multimenu flex h-full max-h-full w-full">
                {/* Plugins Category Sidebar */}
                <div className="list z-10 flex flex-col border-r lg:w-1/5 select-none">
                    <div className="entry group flex items-center border-b py-2 px-3 transition-colors lg:gap-2 select">
                        <iconify-icon
                            icon="heroicons:puzzle-piece-solid"
                            class="flex items-center justify-center text-xl opacity-100"
                        />
                        <div className="caption hidden transition-opacity lg:flex opacity-100 font-semibold">
                            {i18n.t('plugins-general', 'General options')}
                        </div>
                    </div>
                </div>

                {/* Plugins Content */}
                <div className="flex max-h-full grow flex-col">
                    <div className="pages flex grow flex-col overflow-y-auto">
                        <div className="page">
                            <div className="category-label sticky top-0 z-10 flex items-center gap-1 p-1 lg:gap-2 lg:p-2">
                                <iconify-icon icon="heroicons:puzzle-piece-solid" />
                                <span>{i18n.t('plugins-general', 'General options')}</span>
                            </div>

                            {/* Enable Plugins Toggle */}
                            <SettingRow
                                caption={i18n.t('plugins-enable', 'Enable plugins')}
                                description={i18n.t('plugins-enable-desc', 'Controls whether custom third-party plugins are loaded into the editor.')}
                                onClick={() => handleToggle(!pluginsEnabled)}
                            >
                                <Checkbox
                                    checked={pluginsEnabled}
                                    onChange={handleToggle}
                                />
                            </SettingRow>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
