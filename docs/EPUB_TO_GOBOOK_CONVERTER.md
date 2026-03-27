# EPUB to GoBook Converter

## Overview

The **EPUB to GoBook Converter** (`scripts/epub_to_gobook_converter.py`) is a Python tool that converts EPUB-formatted Go books into the `.gobook` text-based format used by SmartGo One and other Go book applications.

The converter:
- Extracts metadata (title, author) from EPUB OPF files
- Parses XHTML chapter content into a linear flow of text and diagrams
- Extracts SVG diagrams and converts them to `.gobook` format with:
  - Board size (`sz`)
  - Viewport (`vw`) for partial board views
  - Stone positions (`ab` for black, `aw` for white)
  - Move sequences (`mv`)
  - Captions (`ca`)
- Handles multi-language chapters
- Preserves book structure (chapters, headings, paragraphs)

## Requirements

- Python 3.6+
- Standard library modules: `xml.etree.ElementTree`, `re`, `pathlib`

## Usage

```bash
python3 scripts/epub_to_gobook_converter.py <epub_extracted_dir> <output_gobook_file>
```

### Arguments

- `<epub_extracted_dir>`: Path to an extracted EPUB directory (must contain `OPS/` subdirectory with XHTML and SVG files)
- `<output_gobook_file>`: Path where the `.gobook` output file will be written

### Example

```bash
python3 scripts/epub_to_gobook_converter.py ebooks/temp_epub_sg0027 gobooks/sg0027_ki_k46.gobook
```

## EPUB Structure Requirements

The converter expects an EPUB directory with this structure:

```
epub_extracted_dir/
├── OPS/
│   ├── book.opf                 # Metadata file
│   ├── ch0.xhtml, ch1.xhtml ... # Chapter content
│   └── css/, img/               # Supporting files (optional)
├── mimetype
├── META-INF/
│   └── container.xml
└── ... (other EPUB files)
```

### Key XHTML Requirements

#### Diagrams

Diagrams must be wrapped in `<figure>` elements with `<svg>` inside:

```html
<div class="fig cN center">
  <figure style="position:relative;">
    <svg xmlns="http://www.w3.org/2000/svg" 
         xmlns:xlink="http://www.w3.org/1999/xlink"
         viewBox="x0 y0 width height">
      <!-- SVG content with use elements for stones -->
      <use x="60" y="60" xlink:href="#b" />  <!-- Black stone -->
      <use x="84" y="84" xlink:href="#w" />  <!-- White stone -->
    </svg>
    <figcaption>Diagram Title</figcaption>
  </figure>
</div>
```

#### Container Size (`cN` class)

The `<div class="fig cN center">` wrapper indicates the full board size:
- `c7`: 7×7 board
- `c9`: 9×9 board
- `c13`: 13×13 board
- `c19`: 19×19 board

**Cropped Diagrams**: If a smaller diagram (e.g., `c7` SVG) appears within a larger full-board context (e.g., after `<div class="fig c13">`), the converter interprets it as a cropped view of the larger board, positioned at the bottom-right, and outputs:
- `sz=13` (full board size)
- `vw=G1N7` (viewport of the 7×7 crop within the 13×13)
- Coordinates mapped to the full 13×13 board

#### SVG ViewBox

The `viewBox` attribute specifies the diagram's rendering area:
- `viewBox="0 0 168 168"` → 7×7 board (7 lines × 24 pixels = 168)
- `viewBox="0 0 312 312"` → 13×13 board

Stone positioning uses pixel offsets within the viewBox (spacing = 24 pixels per line, offset = 12 pixels for the first line center).

#### Stone Markers

Stones are marked using `<use>` elements with `xlink:href`:
- `xlink:href="#b"` → Black stone
- `xlink:href="#w"` → White stone
- `xlink:href="#h"` → Hoshi (star point)

#### Move Sequences

Moves are wrapped in `<g>` elements with a `gb:v` attribute listing move numbers:

```html
<g gb:v="1">
  <use x="60" y="60" xlink:href="#b" />
</g>
```

The converter extracts move numbers and generates the `mv` (move sequence) string in the output.

## GoBook Output Format

The output `.gobook` file is a text-based format with elements prefixed by `::`.

### Example Output

```
::book(#book_id) title="Book Title" author="Author Name"

::chapter(#ch0)

Some introductory text.

::h2
Chapter Title

::dia(#ch0_dia0) sz=19 vw=A1T19 base=none at=1 mv=D4Q4 ab="D4 Q4" aw="" ca="Diagram Caption"
Diagram Caption

More text describing the diagram.
```

### Diagram Element Format

```
::dia(#diagram_id) sz=SIZE vw=VIEWPORT base=none at=MOVE_NUM mv=MOVES ab="BLACK_STONES" aw="WHITE_STONES" ca="CAPTION"
CAPTION_TEXT
```

