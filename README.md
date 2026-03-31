# GoBooks Reader PWA

Progressive Web App for reading EPUB books purchased from gobooks.com, with enhancements for Go problem books.

## Hosting

This project is hosted on GitHub Pages and served from the docs folder.

## Step 1 status

Completed scaffold files:

- [docs/index.html](docs/index.html)
- [docs/manifest.json](docs/manifest.json)
- [docs/sw.js](docs/sw.js)
- [docs/icons/icon-192.svg](docs/icons/icon-192.svg)
- [docs/icons/icon-512.svg](docs/icons/icon-512.svg)
- [DESIGN.md](DESIGN.md)

Current behavior:

- Basic landing page is served.
- Service worker registers and reports status on screen.
- Web app manifest is linked.
- App shell files are cached for offline use.

## Run locally

Open docs/index.html via a local static server (recommended), or serve the docs folder through your preferred dev server.

## Next planned steps

1. EPUB import and OPFS storage
2. Chapter reader in sandboxed iframe
3. Book shelf and delete flow
4. Answer hiding injection
5. SRS (SM-2) data model with Dexie
6. Review queue UI
7. Heuristic polish for Kiseido Go books
