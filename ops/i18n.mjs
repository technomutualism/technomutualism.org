#!/usr/bin/env node
/**
 * ops/i18n.mjs
 * Manages i18n markers, sitemap, language picker, and translation checks for technomutualism.org.
 * Node >= 20, no dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SITE_DIR = path.join(REPO_ROOT, 'site');
const I18N_DIR = path.join(REPO_ROOT, 'ops', 'i18n');

const LANGUAGES_FILE = path.join(I18N_DIR, 'languages.json');
const MT_NOTE_FILE = path.join(I18N_DIR, 'mt-note.json');
const HASHES_FILE = path.join(I18N_DIR, 'source-hashes.json');
const SITEMAP_FILE = path.join(SITE_DIR, 'sitemap.xml');
// The languages the server may redirect to (functions/_middleware.js imports it): only folders that hold every page.
const AVAILABLE_FILE = path.join(I18N_DIR, 'available.js');

const ALL_PAGES = [
  'index.html',
  'history.html',
  'corruption.html',
  'in-practice.html',
  'questions.html',
  '404.html'
];

const SITEMAP_PAGES = [
  'index.html',
  'history.html',
  'corruption.html',
  'in-practice.html',
  'questions.html'
];

function loadJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const languagesConfig = loadJson(LANGUAGES_FILE, []);
const mtNoteConfig = loadJson(MT_NOTE_FILE, {});

function pageUrlPath(filename) {
  if (filename === 'index.html') return '';
  if (filename === '404.html') return '404.html';
  return filename.replace(/\.html$/, '');
}

function getAvailableLanguagesForPage(filename) {
  const available = new Set();
  // English page at site/<filename>
  if (fs.existsSync(path.join(SITE_DIR, filename))) {
    available.add('en');
  }
  // Translated pages at site/<code>/<filename>
  for (const lang of languagesConfig) {
    if (lang.code === 'en') continue;
    if (fs.existsSync(path.join(SITE_DIR, lang.code, filename))) {
      available.add(lang.code);
    }
  }
  return available;
}

function getAvailableLanguageFolders() {
  const folders = [];
  if (!fs.existsSync(SITE_DIR)) return folders;
  const entries = fs.readdirSync(SITE_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'fonts') {
      folders.push(entry.name);
    }
  }
  return folders;
}

function generateAlternatesBlock(filename, availableLanguages) {
  const pathPart = pageUrlPath(filename);
  const lines = ['<!-- i18n:alternates -->'];
  for (const lang of languagesConfig) {
    if (availableLanguages.has(lang.code)) {
      let href;
      if (lang.code === 'en') {
        href = pathPart ? `https://technomutualism.org/${pathPart}` : 'https://technomutualism.org/';
      } else {
        href = pathPart ? `https://technomutualism.org/${lang.code}/${pathPart}` : `https://technomutualism.org/${lang.code}/`;
      }
      lines.push(`<link rel="alternate" hreflang="${lang.hreflang}" href="${href}">`);
    }
  }
  const xDefaultHref = pathPart ? `https://technomutualism.org/${pathPart}` : 'https://technomutualism.org/';
  lines.push(`<link rel="alternate" hreflang="x-default" href="${xDefaultHref}">`);
  lines.push('<!-- /i18n:alternates -->');
  return lines.join('\n');
}

function generatePickerBlock(filename, currentCode) {
  const currentLang = languagesConfig.find(l => l.code === currentCode) || { name: 'English' };
  const pathPart = pageUrlPath(filename);
  const globeSvg = '<svg class="lang-globe" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';

  const items = [];
  for (const lang of languagesConfig) {
    let href;
    if (lang.code === 'en') {
      href = pathPart ? `/${pathPart}?lang=en` : `/?lang=en`;
    } else {
      href = pathPart ? `/${lang.code}/${pathPart}?lang=${lang.code}` : `/${lang.code}/?lang=${lang.code}`;
    }
    const isCurrent = lang.code === currentCode;
    const currentAttr = isCurrent ? ' aria-current="true"' : '';
    items.push(`      <li><a href="${href}" hreflang="${lang.hreflang}" lang="${lang.code}"${currentAttr}>${lang.name}</a></li>`);
  }

  return [
    '<!-- i18n:picker -->',
    '    <details class="lang-picker">',
    `      <summary>${globeSvg} ${currentLang.name}</summary>`,
    '      <ul>',
    ...items,
    '      </ul>',
    '    </details>',
    '    <!-- /i18n:picker -->'
  ].join('\n');
}

function generateMtNoteBlock(currentCode) {
  if (currentCode === 'en' || !mtNoteConfig[currentCode]) {
    return '<!-- i18n:mt-note --><!-- /i18n:mt-note -->';
  }
  return [
    '<!-- i18n:mt-note -->',
    '<aside class="mt-note" aria-label="Nota de traducción">',
    '  <div class="wrap">',
    `    <p>${mtNoteConfig[currentCode]}</p>`,
    '  </div>',
    '</aside>',
    '<!-- /i18n:mt-note -->'
  ].join('\n');
}

function setHtmlTag(content, langCode) {
  const langObj = languagesConfig.find(l => l.code === langCode) || { dir: 'ltr' };
  return content.replace(/<html(?:\s+[^>]*)?>/i, `<html lang="${langCode}" dir="${langObj.dir}">`);
}

function setOgLocales(content, currentCode, availableLanguages) {
  // Only update og:locale if OpenGraph tags exist on page (404 has no og tags)
  if (!content.includes('property="og:')) {
    return content;
  }

  const currentLang = languagesConfig.find(l => l.code === currentCode) || { ogLocale: 'en_US' };
  const lines = [
    `<meta property="og:locale" content="${currentLang.ogLocale}">`
  ];
  for (const lang of languagesConfig) {
    if (lang.code !== currentCode && availableLanguages.has(lang.code)) {
      lines.push(`<meta property="og:locale:alternate" content="${lang.ogLocale}">`);
    }
  }
  const block = lines.join('\n');

  // If existing og:locale tags are present, replace them
  if (content.includes('property="og:locale"')) {
    return content.replace(/(?:<meta property="og:locale"[^>]*>\n?)+(?:<meta property="og:locale:alternate"[^>]*>\n?)*/g, block + '\n');
  }

  // Otherwise insert after og:image:height or og:type
  if (content.includes('property="og:image:height"')) {
    return content.replace(/(<meta property="og:image:height"[^>]*>\n)/, `$1${block}\n`);
  }
  if (content.includes('property="og:type"')) {
    return content.replace(/(<meta property="og:type"[^>]*>\n)/, `$1${block}\n`);
  }
  return content;
}

