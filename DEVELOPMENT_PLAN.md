# Development Plan

## Objective

Build an installable, offline-capable PWA for reading GoBooks EPUB content, while preserving EPUB-native interactive diagrams and adding Go-problem-specific learning features.

## Scope and constraints

- Vanilla JavaScript only (no framework, no build step)
- Hosted from docs on GitHub Pages
- Runtime dependencies from CDN only:
  - JSZip (EPUB unzip)
  - Dexie.js (IndexedDB wrapper)
- Primary storage:
  - OPFS for unzipped EPUB files
  - IndexedDB for metadata and SRS

## Delivery strategy

Implement in small vertical slices with a working app at each step. Each step includes:

1. User-visible functionality
2. Minimal tests/verification checklist
3. Documentation updates

---

## Milestone plan

### M1 — PWA scaffold (completed)

Deliverables:

- docs/index.html
- docs/manifest.json
- docs/sw.js
- placeholder icons
- README + DESIGN docs

Acceptance checks:

- Service worker registers
- Manifest recognized by browser
- App shell cached

---

### M2 — EPUB import + storage

Deliverables:

- Import UI (file picker)
- JSZip integration from CDN
- OPFS write pipeline for all EPUB entries
- content.opf parser to extract:
  - book id/title
  - manifest map
  - spine reading order
- Chapter list UI from parsed spine

Implementation notes:

- Store files under OPFS path pattern:
  - /books/{bookId}/files/{relativePath}
- Persist parsed metadata in IndexedDB (books table)
- Keep a deterministic bookId (prefer OPF identifier; fallback hash)

Acceptance checks:

- Import one EPUB from ebooks and confirm chapter list renders
- Reload page and confirm imported book metadata persists
- Verify OPFS contains extracted files

---

### M3 — Chapter reader iframe (completed)

Deliverables:

- Reader screen with chapter selection
- Previous/Next chapter navigation
- Blob URL generation for selected chapter XHTML
- Sandboxed iframe with scripts enabled for EPUB diagram JS

Implementation notes:

- Resolve chapter-relative asset URLs (CSS, JS, images)
- Keep sandbox restrictive but compatible with diagram scripts
- Revoke old Blob URLs on chapter change

Acceptance checks:

- Selected chapter renders correctly
- EPUB-provided interactive diagrams still function
- Next/Prev navigation works across spine order

---

### M4 — Bookshelf management

Deliverables:

- Home screen listing imported books
- Open book action
- Delete book action

Implementation notes:

- Delete flow removes:
  - OPFS folder for book
  - IndexedDB metadata + related SRS rows
- Add confirmation prompt for destructive actions

Acceptance checks:

- Multiple books visible and selectable
- Deleting a book removes files and metadata

---

### M5 — Answer hiding enhancement injection

Deliverables:

- Post-load injection script for chapter iframe
- Initial heuristic:
  - detect headings containing “Answer” or “Solution”
  - hide content until next heading
  - insert “Show answer” reveal button

Implementation notes:

- Injection should be idempotent per chapter load
- Keep DOM changes minimal to avoid breaking EPUB JS
- Include debug mode to visualize detected sections

Acceptance checks:

- Answer sections hidden by default
- Reveal button restores content reliably
- No regression in diagram interactivity

---

### M6 — SRS foundation (SM-2 + DB schema)

Deliverables:

- db.js (Dexie schema)
- srs.js (SM-2 implementation)
- UI affordance to mark a section/item for review

Required SRS fields:

- itemId (stable): bookId + chapterFile + positionOffset
- easeFactor
- intervalDays
- repetitions
- lapses
- dueDate
- lastReviewedAt

Rating mapping:

- Again / Hard / Good / Easy -> SM-2 quality mapping

Acceptance checks:

- Creating/updating review records works
- Due date changes correctly by rating
- Data persists across reloads

---

### M7 — Review queue

Deliverables:

- Queue screen: items due today (or earlier)
- Open item in reader context
- Rating bar for Again/Hard/Good/Easy after review

Implementation notes:

- Query by dueDate <= today (local date semantics)
- Keep review loop keyboard/tap friendly

Acceptance checks:

- Due items appear correctly
- Rating an item updates schedule and queue membership

---

### M8 — Heuristic polish for Kiseido books

Deliverables:

- Refined answer-detection logic after inspecting:
  - sg0027
  - sg0028
  - sg0074
- Rule set that reduces false positives/negatives

Implementation notes:

- Add book-specific adapters if needed
- Prefer robust structural signals over plain text only

Acceptance checks:

- Spot-check representative chapters across all three books
- Document known edge cases

---

## Proposed file/module layout

- docs/index.html
- docs/sw.js
- docs/manifest.json
- docs/js/app.js
- docs/js/opfs.js
- docs/js/epub.js
- docs/js/opf-parser.js
- docs/js/reader.js
- docs/js/enhance.js
- docs/js/db.js
- docs/js/srs.js
- docs/js/review.js
- docs/css/app.css

## Data model (initial)

books table:

- id
- title
- author
- opfPath
- spine (array)
- createdAt
- updatedAt

reviews table:

- itemId (primary)
- bookId
- chapterFile
- positionOffset
- easeFactor
- intervalDays
- repetitions
- lapses
- dueDate
- lastReviewedAt

## Testing and verification plan

Manual checks per milestone:

- Chrome desktop (latest)
- Android Chrome installability
- Offline mode (DevTools + airplane mode)
- Data persistence after hard reload

Smoke checklist:

- Import book
- Open chapter
- Run diagram script in iframe
- Hide/reveal answer
- Add review item
- Rate through queue

## Risks and mitigations

1. EPUB script compatibility in sandboxed iframe
- Mitigation: start permissive enough for known diagrams, then tighten.

2. OPFS API support differences
- Mitigation: feature detection + clear fallback/error messaging.

3. Answer detection false positives
- Mitigation: diagnostics + per-book heuristic adapters.

4. Date handling drift in due calculations
- Mitigation: normalize to local date boundaries and test edge cases.

## Definition of done (overall)

- Installable PWA from GitHub Pages docs
- Import/read GoBooks EPUBs with interactive diagrams intact
- Answer sections can be hidden/revealed
- SM-2 review loop functional with persistent queue
- Documented architecture and known limitations
