#!/usr/bin/env python3
"""
Convert EPUB go books to .gobook format
Parses XHTML chapters and extracts go diagrams from SVG
"""

import os
import sys
import re
import xml.etree.ElementTree as ET
import zipfile
import shutil
from pathlib import Path
from typing import List, Tuple, Dict, Optional

class EPUBToGobookConverter:
    def __init__(self, epub_dir: str):
        self.epub_dir = Path(epub_dir)
        self.ops_dir = self.epub_dir / "OPS"
        self.metadata = {}
        self.chapters = []
        self.diagrams = []
        
    def parse_metadata(self):
        """Extract metadata from book.opf"""
        opf_path = self.ops_dir / "book.opf"
        if not opf_path.exists():
            print(f"Warning: book.opf not found at {opf_path}")
            return
            
        tree = ET.parse(opf_path)
        root = tree.getroot()
        
        # Define namespaces
        ns = {
            'opf': 'http://www.idpf.org/2007/opf',
            'dc': 'http://purl.org/dc/elements/1.1/'
        }
        
        # Extract metadata
        title_elem = root.find('.//dc:title', ns)
        if title_elem is not None:
            self.metadata['title'] = title_elem.text
            
        creator_elem = root.find('.//dc:creator', ns)
        if creator_elem is not None:
            self.metadata['author'] = creator_elem.text
            
        print(f"Metadata extracted: {self.metadata}")
    
    def extract_coordinates_from_svg(self, svg_element) -> Tuple[List[str], List[Dict]]:
        """
        Extract black and white stone coordinates from SVG
        Returns (move_sequence, stones_info)
        """
        moves = []
        stones = {'black': [], 'white': []}
        
        # Find all use elements that reference stone definitions
        for use in svg_element.findall('.//{http://www.w3.org/2000/svg}use'):
            href = use.get('{http://www.w3.org/1999/xlink}href', '')
            x = use.get('x')
            y = use.get('y')
            
            if x and y and href:
                # Convert pixel coordinates to board coordinates
                coord = self.pixel_to_gocoord(float(x), float(y), svg_element)
                
                if href == '#b':
                    stones['black'].append(coord)
                elif href == '#w':
                    stones['white'].append(coord)
        
        return moves, stones
    
    def pixel_to_gocoord(self, x: float, y: float, board_size: int, x0: float = 0.0, y0: float = 0.0) -> str:
        """Convert SVG pixel coordinates to Go board coordinates (A1-T19). x0/y0 are viewbox offsets in pixels."""
        spacing = 24
        offset = 12
        
        full_x = x + x0
        full_y = y + y0
        col_idx = round((full_x - offset) / spacing)
        row_idx = round((full_y - offset) / spacing)
        
        col_idx = max(0, min(col_idx, board_size - 1))
        row_idx = max(0, min(row_idx, board_size - 1))
        
        col_letter = chr(ord('A') + col_idx) if col_idx < 8 else chr(ord('A') + col_idx + 1)
        row_number = board_size - row_idx
        
        return f"{col_letter}{row_number}"
    
    def parse_diagram_from_xhtml(self, xhtml_path: Path) -> List[Dict]:
        """
        Parse diagrams from an XHTML file
        Returns list of diagram info
        """
        diagrams_found = []

        def board_size_from_viewbox(svg):
            viewbox = svg.get('viewBox', '0 0 456 456')
            parts = viewbox.split()
            if len(parts) >= 4:
                try:
                    width = float(parts[2])
                except ValueError:
                    return 19
                size = round(width / 24)
                if size in (7, 9, 11, 13, 19):
                    return size
            return 19

        def vw_from_size(size):
            if size == 7:
                return 'A1G7'
            if size == 9:
                return 'A1I9'
            if size == 11:
                return 'A1K11'
            if size == 13:
                return 'A1M13'
            return 'A1T19'

        try:
            tree = ET.parse(xhtml_path)
            root = tree.getroot()

            # Find all SVG elements
            for svg in root.findall('.//{http://www.w3.org/2000/svg}svg'):
                # Find annotation text from figcaption
                parent = svg
                cap_text = None
                for _ in range(5):
                    parent = parent.find('..')
                    if parent is None:
                        break
                if parent is not None:
                    figcaption = parent.find('.//{http://www.w3.org/1999/xhtml}figcaption')
                    if figcaption is not None:
                        cap_text = self.extract_element_text(figcaption).strip()

                diagram_info = self.parse_svg_to_diagram_info(svg, cap_text)
                if diagram_info is not None:
                    diagrams_found.append(diagram_info)

        except ET.ParseError as e:
            print(f"Warning: Error parsing {xhtml_path}: {e}")

        return diagrams_found
    
    def extract_text_from_xhtml(self, xhtml_path: Path) -> str:
        """Extract readable text from XHTML file"""
        text = []
        
        try:
            tree = ET.parse(xhtml_path)
            root = tree.getroot()
            
            # Extract title
            for h in root.findall('.//{http://www.w3.org/1999/xhtml}h1'):
                if h.text:
                    text.append(f"::h1\n{h.text}\n")
            
            for h in root.findall('.//{http://www.w3.org/1999/xhtml}h2'):
                if h.text:
                    text.append(f"::h2\n{h.text}\n")
            
            # Extract paragraphs
            for p in root.findall('.//{http://www.w3.org/1999/xhtml}p'):
                para_text = self.extract_element_text(p)
                if para_text.strip():
                    text.append(para_text.strip())
                    text.append("")  # Add blank line between paragraphs
        
        except ET.ParseError as e:
            print(f"Warning: Error parsing {xhtml_path}: {e}")
        
        return "\n".join(text)
    
    def extract_element_text(self, element) -> str:
        """Recursively extract text from element"""
        text = element.text or ""
        for child in element:
            text += self.extract_element_text(child)
            text += child.tail or ""
        return text

    def parse_svg_to_diagram_info(self, svg, caption_text=None, container_size=None, full_size_override=None) -> Optional[Dict]:
        """Convert an SVG element into diagram info (ab/aw, sz, vw, mv, etc.)"""
        def parse_viewbox(svg_el):
            viewbox = svg_el.get('viewBox', '0 0 456 456').strip()
            parts = re.split(r'\s+', viewbox)
            if len(parts) >= 4:
                try:
                    x0 = float(parts[0])
                    y0 = float(parts[1])
                    width = float(parts[2])
                    height = float(parts[3])
                except ValueError:
                    return 0.0, 0.0, 456.0, 456.0
                return x0, y0, width, height
            return 0.0, 0.0, 456.0, 456.0

        def size_from_viewbox(view_w):
            size = round(view_w / 24)
            if size in (7, 9, 11, 13, 19):
                return size
            for candidate in (19, 13, 11, 9, 7):
                if abs(view_w - candidate * 24) < 24:
                    return candidate
            return 19

        def board_size_from_container(csize):
            try:
                c = int(csize)
                if c in (7, 9, 11, 13, 19):
                    return c
            except Exception:
                pass
            return None

        def col_letter(idx):
            if idx < 0:
                idx = 0
            if idx < 8:
                return chr(ord('A') + idx)
            return chr(ord('A') + idx + 1)

        def viewport_string(full_sz, x0, y0, w, h):
            cols = max(1, int(round(w / 24)))
            rows = max(1, int(round(h / 24)))
            left = max(0, int(round(x0 / 24)))
            top = max(0, int(round(y0 / 24)))
            right = min(full_sz - 1, left + cols - 1)
            bottom = min(full_sz - 1, top + rows - 1)
            start_col = col_letter(left)
            end_col = col_letter(right)
            start_row = full_sz - bottom
            end_row = full_sz - top
            return f"{start_col}{start_row}{end_col}{end_row}"

        if svg is None:
            return None

        x0, y0, view_w, view_h = parse_viewbox(svg)
        view_size = size_from_viewbox(view_w)
        full_size = (full_size_override if full_size_override is not None else
                     board_size_from_container(container_size) or view_size)

        # If this diagram is a smaller crop (e.g. c7 under a full 13 board), map to the larger board.
        if full_size > view_size and view_size in (7, 9, 11) and full_size in (13, 19):
            crop_offset = full_size - view_size
            # Coordinates are given for the local crop; shift to bottom-right on the full board.
            x0 = crop_offset * 24
            y0 = crop_offset * 24
            vw = f"{col_letter(crop_offset)}1{col_letter(full_size - 1)}{view_size}"
        else:
            vw = viewport_string(full_size, x0, y0, view_w, view_h)

        stones_black = []
        stones_white = []
        move_events = []

        for g in svg.findall('.//{http://www.w3.org/2000/svg}g'):
            gbv = g.get('{https://gobooks.com}v') or g.get('gb:v')
            moves = [int(t) for t in gbv.split() if t.isdigit()] if gbv else []
            for use in g.findall('.//{http://www.w3.org/2000/svg}use'):
                href = use.get('{http://www.w3.org/1999/xlink}href', '')
                x = use.get('x')
                y = use.get('y')
                if x and y and href in ['#b', '#w']:
                    coord = self.pixel_to_gocoord(float(x), float(y), full_size, x0, y0)
                    if href == '#b':
                        if coord not in stones_black:
                            stones_black.append(coord)
                    else:
                        if coord not in stones_white:
                            stones_white.append(coord)
                    if moves:
                        move_events.append((moves[0], coord))

        for use in svg.findall('.//{http://www.w3.org/2000/svg}use'):
            href = use.get('{http://www.w3.org/1999/xlink}href', '')
            x = use.get('x')
            y = use.get('y')
            if x and y and href in ['#b', '#w']:
                coord = self.pixel_to_gocoord(float(x), float(y), full_size, x0, y0)
                if href == '#b':
                    if coord not in stones_black:
                        stones_black.append(coord)
                else:
                    if coord not in stones_white:
                        stones_white.append(coord)

        if not stones_black and not stones_white and not move_events:
            return None

        mv = None
        if move_events:
            move_events.sort(key=lambda e: e[0])
            mv = ''.join(e[1] for e in move_events)

        return {
            'sz': full_size,
            'vw': vw,
            'ab': stones_black,
            'aw': stones_white,
            'mv': mv,
            'ca': caption_text,
            'at': 1,
        }
    def strip_tag(self, tag: str) -> str:
        """Remove namespace from XML tag."""
        if '}' in tag:
            return tag.split('}', 1)[1]
        return tag

    def parse_figure_as_diagram(self, figure_element, chapter_clean_id: str, diag_index: int, container_size=None, full_size_override=None):
        """Convert a <figure> element containing an SVG diagram to ::dia output."""
        lines = []
        svg = figure_element.find('.//{http://www.w3.org/2000/svg}svg')
        if svg is None:
            return lines, diag_index

        caption_elem = figure_element.find('.//{http://www.w3.org/1999/xhtml}figcaption')
        caption_text = None
        if caption_elem is not None:
            caption_text = self.extract_element_text(caption_elem).strip()

        diagram_info = self.parse_svg_to_diagram_info(svg, caption_text, container_size, full_size_override)
        if diagram_info is None:
            return lines, diag_index

        dia_id = f"{chapter_clean_id}_dia{diag_index}"
        diag_index += 1

        attrs = [f"sz={diagram_info['sz']}", f"vw={diagram_info['vw']}", "base=none"]
        if diagram_info.get('at') is not None:
            attrs.append(f"at={diagram_info['at']}")
        if diagram_info.get('mv'):
            attrs.append(f"mv={diagram_info['mv']}")

        ab = " ".join(sorted(set(diagram_info['ab'])))
        aw = " ".join(sorted(set(diagram_info['aw'])))
        if ab:
            attrs.append(f'ab="{ab}"')
        if aw:
            attrs.append(f'aw="{aw}"')

        lines.append(f"::dia(#{dia_id}) {' '.join(attrs)}")

        if diagram_info.get('ca'):
            lines.append(diagram_info['ca'])
        else:
            lines.append(f"Figure from {chapter_clean_id}")

        lines.append("")
        return lines, diag_index

    def parse_chapter_content(self, xhtml_path: Path, chapter_clean_id: str) -> List[str]:
        """Parse body content in reading order and return gobook lines."""
        lines = []
        diag_index = 0

        try:
            tree = ET.parse(xhtml_path)
            root = tree.getroot()
            body = root.find('.//{http://www.w3.org/1999/xhtml}body')
            if body is None:
                return lines

            active_full_size = None
            def walk(element, parent_container_size=None):
                nonlocal diag_index, active_full_size
                tag = self.strip_tag(element.tag)

                # Extract fig class cN for container_size
                container_size = parent_container_size
                if tag == 'div':
                    class_attr = element.get('class', '')
                    match = re.search(r'c(\d+)', class_attr)
                    if match:
                        container_size = int(match.group(1))
                        if container_size in (13, 19):
                            active_full_size = container_size

                if tag in ('h1', 'h2', 'h3', 'h4', 'h5'):
                    heading_text = self.extract_element_text(element).strip()
                    if heading_text:
                        lines.append(f"::{tag}")
                        lines.append(heading_text)
                        lines.append("")
                    return

                if tag == 'p':
                    para_text = self.extract_element_text(element).strip()
                    if para_text:
                        lines.append(para_text)
                        lines.append("")
                    return

                if tag == 'figure':
                    diag_lines, diag_index = self.parse_figure_as_diagram(element, chapter_clean_id, diag_index, container_size, full_size_override=active_full_size)
                    if diag_lines:
                        lines.extend(diag_lines)
                        return

                # Recurse with container_size passed down
                for child in element:
                    walk(child, container_size)

            walk(body)
        except ET.ParseError as e:
            print(f"Warning: Error parsing {xhtml_path}: {e}")

        return lines

    def get_chapter_order(self) -> List[str]:
        """Get chapter order from OPF spine"""
        chapter_order = []
        opf_path = self.ops_dir / "book.opf"
        
        try:
            tree = ET.parse(opf_path)
            root = tree.getroot()
            
            ns = {'opf': 'http://www.idpf.org/2007/opf'}
            spine = root.find('.//opf:spine', ns)
            
            if spine is not None:
                for itemref in spine.findall('opf:itemref', ns):
                    idref = itemref.get('idref')
                    if idref:
                        chapter_order.append(idref)
        except Exception as e:
            print(f"Warning: Could not parse spine: {e}")
        
        return chapter_order
    
    def convert(self) -> str:
        """Convert EPUB to gobook format"""
        self.parse_metadata()
        
        # Start building gobook file
        gobook_lines = []
        
        # Add book element
        book_id = self.metadata.get('title', 'sample').lower().replace(' ', '_')
        title = self.metadata.get('title', 'Untitled')
        author = self.metadata.get('author', 'Unknown')
        
        gobook_lines.append(f'::book(#{book_id}) title="{title}" author="{author}"')
        gobook_lines.append("")
        
        # Get chapter order
        chapter_order = self.get_chapter_order()
        if not chapter_order:
            # Fallback: find all chapter files
            chapter_order = [f.stem for f in sorted(self.ops_dir.glob('ch*.xhtml'))]
        
        # Process chapters
        for i, chapter_id in enumerate(chapter_order):
            if chapter_id.startswith('ch'):
                xhtml_file = self.ops_dir / f"{chapter_id}.xhtml"
            else:
                # Try to find by ID in manifest
                xhtml_file = self.ops_dir / f"{chapter_id}.xhtml"
            
            if not xhtml_file.exists():
                # Try variations
                for candidate in self.ops_dir.glob(f"{chapter_id}*.xhtml"):
                    xhtml_file = candidate
                    break
            
            if xhtml_file.exists():
                print(f"Processing: {xhtml_file.name}")
                
                # Add chapter
                clean_id = chapter_id.replace('-', '_')
                gobook_lines.append(f"::chapter(#{clean_id})")
                gobook_lines.append("")

                # Parse chapter body content in order
                chapter_lines = self.parse_chapter_content(xhtml_file, clean_id)
                if chapter_lines:
                    gobook_lines.extend(chapter_lines)
                    gobook_lines.append("")

                # No additional diagram append here; parse_chapter_content already emits diagrams inline
        
        return "\n".join(gobook_lines)
    
    def copy_images(self, book_dir: Path):
        """Copy images from EPUB to book directory"""
        img_src = self.ops_dir / "img"
        img_dest = book_dir / "img"
        
        if img_src.exists():
            shutil.copytree(img_src, img_dest, dirs_exist_ok=True)
            print(f"Copied images from {img_src} to {img_dest}")
        else:
            print(f"No images found in {img_src}")

    def save(self, output_path: str):
        """Stage gobook text file and images in a folder under gobooks/ for later zipping"""
        # Create book directory
        book_name = Path(output_path).stem  # Remove .gobk extension
        book_dir = Path("gobooks") / book_name
        book_dir.mkdir(parents=True, exist_ok=True)
        
        # Copy images
        self.copy_images(book_dir)
        
        # Generate gobook content
        content = self.convert()
        
        # Write gobook file
        gobook_path = book_dir / f"{book_name}.gobook"
        with open(gobook_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"Gobook file staged: {gobook_path}")
        print(f"File size: {len(content)} bytes")
        
        # Note: Zipping will be done during npm build

def main():
    if len(sys.argv) < 2:
        print("Usage: python epub_to_gobook_converter.py <epub_extracted_dir> [output_file.gobk]")
        print("Example: python epub_to_gobook_converter.py temp_epub_sg0027 sg0027_ki_k46.gobk")
        sys.exit(1)
    
    epub_dir = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else "output.gobk"
    
    # Ensure output has .gobk extension
    if not output_file.endswith('.gobk'):
        output_file += '.gobk'
    
    if not Path(epub_dir).exists():
        print(f"Error: Directory {epub_dir} does not exist")
        sys.exit(1)
    
    converter = EPUBToGobookConverter(epub_dir)
    converter.save(output_file)

if __name__ == "__main__":
    main()
