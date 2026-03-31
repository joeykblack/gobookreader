# Design (Step 1)

## Goal

Create a minimal, installable PWA scaffold with no build step, ready for incremental implementation.

## Stack constraints

- Vanilla JavaScript
- No framework
- No bundler/build pipeline
- Static hosting from docs on GitHub Pages

## Step 1 scope

Implemented:

- Static app shell page
- Manifest
- Service worker
- Placeholder icons
- Initial documentation

Not implemented yet:

- EPUB import via JSZip
- OPFS storage
- content.opf parsing
- iframe reader
- Dexie/IndexedDB schema
- SRS and review queue

## PWA shell architecture

### Entry point

- [docs/index.html](docs/index.html): basic UI + service worker registration

### Manifest

- [docs/manifest.json](docs/manifest.json): app identity, standalone display, icon metadata

### Offline strategy

- [docs/sw.js](docs/sw.js): cache-first for app shell with simple runtime cache fill
- Cache versioning via CACHE_NAME for future updates

## Data architecture (planned)

### File storage

- OPFS for extracted EPUB contents keyed by book id

### Structured metadata + reviews

- IndexedDB (Dexie) for:
  - books
  - chapter index/order
  - SRS items (SM-2 interval, ease factor, due date, repetitions, lapses)

## Reader architecture (planned)

- Parse OPF spine/manifest to get reading order
- Render chapter XHTML through Blob URL in a sandboxed iframe
- Allow EPUB-native scripts in iframe
- Inject enhancement script post-load for answer-hiding UX

## Answer hiding heuristic (planned first version)

- Find headings containing "Answer" or "Solution"
- Hide content until next heading
- Insert reveal button for hidden block

## Review model (planned)

- Stable item id: bookId + chapterFile + positionOffset
- SM-2 ratings: Again / Hard / Good / Easy
- Queue: all items due on or before today