function processPageContent(content, filename, langCode, availableLanguages) {
  let updated = content;

  // 1. Alternates
  const alternatesBlock = generateAlternatesBlock(filename, availableLanguages);
  updated = updated.replace(/<!--\s*i18n:alternates\s*-->[\s\S]*?<!--\s*\/i18n:alternates\s*-->/, alternatesBlock);

  // 2. Picker
  const pickerBlock = generatePickerBlock(filename, langCode);
  updated = updated.replace(/<!--\s*i18n:picker\s*-->[\s\S]*?<!--\s*\/i18n:picker\s*-->/, pickerBlock);

  // 3. MT Note
  const mtNoteBlock = generateMtNoteBlock(langCode);
  updated = updated.replace(/<!--\s*i18n:mt-note\s*-->[\s\S]*?<!--\s*\/i18n:mt-note\s*-->/, mtNoteBlock);

  // 4. html lang and dir
  updated = setHtmlTag(updated, langCode);

  // 5. og:locale and og:locale:alternate
  updated = setOgLocales(updated, langCode, availableLanguages);

  return updated;
}

function generateSitemap() {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
  ];

  for (const page of SITEMAP_PAGES) {
    const available = getAvailableLanguagesForPage(page);
    const pathPart = pageUrlPath(page);

    for (const lang of languagesConfig) {
      if (!available.has(lang.code)) continue;

      let loc;
      if (lang.code === 'en') {
        loc = pathPart ? `https://technomutualism.org/${pathPart}` : 'https://technomutualism.org/';
      } else {
        loc = pathPart ? `https://technomutualism.org/${lang.code}/${pathPart}` : `https://technomutualism.org/${lang.code}/`;
      }

      lines.push('  <url>');
      lines.push(`    <loc>${loc}</loc>`);

      for (const other of languagesConfig) {
        if (!available.has(other.code)) continue;
        let altHref;
        if (other.code === 'en') {
          altHref = pathPart ? `https://technomutualism.org/${pathPart}` : 'https://technomutualism.org/';
        } else {
          altHref = pathPart ? `https://technomutualism.org/${other.code}/${pathPart}` : `https://technomutualism.org/${other.code}/`;
        }
        lines.push(`    <xhtml:link rel="alternate" hreflang="${other.hreflang}" href="${altHref}"/>`);
      }

      const xDefHref = pathPart ? `https://technomutualism.org/${pathPart}` : 'https://technomutualism.org/';
      lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${xDefHref}"/>`);
      lines.push('  </url>');
    }
  }

  lines.push('</urlset>');
  lines.push('');
  return lines.join('\n');
}

