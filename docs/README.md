# docs/ — EmberSensor Static Site

Static website for EmberSensor. Hosted on GitHub Pages at `embersensor.com`.

## Pages

| File | Route | Description |
|---|---|---|
| `index.html` | `/` | Landing page — hero, feature cards, system diagrams, about section |
| `how-it-works.html` | `/how-it-works.html` | 4-step explainer + embedded YouTube demo video |
| `live.html` | `/live.html` | Password-gated live camera feed (4-digit code) |
| `screenshots.html` | `/screenshots.html` | Photo gallery — awards and build photos |

## Shared assets

| File | Role |
|---|---|
| `style.css` | Single dark-theme stylesheet for all pages. No framework or build step. |
| `script.js` | Injects shared nav and footer into every page at load time via `DOMContentLoaded`. All pages depend on `<div id="site-header">` and `<div id="site-footer">` being present. |
| `favicon.ico / .png` | Favicons linked in every page `<head>` |

## How shared nav/footer works

`script.js` reads `window.location.pathname` to determine the current page and sets the `active` class on the matching nav link. The nav and footer are rendered as innerHTML into `#site-header` and `#site-footer` divs that every page must include.

Adding a new page requires updating the nav in `script.js`.

## Static hosting notes

- No build step — files are served as-is from `docs/`
- GitHub Pages is configured to serve from the `docs/` directory
- `CNAME` file sets the custom domain (`embersensor.com`)
- All pages are self-contained HTML — no JS framework, no bundler

## Images

All images live in `docs/images/`. Referenced directly in HTML with relative paths.
