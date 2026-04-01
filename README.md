# GoBooks Reader PWA

Progressive Web App for reading EPUB books purchased from gobooks.com, with enhancements for Go problem books.

**Live:** https://joeykblack.github.io/gobookReader/

## Hosting

This project is hosted on GitHub Pages and served from the docs folder.

## Current status (through Step 4)

Completed scaffold files:

- [docs/index.html](docs/index.html)
- [docs/manifest.json](docs/manifest.json)
- [docs/sw.js](docs/sw.js)
- [docs/icons/icon-192.svg](docs/icons/icon-192.svg)
- [docs/icons/icon-512.svg](docs/icons/icon-512.svg)
- [DESIGN.md](DESIGN.md)
- [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md)

Current behavior:

- Basic landing page is served.
- Service worker registers and reports status on screen.
- Web app manifest is linked.
- App shell files are cached for offline use.
- EPUB import via JSZip works in-browser.
- Imported EPUB entries are written into OPFS under books/{bookId}/files/...
- content.opf is parsed to extract metadata and chapter spine order.
- Imported books and chapter lists are persisted/shown via Dexie (IndexedDB).
- Chapter reader loads selected XHTML spine content in a sandboxed iframe.
- Reader supports chapter dropdown + Previous/Next navigation.
- Chapter assets (CSS/JS/images) are rewritten to Blob URLs so EPUB diagram scripts can run.
- Books can be deleted from the bookshelf (removes OPFS files + IndexedDB record).

## Run locally

This is a vanilla JavaScript static site with no build step. Start a local HTTP server:

```bash
cd docs
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

(You can use any port instead of 8000, or use `npx http-server` if you prefer.)

## Next planned steps

1. Answer hiding injection
2. SRS (SM-2) data model with Dexie
3. Review queue UI
4. Heuristic polish for Kiseido Go books
5. Heuristic polish for Kiseido Go books
