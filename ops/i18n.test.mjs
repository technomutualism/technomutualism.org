import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pickLanguage, pageFor } from '../functions/_middleware.js';

describe('i18n middleware unit tests', () => {
  describe('pickLanguage', () => {
    test('q values: honours quality weights in Accept-Language', () => {
      assert.strictEqual(pickLanguage('fr;q=0.6, es;q=0.9', null), 'es');
      assert.strictEqual(pickLanguage('es;q=0.3, fr;q=0.8', null), 'fr');
      assert.strictEqual(pickLanguage('de;q=0.5, it;q=0.7, pt;q=0.9', null), 'pt');
    });

    test('region codes: matches primary subtag for regional locales', () => {
      assert.strictEqual(pickLanguage('es-MX', null), 'es');
      assert.strictEqual(pickLanguage('es-ES', null), 'es');
      assert.strictEqual(pickLanguage('es-AR', null), 'es');
      assert.strictEqual(pickLanguage('pt-BR', null), 'pt');
      assert.strictEqual(pickLanguage('pt-PT', null), 'pt');
      assert.strictEqual(pickLanguage('de-AT', null), 'de');
      assert.strictEqual(pickLanguage('fr-CA', null), 'fr');
      assert.strictEqual(pickLanguage('en-GB', null), 'en');
    });

    test('zh mapping: maps Chinese variants to zh-Hans and zh-Hant', () => {
      assert.strictEqual(pickLanguage('zh-CN', null), 'zh-Hans');
      assert.strictEqual(pickLanguage('zh-SG', null), 'zh-Hans');
      assert.strictEqual(pickLanguage('zh-Hans', null), 'zh-Hans');
      assert.strictEqual(pickLanguage('zh-Hans-CN', null), 'zh-Hans');

      assert.strictEqual(pickLanguage('zh-TW', null), 'zh-Hant');
      assert.strictEqual(pickLanguage('zh-HK', null), 'zh-Hant');
      assert.strictEqual(pickLanguage('zh-MO', null), 'zh-Hant');
      assert.strictEqual(pickLanguage('zh-Hant', null), 'zh-Hant');
      assert.strictEqual(pickLanguage('zh-Hant-TW', null), 'zh-Hant');
    });

    test('tl -> fil: maps Tagalog to Filipino', () => {
      assert.strictEqual(pickLanguage('tl', null), 'fil');
      assert.strictEqual(pickLanguage('tl-PH', null), 'fil');
      assert.strictEqual(pickLanguage('fil-PH', null), 'fil');
      assert.strictEqual(pickLanguage('fil', null), 'fil');
    });

    test('cookie wins: cookie takes precedence over Accept-Language', () => {
      assert.strictEqual(pickLanguage('es', 'tm_lang=en'), 'en');
      assert.strictEqual(pickLanguage('en', 'tm_lang=es'), 'es');
      assert.strictEqual(pickLanguage('de;q=0.9, fr;q=0.8', 'tm_lang=es; other=value'), 'es');
      assert.strictEqual(pickLanguage('es', 'other=val; tm_lang=pt'), 'pt');
      // Invalid cookie ignored, falls back to Accept-Language
      assert.strictEqual(pickLanguage('es', 'tm_lang=invalid'), 'es');
    });

    test('unknown -> en: unrecognised or missing language tags fall back to English', () => {
      assert.strictEqual(pickLanguage('xx-YY', null), 'en');
      assert.strictEqual(pickLanguage('unknown', null), 'en');
      assert.strictEqual(pickLanguage('', null), 'en');
      assert.strictEqual(pickLanguage(null, null), 'en');
      assert.strictEqual(pickLanguage(undefined, null), 'en');
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
});
