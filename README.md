# GoBooks Reader PWA

Progressive Web App for reading EPUB books purchased from gobooks.com, with enhancements for Go problem books.

**Live:** https://joeykblack.github.io/gobookReader/

## Hosting

This project is hosted on GitHub Pages and served from the docs folder.

## Current status (through Step 7)

Completed milestone deliverables:

- [docs/index.html](docs/index.html)
- [docs/manifest.json](docs/manifest.json)
- [docs/sw.js](docs/sw.js)
- [docs/icons/icon-192.svg](docs/icons/icon-192.svg)
- [docs/icons/icon-512.svg](docs/icons/icon-512.svg)
- [DESIGN.md](DESIGN.md)
- [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md)

Current behavior:

- Landing page with view tabs (Bookshelf | Review queue)
- Service worker registers and reports status
- EPUB import via JSZip stores files in OPFS
- Chapter reader with interactive diagram support
- Answer sections hidden by default with reveal buttons
- Per-section SRS rating buttons (Mark/Again/Hard/Good/Easy)
- Review queue shows all items due today or earlier
- SM-2 scheduling with dynamic due-date updates
- Data persists across reloads (OPFS + IndexedDB)
- content.opf is parsed to extract metadata and chapter spine order.
- Imported books and chapter lists are persisted/shown via Dexie (IndexedDB).
- Chapter reader loads selected XHTML spine content in a sandboxed iframe.
- Reader supports chapter dropdown + Previous/Next navigation.
- Chapter assets (CSS/JS/images) are rewritten to Blob URLs so EPUB diagram scripts can run.
- Books can be deleted from the bookshelf (removes OPFS files + IndexedDB record).
- Answer sections on GoBooks problem pages are hidden by default behind a "Show Answer" button.
- SRS review items can be created from the open chapter and rated with Again/Hard/Good/Easy.
- SM-2 scheduling fields are stored in Dexie (`reviews` table): easeFactor, intervalDays, repetitions, lapses, dueDate, lastReviewedAt.

## Run locally

This is a vanilla JavaScript static site with no build step. Start a local HTTP server:

```bash
cd docs
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

(You can use any port instead of 8000, or use `npx http-server` if you prefer.)

## Next planned steps

1. Review queue UI
2. Heuristic polish for Kiseido Go books
