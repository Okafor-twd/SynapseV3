/**
 * i18nService.js
 * Internationalization service supporting 15 languages for Synapse X v3.
 */

import englishLang from '../../assets/lang/english.json';

export const LANGUAGES = [
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

const defaultEnglish = englishLang.translation || englishLang;

class I18nService {
    constructor() {
        this.currentLanguage = localStorage.getItem('synapse_setting_language') || 'english';
        this.fallbackTranslations = defaultEnglish;
        this.translations = this.currentLanguage === 'english' ? defaultEnglish : {};
        this.listeners = new Set();
        this.init();
    }

    async init() {
        // Always load English as fallback
        this.fallbackTranslations = await this.fetchLanguageFile('english.json');
        if (this.currentLanguage !== 'english') {
            const langObj = LANGUAGES.find(l => l.id === this.currentLanguage) || LANGUAGES[0];
            this.translations = await this.fetchLanguageFile(langObj.file);
        } else {
            this.translations = this.fallbackTranslations;
        }
        this.notify();
    }

    async fetchLanguageFile(fileName) {
        try {
            const res = await fetch(`assets/lang/${fileName}`);
            if (res.ok) {
                const data = await res.json();
                return data.translation || data;
            }
        } catch (_) {}
        return {};
    }

    t(key, fallback = '') {
        if (!key) return fallback;
        if (this.translations && this.translations[key] !== undefined) {
            return this.translations[key];
        }
        if (this.fallbackTranslations && this.fallbackTranslations[key] !== undefined) {
            return this.fallbackTranslations[key];
        }
        return fallback || key;
    }

    async setLanguage(langId) {
        const langObj = LANGUAGES.find(l => l.id === langId) || LANGUAGES[0];
        this.currentLanguage = langObj.id;
        localStorage.setItem('synapse_setting_language', langObj.id);
        window.hwAPI?.setSetting?.('language', langObj.id);

        if (langObj.id === 'english') {
            this.translations = this.fallbackTranslations;
        } else {
            this.translations = await this.fetchLanguageFile(langObj.file);
        }
        this.notify();
    }

    getLanguage() {
        return this.currentLanguage;
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.listeners.forEach(cb => cb(this.currentLanguage));
    }
}

export const i18n = new I18nService();
window.i18n = i18n;
