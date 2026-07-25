import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from '../i18n/translations';
import { translateBatch } from '../i18n/translateService';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('en');
  const [translating, setTranslating] = useState(false);
  const [dynamicCache, setDynamicCache] = useState({});
  const liveCacheRef = useRef({});
  const initRef = useRef(false);

  // Load saved language on mount
  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem('lang');
      if (saved) setLang(saved);
      initRef.current = true;
    })();
  }, []);

  // Collect all English keys once
  const allKeys = useMemo(() => Object.keys(translations.en), []);

  // Prefetch all translations when language changes to Telugu
  useEffect(() => {
    if (lang === 'en') {
      liveCacheRef.current = {};
      setTranslating(false);
      return;
    }

    let cancelled = false;
    setTranslating(true);

    (async () => {
      try {
        const englishTexts = allKeys.map((key) => translations.en[key]);
        const translatedTexts = await translateBatch(englishTexts, lang);

        if (cancelled) return;

        const cache = {};
        allKeys.forEach((key, i) => {
          cache[key] = translatedTexts[i] || translations.en[key];
        });
        liveCacheRef.current = cache;
        setTranslating(false);
      } catch (err) {
        console.warn('[LanguageContext] Prefetch failed:', err.message);
        if (!cancelled) setTranslating(false);
      }
    })();

    return () => { cancelled = true; };
  }, [lang, allKeys]);

  const changeLang = useCallback((newLang) => {
    setLang(newLang);
    AsyncStorage.setItem('lang', newLang);
    setDynamicCache({});
  }, []);

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'en' ? 'te' : 'en';
      AsyncStorage.setItem('lang', next);
      setDynamicCache({});
      return next;
    });
  }, []);

  const translateDynamic = useCallback(
    async (texts) => {
      if (lang === 'en' || !texts.length) return {};
      setTranslating(true);
      try {
        const results = await translateBatch(texts, lang);
        const map = {};
        texts.forEach((text, i) => {
          map[text] = results[i] || text;
        });
        setDynamicCache((prev) => ({ ...prev, ...map }));
        return map;
      } finally {
        setTranslating(false);
      }
    },
    [lang]
  );

  const getDynamic = useCallback(
    (text) => {
      if (lang === 'en' || !text) return text;
      return dynamicCache[text] ?? text;
    },
    [dynamicCache, lang]
  );

  const t = useCallback(
    (key) => {
      if (lang === 'en') {
        return translations.en[key] ?? key;
      }

      // 1. Check live translation cache (populated by prefetch)
      if (liveCacheRef.current[key]) {
        return liveCacheRef.current[key];
      }

      // 2. Fall back to manual Telugu dictionary
      if (translations.te && translations.te[key]) {
        return translations.te[key];
      }

      // 3. Final fallback: English text
      return translations.en[key] ?? key;
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, changeLang, toggleLang, t, translating, translateDynamic, getDynamic }),
    [lang, t, translating, translateDynamic, getDynamic]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
