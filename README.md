# GoBook Reader

A web-based Go book reader that works across multiple platforms, designed to read and display Go books in the gobook format. This project aims to provide an interactive, client-side experience for studying Go.

## Purpose

The GoBook Reader allows users to load, read, and interact with Go books in the gobook format. It supports text display, diagram visualization, problem solving, and advanced features like spaced repetition for effective learning. The app runs entirely in the browser using local storage, with plans for "Add to Home Screen" functionality.

## Features

### Core Features
- **Load GoBooks**: Import and read gobook files
- **Formatted Text Display**: Properly render book content with chapters, sections, and formatting
- **Navigation**: Easy browsing through chapters and sections
- **Book Information**: Display title, author, and basic metadata at the top
- **Progress Saving**: Automatically save reading position
- **Bookmarks**: Mark and navigate to favorite sections
- **Diagram Display**: Render Go diagrams with stones and moves
- **Full GoBook Format Support**: Complete implementation of the gobook specification
- **Interactive Diagrams**: Click to place stones, follow Go rules (placement and capture)
- **Problem Mode**: Hide answer diagrams initially for problem-solving practice

### Advanced Features (Planned)
- **Problem Tracking**: Record correct/incorrect solutions
- **Spaced Repetition for Problems**: Algorithmic review scheduling for tsumego
- **Spaced Repetition for Content**: Review system for sections and concepts

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Go Libraries**: @sabaki/shudan for board rendering and game logic
- **Storage**: Browser Local Storage
- **Build**: Vite
- **Hosting**: GitHub Pages

## Getting Started

### Prerequisites
- Modern web browser with JavaScript enabled
- Node.js and npm for development

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/joeykblack/gobookreader.git
   cd gobookreader
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:5173` in your browser

### Usage

1. **Loading a Book**: Click "Load GoBook" and select a `.gobk` file
2. **Reading**: Navigate through chapters using the table of contents
3. **Diagrams**: Click on board intersections to interact with problems
4. **Bookmarks**: Use the bookmark button to save positions
5. **Progress**: Your reading position is automatically saved

## Project Structure

```
gobookreader/
├── src/
│   ├── components/     # React components
│   ├── lib/           # Go libraries and utilities
│   ├── App.jsx        # Main application component
│   └── main.jsx       # Entry point
├── info/              # Documentation
├── scripts/           # Conversion and utility scripts
├── ebooks/            # Sample EPUB files
├── gobooks/           # Sample gobook files
├── public/            # Static assets
├── package.json
├── vite.config.js
└── README.md
```

## Development

### Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Related Projects

- [GoBook Format Specification](info/gobookformat.md)
- [EPUB to GoBook Converter](info/EPUB_TO_GOBOOK_CONVERTER.md)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Roadmap

See [info/plan.md](info/plan.md) for detailed development roadmap and feature planning.