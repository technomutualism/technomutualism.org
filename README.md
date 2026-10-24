# technomutualism.org

The website of **Technomutualism**: technology owned and run by the people who use it, with open rules nobody can quietly bend.

Plain static HTML and CSS in [`site/`](site/). No build step, no JavaScript, no trackers, no third-party requests.
The fonts (Bricolage Grotesque, Atkinson Hyperlegible) are self-hosted under the SIL Open Font License.

## Preview locally

```sh
npx wrangler pages dev site
# serves it like Cloudflare does: /history finds history.html, 404.html for misses, _headers applied
```

## Deploy

Hosted on Cloudflare Pages (project `technomutualism`). Pushing to `main` deploys via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). `site/_headers` sets the security headers.

## Translations

English is the source language and lives at the root of [`site/`](site/) (`index.html`, `history.html`, `corruption.html`, `in-practice.html`, `questions.html`, `404.html`).

Each translated language lives in its own subfolder with the exact same page names:
- `site/<code>/index.html`
- `site/<code>/history.html`
- `site/<code>/corruption.html`
- `site/<code>/in-practice.html`
- `site/<code>/questions.html`
- `site/<code>/404.html`

Shared static assets (`style.css`, `favicon.svg`, `og.png`, `fonts/`) always stay at the root.

### Tooling (`ops/i18n.mjs`)

An idempotent, zero-dependency Node tool (`Node >= 20`) manages metadata and integrity:

- **Update metadata and sitemap**:
  ```sh
  node ops/i18n.mjs
  ```
  Fills the three marked blocks in every page (`<!-- i18n:alternates -->`, `<!-- i18n:picker -->`, `<!-- i18n:mt-note -->`), sets `<html lang="..." dir="...">`, updates OpenGraph locales (`og:locale` and `og:locale:alternate`), and updates `site/sitemap.xml` with `xhtml:link` alternates for all available translations.

- **Check translation freshness and links**:
  ```sh
  node ops/i18n.mjs --check
  ```
  Fails (exit 1) if:
  1. Any i18n block, HTML attribute, or `sitemap.xml` is stale.
  2. Any language folder is missing any of the 6 pages.
  3. Any internal link inside `site/<code>/` points to an English page instead of `/<code>/...`.
  4. English visible source text has changed since the translation was stamped.

- **Stamp translation version**:
  ```sh
  node ops/i18n.mjs --stamp <code>
  ```
  Records SHA-256 hashes of the English visible text in `ops/i18n/source-hashes.json` for that language code. If English text changes later, `--check` will flag that the language needs re-translation.

- **Unit tests**:
  ```sh
  node --test ops/i18n.test.mjs
  ```
  Tests language negotiation (Accept-Language q-values, region codes, `zh` mapping, `tl -> fil`, cookie override, unknown fallback) and route/asset filtering.

### Machine translation label

Machine translations ship labelled. Every translated page displays a disclaimer at the top of `<main>` in its own language, stating that it was translated by machine, that the English page is the original, and linking to the GitHub repository to help improve it. Disclaimers are maintained in `ops/i18n/mt-note.json`.

### How to correct or add a translation

1. Translate all 6 pages into `site/<code>/`.
2. Ensure internal links point to `/<code>/...` (e.g. `/es/history`, not `/history`).
3. Add the language's machine translation note to `ops/i18n/mt-note.json` if applicable.
4. Run `node ops/i18n.mjs` to populate alternates, picker, and sitemap.
5. Run `node ops/i18n.mjs --stamp <code>` to record source hashes.
6. Verify everything passes with `node ops/i18n.mjs --check`.

## Contributing

Corrections, better wording and translations are welcome: open an issue or a pull request.
Keep it plain English, honest about limits, and readable on a small, old phone.

## Licence

- Text and images: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Copy, translate and adapt it; credit technomutualism.org and share alike.
- Code (HTML/CSS): MIT, see [LICENSE](LICENSE).
- Fonts: SIL Open Font License 1.1, see `site/fonts/`.

The word "technomutualism" is free for anyone to use.
