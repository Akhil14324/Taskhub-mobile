import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOOGLE_TRANSLATE_API_KEY } from '../config';

const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const CACHE_PREFIX = 'trans_cache_';
const BATCH_SIZE = 128;

function getCacheKey(text, targetLang) {
  return `${CACHE_PREFIX}${targetLang}:${text}`;
}

async function getCachedTranslation(text, targetLang) {
  try {
    const cached = await AsyncStorage.getItem(getCacheKey(text, targetLang));
    if (cached !== null) return cached;
  } catch {
    // AsyncStorage might be unavailable
  }
  return null;
}

async function setCachedTranslation(text, targetLang, translated) {
  try {
    await AsyncStorage.setItem(getCacheKey(text, targetLang), translated);
  } catch {
    // storage full or unavailable — silently skip
  }
}

export function isLangSupported(lang) {
  return lang === 'te' || lang === 'en';
}

async function translateWithGoogle(texts, targetLang) {
  const res = await fetch(`${GOOGLE_TRANSLATE_URL}?key=${GOOGLE_TRANSLATE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: texts,
      source: 'en',
      target: targetLang,
      format: 'text',
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Translate HTTP ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  const translations = data.data?.translations || [];
  return translations.map((t, i) => t.translatedText || texts[i]);
}

async function translateWithMyMemory(text, targetLang) {
  const pair = `en|${targetLang}`;
  const encoded = encodeURIComponent(text);
  const res = await fetch(`${MYMEMORY_URL}?q=${encoded}&langpair=${pair}`, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.responseStatus !== 200) throw new Error(data.responseDetails || 'MyMemory error');
  return data.responseData?.translatedText || text;
}

async function translateOne(text, targetLang) {
  if (GOOGLE_TRANSLATE_API_KEY) {
    try {
      const results = await translateWithGoogle([text], targetLang);
      return results[0] || text;
    } catch (err) {
      console.warn('[translateService] Google failed, trying MyMemory:', err.message);
      try {
        return await translateWithMyMemory(text, targetLang);
      } catch (err2) {
        console.warn('[translateService] MyMemory also failed:', err2.message);
        return text;
      }
    }
  } else {
    try {
      return await translateWithMyMemory(text, targetLang);
    } catch (err) {
      console.warn('[translateService] MyMemory failed:', err.message);
      return text;
    }
  }
}

export async function translateText(text, targetLang) {
  if (!text || targetLang === 'en') return text;

  const cached = await getCachedTranslation(text, targetLang);
  if (cached !== null) return cached;

  const translated = await translateOne(text, targetLang);
  await setCachedTranslation(text, targetLang, translated);
  return translated;
}

export async function translateBatch(texts, targetLang) {
  const results = new Array(texts.length).fill(null);

  // Check cache first
  const uncached = [];
  for (let i = 0; i < texts.length; i++) {
    const cached = await getCachedTranslation(texts[i], targetLang);
    if (cached !== null) {
      results[i] = cached;
    } else {
      uncached.push({ text: texts[i], index: i });
    }
  }

  if (uncached.length === 0) return results;

  if (GOOGLE_TRANSLATE_API_KEY) {
    const chunks = [];
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      chunks.push(uncached.slice(i, i + BATCH_SIZE));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const googleResults = await translateWithGoogle(
            chunk.map((c) => c.text),
            targetLang
          );

          chunk.forEach(async (item, i) => {
            const translated = googleResults[i] || item.text;
            results[item.index] = translated;
            await setCachedTranslation(item.text, targetLang, translated);
          });
        } catch (err) {
          console.warn('[translateService] Google batch failed, trying individually:', err.message);
          await Promise.all(
            chunk.map(async (item) => {
              const translated = await translateOne(item.text, targetLang);
              results[item.index] = translated;
              await setCachedTranslation(item.text, targetLang, translated);
            })
          );
        }
      })
    );
  } else {
    console.warn('[translateService] No Google API key, using MyMemory fallback');
    await Promise.all(
      uncached.map(async (item) => {
        const translated = await translateWithMyMemory(item.text, targetLang);
        results[item.index] = translated;
        await setCachedTranslation(item.text, targetLang, translated);
      })
    );
  }

  return results;
}

export async function prefetchTranslations(keys, targetLang) {
  if (targetLang === 'en') return {};

  const results = {};
  const uncached = [];

  for (const key of keys) {
    const cached = await getCachedTranslation(key, targetLang);
    if (cached !== null) {
      results[key] = cached;
    } else {
      uncached.push(key);
    }
  }

  if (uncached.length === 0) return results;

  const translatedTexts = await translateBatch(uncached, targetLang);
  uncached.forEach((key, i) => {
    results[key] = translatedTexts[i];
  });

  return results;
}
