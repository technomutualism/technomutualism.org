import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pickLanguage, pageFor, SUPPORTED_CODES } from '../functions/_middleware.js';

// Matching rules are tested against a site that has every language; the fallthrough tests below use a partial site.
const ALL = new Set(SUPPORTED_CODES);

describe('i18n middleware unit tests', () => {
  describe('pickLanguage', () => {
    test('q values: honours quality weights in Accept-Language', () => {
      assert.strictEqual(pickLanguage('fr;q=0.6, es;q=0.9', null, ALL), 'es');
      assert.strictEqual(pickLanguage('es;q=0.3, fr;q=0.8', null, ALL), 'fr');
      assert.strictEqual(pickLanguage('de;q=0.5, it;q=0.7, pt;q=0.9', null, ALL), 'pt');
    });

    test('region codes: matches primary subtag for regional locales', () => {
      assert.strictEqual(pickLanguage('es-MX', null, ALL), 'es');
      assert.strictEqual(pickLanguage('es-ES', null, ALL), 'es');
      assert.strictEqual(pickLanguage('es-AR', null, ALL), 'es');
      assert.strictEqual(pickLanguage('pt-BR', null, ALL), 'pt');
      assert.strictEqual(pickLanguage('pt-PT', null, ALL), 'pt');
      assert.strictEqual(pickLanguage('de-AT', null, ALL), 'de');
      assert.strictEqual(pickLanguage('fr-CA', null, ALL), 'fr');
      assert.strictEqual(pickLanguage('en-GB', null, ALL), 'en');
    });

    test('zh mapping: maps Chinese variants to zh-Hans and zh-Hant', () => {
      assert.strictEqual(pickLanguage('zh-CN', null, ALL), 'zh-Hans');
      assert.strictEqual(pickLanguage('zh-SG', null, ALL), 'zh-Hans');
      assert.strictEqual(pickLanguage('zh-Hans', null, ALL), 'zh-Hans');
      assert.strictEqual(pickLanguage('zh-Hans-CN', null, ALL), 'zh-Hans');

      assert.strictEqual(pickLanguage('zh-TW', null, ALL), 'zh-Hant');
      assert.strictEqual(pickLanguage('zh-HK', null, ALL), 'zh-Hant');
      assert.strictEqual(pickLanguage('zh-MO', null, ALL), 'zh-Hant');
      assert.strictEqual(pickLanguage('zh-Hant', null, ALL), 'zh-Hant');
      assert.strictEqual(pickLanguage('zh-Hant-TW', null, ALL), 'zh-Hant');
    });

    test('tl -> fil: maps Tagalog to Filipino', () => {
      assert.strictEqual(pickLanguage('tl', null, ALL), 'fil');
      assert.strictEqual(pickLanguage('tl-PH', null, ALL), 'fil');
      assert.strictEqual(pickLanguage('fil-PH', null, ALL), 'fil');
      assert.strictEqual(pickLanguage('fil', null, ALL), 'fil');
    });

    test('cookie wins: cookie takes precedence over Accept-Language', () => {
      assert.strictEqual(pickLanguage('es', 'tm_lang=en', ALL), 'en');
      assert.strictEqual(pickLanguage('en', 'tm_lang=es', ALL), 'es');
      assert.strictEqual(pickLanguage('de;q=0.9, fr;q=0.8', 'tm_lang=es; other=value', ALL), 'es');
      assert.strictEqual(pickLanguage('es', 'other=val; tm_lang=pt', ALL), 'pt');
      // Invalid cookie ignored, falls back to Accept-Language
      assert.strictEqual(pickLanguage('es', 'tm_lang=invalid', ALL), 'es');
    });

    test('unknown -> en: unrecognised or missing language tags fall back to English', () => {
      assert.strictEqual(pickLanguage('xx-YY', null, ALL), 'en');
      assert.strictEqual(pickLanguage('unknown', null, ALL), 'en');
      assert.strictEqual(pickLanguage('', null, ALL), 'en');
      assert.strictEqual(pickLanguage(null, null, ALL), 'en');
      assert.strictEqual(pickLanguage(undefined, null, ALL), 'en');
    });
  });

  describe('pageFor', () => {
    test('assets never redirected: returns null for static assets and extensions', () => {
      assert.strictEqual(pageFor('/style.css'), null);
      assert.strictEqual(pageFor('/fonts/atkinson-hyperlegible-latin-400-normal.woff2'), null);
      assert.strictEqual(pageFor('/favicon.svg'), null);
      assert.strictEqual(pageFor('/og.png'), null);
      assert.strictEqual(pageFor('/robots.txt'), null);
      assert.strictEqual(pageFor('/sitemap.xml'), null);
      assert.strictEqual(pageFor('/script.js'), null);
      assert.strictEqual(pageFor('/photo.jpg'), null);
    });

    test('/es/… never redirected: returns null for pages already in language folders', () => {
      assert.strictEqual(pageFor('/es/'), null);
      assert.strictEqual(pageFor('/es'), null);
      assert.strictEqual(pageFor('/es/history'), null);
      assert.strictEqual(pageFor('/es/history.html'), null);
      assert.strictEqual(pageFor('/es/corruption'), null);
      assert.strictEqual(pageFor('/es/in-practice'), null);
      assert.strictEqual(pageFor('/es/questions'), null);
      assert.strictEqual(pageFor('/es/404.html'), null);
      // Other supported language prefixes also return null
      assert.strictEqual(pageFor('/fr/history'), null);
      assert.strictEqual(pageFor('/de/'), null);
      assert.strictEqual(pageFor('/pt/questions'), null);
    });

    test('English HTML pages: correctly identifies English pages', () => {
      assert.strictEqual(pageFor('/'), '');
      assert.strictEqual(pageFor('/index.html'), '');
      assert.strictEqual(pageFor('/history'), 'history');
      assert.strictEqual(pageFor('/history.html'), 'history');
      assert.strictEqual(pageFor('/corruption'), 'corruption');
      assert.strictEqual(pageFor('/corruption.html'), 'corruption');
      assert.strictEqual(pageFor('/in-practice'), 'in-practice');
      assert.strictEqual(pageFor('/questions'), 'questions');
      assert.strictEqual(pageFor('/404'), '404');
      assert.strictEqual(pageFor('/404.html'), '404');
    });
  });

  describe('only languages the site has', () => {
    const PARTIAL = new Set(['en', 'es']);
    test('a first choice the site lacks falls through to the next preference', () => {
      assert.strictEqual(pickLanguage('de, es;q=0.8', null, PARTIAL), 'es');
      assert.strictEqual(pickLanguage('zh-TW, es;q=0.5', null, PARTIAL), 'es');
      assert.strictEqual(pickLanguage('tl, es;q=0.5', null, PARTIAL), 'es');
    });
    test('nothing the site has → English', () => {
      assert.strictEqual(pickLanguage('de, fr;q=0.8', null, PARTIAL), 'en');
    });
    test('English preferred before a language the site has → English', () => {
      assert.strictEqual(pickLanguage('en-US, es;q=0.5', null, PARTIAL), 'en');
    });
    test('a cookie naming a language the site lacks is ignored', () => {
      assert.strictEqual(pickLanguage('es', 'tm_lang=de', PARTIAL), 'es');
      assert.strictEqual(pickLanguage('es', 'tm_lang=en', PARTIAL), 'en');
    });
  });
});