- `sz`: Board size (7, 9, 11, 13, or 19)
- `vw`: Viewport as `COL_ROW_COL_ROW` (e.g., `A1T19` = full board, `G1N7` = bottom-right 7×7)
- `base`: `none` for self-contained diagrams
- `at`: Move number (position in the game)
- `mv`: Move sequence (space-separated or concatenated coordinates)
- `ab`: Black stone coordinates (space-separated)
- `aw`: White stone coordinates (space-separated)
- `ca`: Caption/title below diagram

## Key Features

### 1. **Automatic Board Size Detection**

The converter infers board size from:
- SVG `viewBox` dimensions (width/height in pixels)
- Div container class (e.g., `c13`)
- Full-board size context (for cropped diagrams)

### 2. **Viewport Calculation for Cropped Diagrams**

When a smaller diagram (e.g., 7×7 SVG) appears after a full-board container (e.g., `<div class="fig c13">`), the converter:
- Treats it as a cropped view of the 13×13 board
- Places it at the bottom-right corner
- Shifts all stone coordinates to full-board positions
- Outputs `sz=13` with `vw=G1N7` (or appropriate range)

### 3. **Coordinate Mapping**

SVG pixel coordinates are converted to Go board coordinates:
- `spacing = 24` pixels per line
- `offset = 12` pixels to the center of the first intersection
- Rows counted from top; converted to bottom-left origin (A1)
- Column I is skipped (standard Go notation)

### 4. **Multi-Language Support**

Chapter elements can be tagged with language codes:
```html
::de Deutscher Text
::en English text
::ja 日本語テキスト
```

### 5. **Context Tracking**

The converter maintains:
- Active chapter and diagram IDs
- Active full-board size (updated when encountering `<div class="fig c13|c19">`)
- Diagram index (auto-incremented per chapter)

## Common Issues and Solutions

### Issue: Diagrams show as `sz=7 vw=A1G7` instead of `sz=13 vw=G1N7`

**Cause**: The converter didn't recognize the enclosing `<div class="fig c13">` context.

**Solution**: Ensure:
1. Cropped diagram `<div class="fig c7">` follows a full-board `<div class="fig c13">` in the XHTML
2. Both are properly nested with `<figure>` and `<svg>` elements
3. No intervening headings reset the active board size

### Issue: Stones not extracted (empty `ab`/`aw`)

**Cause**: SVG `<use>` elements may not be parsed correctly due to namespace issues.

**Solution**: Verify:
1. `xlink:href` attributes use full namespace: `{http://www.w3.org/1999/xlink}href`
2. SVG namespaces are declared in the root `<svg>` tag:
   ```xml
   xmlns:xlink="http://www.w3.org/1999/xlink"
   ```
3. Use elements are direct children of `<svg>` or within `<g>` groups

### Issue: Move sequence not appearing (empty `mv`)

**Cause**: SVG `<g>` elements with `gb:v` attributes may have incorrect namespace or attribute format.

**Solution**: Verify:
1. Namespace usage: `{https://gobooks.com}v` or `gb:v` (both supported)
2. Format: `gb:v="1"` or `gb:v="1 2 3"` (space-separated move numbers)
3. Move numbers are digits only

## Code Structure

### Main Class: `EPUBToGobookConverter`

**Key Methods:**

- `__init__(epub_dir)`: Initialize with path to extracted EPUB
- `parse_metadata()`: Extract title and author from `book.opf`
- `parse_svg_to_diagram_info()`: Convert SVG to diagram metadata
- `pixel_to_gocoord()`: Map SVG pixel coords to Go board coords
- `parse_chapter_content()`: Walk XHTML tree and extract content
- `parse_figure_as_diagram()`: Process `<figure>` elements
- `get_chapter_order()`: Read chapter order from OPF spine
- `convert()`: Main entry point; orchestrate full conversion

**Helper Functions:**

- `strip_tag()`: Remove XML namespace from tag names
- `extract_element_text()`: Recursively extract text content
- `col_letter()`: Convert column index to letter (A-T, skip I)
- `viewport_string()`: Compute viewport range from coordinates

## Command-Line Usage

```bash
# Basic conversion
python3 scripts/epub_to_gobook_converter.py ebooks/temp_epub gobooks/output.gobook

# With shell output
python3 scripts/epub_to_gobook_converter.py ebooks/temp_epub gobooks/output.gobook > conversion.log 2>&1

# In a shell loop (multiple EPUBs)
for epub in ebooks/temp_*; do
  python3 scripts/epub_to_gobook_converter.py "$epub" "gobooks/$(basename $epub).gobook"
done
```

## Format Reference

For detailed GoBook format specification, see [docs/gobookformat.md](gobookformat.md).

## Future Improvements

- [ ] Support for offline diagram bases and variations
- [ ] Enhanced problem diagram detection (`prb` element)
- [ ] Inline diagram extraction
- [ ] Automatic chapter break detection
- [ ] Better error recovery and validation
- [ ] Progress reporting for large books

## License

Same as the parent project.
