'use strict';

const { t, getLocale, setLocale } = require('../lib/i18n');

describe('i18n.js', () => {
  afterEach(() => {
    // Reset to English after each test
    setLocale('en');
  });

  describe('setLocale() / getLocale()', () => {
    test('can switch to English', () => {
      setLocale('en');
      expect(getLocale()).toBe('en');
    });

    test('can switch to Spanish', () => {
      setLocale('es');
      expect(getLocale()).toBe('es');
    });
  });

  describe('t() — English', () => {
    beforeEach(() => setLocale('en'));

    test('returns translated string for valid key', () => {
      expect(t('startup.silent_mode')).toContain('silent mode enabled');
    });

    test('returns the key itself for missing keys', () => {
      expect(t('nonexistent.key')).toBe('nonexistent.key');
    });

    test('interpolates {{variable}} placeholders', () => {
      const result = t('clean.unused_found', { count: 5 });
      expect(result).toContain('5');
      expect(result).not.toContain('{{count}}');
    });

    test('interpolates multiple variables', () => {
      const result = t('trivy.high_crit_medium_low', { high: 3, medium: 7 });
      expect(result).toContain('3');
      expect(result).toContain('7');
    });

    test('returns key for non-string nested value', () => {
      // Requesting a namespace object, not a leaf string
      expect(t('startup')).toBe('startup');
    });

    test('dry-run banner is in English', () => {
      expect(t('startup.dryrun_banner')).toMatch(/DRY-RUN MODE/);
    });

    test('audit title is in English', () => {
      expect(t('audit.title')).toMatch(/audit mode/i);
    });

    test('package_singular returns "package"', () => {
      expect(t('audit.package_singular')).toBe('package');
    });

    test('summary header is in English', () => {
      expect(t('summary.header')).toMatch(/CHANGE SUMMARY/i);
    });
  });

  describe('t() — Spanish', () => {
    beforeEach(() => setLocale('es'));

    test('returns translated string in Spanish', () => {
      expect(t('startup.silent_mode')).toContain('activado');
    });

    test('interpolates in Spanish', () => {
      const result = t('clean.unused_found', { count: 3 });
      expect(result).toContain('3');
      expect(result).toContain('encontraron');
    });

    test('dry-run banner is in Spanish', () => {
      expect(t('startup.dryrun_banner')).toMatch(/Simulación/);
    });

    test('audit title is in Spanish', () => {
      expect(t('audit.title')).toMatch(/solo lectura/i);
    });

    test('package_singular returns "paquete"', () => {
      expect(t('audit.package_singular')).toBe('paquete');
    });

    test('summary header is in Spanish', () => {
      expect(t('summary.header')).toMatch(/RESUMEN DE CAMBIOS/i);
    });
  });

  describe('fallback behavior', () => {
    test('falls back to English for unknown locale', () => {
      setLocale('zh');  // Chinese — not supported, loads English
      expect(t('startup.done')).toMatch(/Done/i);
    });
  });
});
