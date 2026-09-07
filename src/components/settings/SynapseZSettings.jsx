import React, { useState, useEffect } from 'react';
import { i18n } from '../../services/i18nService';
import { SettingRow } from './controls/SettingRow';
import { Checkbox } from './controls/Checkbox';

export function SynapseZSettings() {
    const [config, setConfig] = useState({
        console_redirection: false,
        enable_raknet: true,
        enable_replicatesignal: true,
        enable_cfiresignal: true,
        enable_setfflag: true,
    });

    useEffect(() => {
        let mounted = true;
        if (window.hwAPI?.getSynzConfig) {
            window.hwAPI.getSynzConfig().then((res) => {
                if (mounted && res) {
                    setConfig((prev) => ({ ...prev, ...res }));
                }
            }).catch(() => {});
        }
        return () => {
            mounted = false;
        };
    }, []);

    const handleToggle = async (key) => {
        const newVal = !config[key];
        setConfig((prev) => ({ ...prev, [key]: newVal }));
        if (window.hwAPI?.setSynzConfig) {
            try {
                const updated = await window.hwAPI.setSynzConfig(key, newVal);
                if (updated) {
                    setConfig((prev) => ({ ...prev, ...updated }));
                }
            } catch (_) {}
        }
    };

    return (
        <div id="settings-category-synapse-z" className="page">
            <div className="category-label sticky top-0 z-10 flex items-center gap-1 p-1 lg:gap-2 lg:p-2">
                <iconify-icon icon="bx:code-curly" />
                <span data-i18n="settings-category-synapse-z">Synapse Z</span>
            </div>

            {/* 1. Console Redirection */}
            <SettingRow
                caption={i18n.t('settings-consoleredirection', 'Console redirection')}
                description={i18n.t('settings-consoleredirection-desc', 'Redirects game output and errors to the console.')}
                onClick={() => handleToggle('console_redirection')}
            >
                <Checkbox
                    id="setting-synz-consoleredirection"
                    checked={Boolean(config.console_redirection)}
                    onChange={() => handleToggle('console_redirection')}
                />
            </SettingRow>

            {/* 2. Enable RakNet */}
            <SettingRow
                caption={i18n.t('settings-enableraknet', 'Enable RakNet')}
                description={i18n.t('settings-enableraknet-desc', 'Enables RakNet network protocol hooking and interception.')}
                onClick={() => handleToggle('enable_raknet')}
            >
                <Checkbox
                    id="setting-synz-enableraknet"
                    checked={Boolean(config.enable_raknet)}
                    onChange={() => handleToggle('enable_raknet')}
                />
            </SettingRow>

            {/* 3. Enable ReplicateSignal */}
            <SettingRow
                caption={i18n.t('settings-enablereplicatesignal', 'Enable ReplicateSignal')}
                description={i18n.t('settings-enablereplicatesignal-desc', 'Enables replication signals for game instances.')}
                onClick={() => handleToggle('enable_replicatesignal')}
            >
                <Checkbox
                    id="setting-synz-enablereplicatesignal"
                    checked={Boolean(config.enable_replicatesignal)}
                    onChange={() => handleToggle('enable_replicatesignal')}
                />
            </SettingRow>

            {/* 4. Enable CFireSignal */}
            <SettingRow
                caption={i18n.t('settings-enablecfiresignal', 'Enable CFireSignal')}
                description={i18n.t('settings-enablecfiresignal-desc', 'Enables native C-level firing of Instance signals.')}
                onClick={() => handleToggle('enable_cfiresignal')}
            >
                <Checkbox
                    id="setting-synz-enablecfiresignal"
                    checked={Boolean(config.enable_cfiresignal)}
                    onChange={() => handleToggle('enable_cfiresignal')}
                />
            </SettingRow>

            {/* 5. Enable SetFFlag */}
            <SettingRow
                caption={i18n.t('settings-enablesetfflag', 'Enable SetFFlag')}
                description={i18n.t('settings-enablesetfflag-desc', 'Allows modifying engine Fast Flags at runtime.')}
                onClick={() => handleToggle('enable_setfflag')}
            >
                <Checkbox
                    id="setting-synz-enablesetfflag"
                    checked={Boolean(config.enable_setfflag)}
                    onChange={() => handleToggle('enable_setfflag')}
                />
            </SettingRow>
        </div>
    );
}
