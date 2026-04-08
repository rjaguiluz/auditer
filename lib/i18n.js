const fs = require('fs');
const path = require('path');

// ============================================================================
// INTERNATIONALIZATION (i18n)
// ============================================================================

let currentLocale = 'en';
let translations = {};

/**
 * Detect system locale
 * Priority: LANG > LANGUAGE > LC_ALL > default to 'en'
 */
function detectLocale() {
  const envLang = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || '';
  
  // Extract language code (e.g., 'es_ES.UTF-8' -> 'es')
  const langCode = envLang.split(/[._-]/)[0].toLowerCase();
  
  // Support Spanish and English, default to English
  if (langCode === 'es') {
    return 'es';
  }
  
  return 'en';
}

/**
 * Load translations for a specific locale
 */
function loadTranslations(locale) {
  try {
    const translationPath = path.join(__dirname, '..', 'locales', `${locale}.json`);
    const data = fs.readFileSync(translationPath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    // Fallback to English if translation file not found
    if (locale !== 'en') {
      console.warn(`Warning: Translation file for '${locale}' not found, falling back to English`);
      return loadTranslations('en');
    }
    console.error('Error: Could not load translations');
    return {};
  }
}

/**
 * Initialize i18n system
 */
function initI18n() {
  currentLocale = detectLocale();
  translations = loadTranslations(currentLocale);
}

/**
 * Get translated string
 * @param {string} key - Translation key (e.g., 'errors.package_not_found')
 * @param {object} params - Optional parameters for interpolation
 * @returns {string} Translated string
 */
function t(key, params = {}) {
  // Navigate through nested keys (e.g., 'errors.package_not_found')
  const keys = key.split('.');
  let value = translations;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Key not found, return the key itself as fallback
      return key;
    }
  }
  
  // If value is not a string, return key
  if (typeof value !== 'string') {
    return key;
  }
  
  // Interpolate parameters (replace {{param}} with values)
  let result = value;
  for (const [param, paramValue] of Object.entries(params)) {
    result = result.replace(new RegExp(`{{${param}}}`, 'g'), paramValue);
  }
  
  return result;
}

/**
 * Get current locale
 */
function getLocale() {
  return currentLocale;
}

/**
 * Set locale manually (useful for testing)
 */
function setLocale(locale) {
  currentLocale = locale;
  translations = loadTranslations(locale);
}

// Initialize on module load
initI18n();

module.exports = {
  t,
  getLocale,
  setLocale,
  initI18n
};