export function getVisibleText(html) {
  let text = html;
  // Remove i18n blocks completely so they don't affect text hashes
  text = text.replace(/<!--\s*i18n:alternates\s*-->[\s\S]*?<!--\s*\/i18n:alternates\s*-->/g, '');
  text = text.replace(/<!--\s*i18n:picker\s*-->[\s\S]*?<!--\s*\/i18n:picker\s*-->/g, '');
  text = text.replace(/<!--\s*i18n:mt-note\s*-->[\s\S]*?<!--\s*\/i18n:mt-note\s*-->/g, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

function completeLanguageFolders() {
  const order = languagesConfig.map((l) => l.code);
  return getAvailableLanguageFolders()
    .filter((code) => ALL_PAGES.every((page) => fs.existsSync(path.join(SITE_DIR, code, page))))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function generateAvailableModule() {
  return '// Generated by ops/i18n.mjs: do not edit. The languages whose folder holds every page; the middleware redirects only to these.\n'
    + `export const AVAILABLE_LANGUAGES = ${JSON.stringify(completeLanguageFolders())};\n`;
}

function runDefault() {
  const languageFolders = getAvailableLanguageFolders();
  const allLangs = ['en', ...languageFolders];

  // For each page and each language
  for (const page of ALL_PAGES) {
    const available = getAvailableLanguagesForPage(page);

    for (const langCode of allLangs) {
      const filePath = langCode === 'en'
        ? path.join(SITE_DIR, page)
        : path.join(SITE_DIR, langCode, page);

      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      const updated = processPageContent(content, page, langCode, available);
      if (updated !== content) {
        fs.writeFileSync(filePath, updated, 'utf8');
        console.log(`Updated ${filePath}`);
      }
    }
  }

  const availableModule = generateAvailableModule();
  if (!fs.existsSync(AVAILABLE_FILE) || fs.readFileSync(AVAILABLE_FILE, 'utf8') !== availableModule) {
    fs.writeFileSync(AVAILABLE_FILE, availableModule, 'utf8');
    console.log(`Updated ${AVAILABLE_FILE}`);
  }

  // Rewrite sitemap.xml if changed
  const sitemapContent = generateSitemap();
  const currentSitemap = fs.existsSync(SITEMAP_FILE) ? fs.readFileSync(SITEMAP_FILE, 'utf8') : '';
  if (sitemapContent !== currentSitemap) {
    fs.writeFileSync(SITEMAP_FILE, sitemapContent, 'utf8');
    console.log(`Updated ${SITEMAP_FILE}`);
  }
}

function runStamp(langCode) {
  const langObj = languagesConfig.find(l => l.code === langCode);
  if (!langObj) {
    console.error(`Error: unknown language code "${langCode}"`);
    process.exit(1);
  }

  const hashes = loadJson(HASHES_FILE, {});
  hashes[langCode] = {};

  for (const page of ALL_PAGES) {
    const filePath = path.join(SITE_DIR, page);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: English page ${filePath} does not exist.`);
      process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const visibleText = getVisibleText(content);
    const hash = crypto.createHash('sha256').update(visibleText).digest('hex');
    hashes[langCode][page] = hash;
  }

  fs.mkdirSync(path.dirname(HASHES_FILE), { recursive: true });
  fs.writeFileSync(HASHES_FILE, JSON.stringify(hashes, null, 2) + '\n', 'utf8');
  console.log(`Stamped source hashes for "${langCode}" in ${HASHES_FILE}`);
}

function runCheck() {
  let errors = [];
  const languageFolders = getAvailableLanguageFolders();

  // 1. Check any language folder is missing a page
  for (const folder of languageFolders) {
    for (const page of ALL_PAGES) {
      const pageFile = path.join(SITE_DIR, folder, page);
      if (!fs.existsSync(pageFile)) {
        errors.push(`Language folder "site/${folder}" is missing page "${page}".`);
      }
    }
  }

  // 2. Check for stale blocks
  const allLangs = ['en', ...languageFolders];
  for (const page of ALL_PAGES) {
    const available = getAvailableLanguagesForPage(page);

    for (const langCode of allLangs) {
      const filePath = langCode === 'en'
        ? path.join(SITE_DIR, page)
        : path.join(SITE_DIR, langCode, page);

      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      const expected = processPageContent(content, page, langCode, available);
      if (content !== expected) {
        errors.push(`File "${filePath}" has stale i18n blocks or metadata. Run "node ops/i18n.mjs" to update.`);
      }
    }
  }

  // The middleware's list of languages it may redirect to
  if (!fs.existsSync(AVAILABLE_FILE) || fs.readFileSync(AVAILABLE_FILE, 'utf8') !== generateAvailableModule()) {
    errors.push('ops/i18n/available.js is stale (the languages the server redirects to). Run "node ops/i18n.mjs" to update.');
  }

  // Check sitemap
  const currentSitemap = fs.existsSync(SITEMAP_FILE) ? fs.readFileSync(SITEMAP_FILE, 'utf8') : '';
  const expectedSitemap = generateSitemap();
  if (currentSitemap !== expectedSitemap) {
    errors.push(`"${SITEMAP_FILE}" is stale. Run "node ops/i18n.mjs" to update.`);
  }

  // 3. Check internal links inside site/<code>/
  for (const folder of languageFolders) {
    for (const page of ALL_PAGES) {
      const pageFile = path.join(SITE_DIR, folder, page);
      if (!fs.existsSync(pageFile)) continue;

      const content = fs.readFileSync(pageFile, 'utf8');
      // Strip picker so its deliberate language switch links are ignored
      const contentNoPicker = content.replace(/<!--\s*i18n:picker\s*-->[\s\S]*?<!--\s*\/i18n:picker\s*-->/g, '');

      const linkMatches = contentNoPicker.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi);
      for (const match of linkMatches) {
        const href = match[1];
        // Allow external, mailto, anchor links
        if (/^(https?:|mailto:|#)/.test(href)) continue;
        // Allow static assets
        if (/^(\/)?(style\.css|favicon\.svg|og\.png|robots\.txt|sitemap\.xml|fonts\/)/.test(href)) continue;

        // Check if href starts with root or relative leading to English pages
        // E.g. href="/history" or href="/" or href="./" or href="history"
        if (href.startsWith('/')) {
          if (!href.startsWith(`/${folder}/`) && href !== `/${folder}`) {
            errors.push(`Internal link error in "site/${folder}/${page}": "${href}" points to English or other page instead of "/${folder}/...".`);
          }
        } else {
          // Relative link like "history" or "./"
          // If it's "./" inside site/<folder>/page, a user clicking it may want /<folder>/
          // Let's require links inside site/<folder>/ to be /<folder>/...
          // If page is not index.html, relative href="./" resolves to /<folder>/
          // But check if it links to an English path without folder prefix
          if (/^(history|corruption|in-practice|questions|404)/.test(href)) {
            errors.push(`Internal link error in "site/${folder}/${page}": relative link "${href}" should be "/${folder}/${href}".`);
          }
        }
      }
    }
  }

  // 4. Check stamped hashes for English text changes
  const hashes = loadJson(HASHES_FILE, {});
  for (const folder of languageFolders) {
    const stamped = hashes[folder];
    if (!stamped) {
      errors.push(`Language "${folder}" has not been stamped yet. Run "node ops/i18n.mjs --stamp ${folder}".`);
      continue;
    }

    for (const page of ALL_PAGES) {
      const englishPage = path.join(SITE_DIR, page);
      if (!fs.existsSync(englishPage)) continue;
      const content = fs.readFileSync(englishPage, 'utf8');
      const visibleText = getVisibleText(content);
      const currentHash = crypto.createHash('sha256').update(visibleText).digest('hex');

      if (!stamped[page]) {
        errors.push(`Page "${page}" is not stamped for language "${folder}". Run "node ops/i18n.mjs --stamp ${folder}".`);
      } else if (stamped[page] !== currentHash) {
        errors.push(`English source text for "${page}" changed since "${folder}" translation was stamped (needs re-translation).`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('i18n check failed:');
    for (const err of errors) {
      console.error(` - ${err}`);
    }
    process.exit(1);
  }

  console.log('i18n check passed: all blocks fresh, all pages present, links verified, hashes match.');
}

// CLI entry point
const args = process.argv.slice(2);
if (args.includes('--check')) {
  runCheck();
} else if (args[0] === '--stamp') {
  const code = args[1];
  if (!code) {
    console.error('Usage: node ops/i18n.mjs --stamp <code>');
    process.exit(1);
  }
  runStamp(code);
} else {
  runDefault();
}
