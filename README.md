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

## Contributing

Corrections, better wording and translations are welcome: open an issue or a pull request.
Keep it plain English, honest about limits, and readable on a small, old phone.

## Licence

- Text and images: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Copy, translate and adapt it; credit technomutualism.org and share alike.
- Code (HTML/CSS): MIT, see [LICENSE](LICENSE).
- Fonts: SIL Open Font License 1.1, see `site/fonts/`.

The word "technomutualism" is free for anyone to use.
