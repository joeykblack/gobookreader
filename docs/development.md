# GoBook Reader Development Guide

This guide provides information for developers working on the GoBook Reader project.

## Getting Started

### Prerequisites
- Node.js 16+ and npm
- Git
- Modern web browser
- Basic knowledge of React and JavaScript

### Setup
```bash
git clone https://github.com/joeykblack/gobookreader.git
cd gobookreader
npm install
npm run dev
```

## Project Structure

```
src/
├── components/          # React components
│   ├── BookViewer.jsx   # Main book display component
│   ├── Diagram.jsx      # Go diagram component
│   ├── Navigation.jsx   # Chapter navigation
│   └── ...
├── lib/                 # Utilities and libraries
│   ├── gobook-parser.js # GoBook file parser
│   ├── go-engine.js     # Go game logic
│   ├── srs.js          # Spaced repetition system
│   └── storage.js      # Local storage utilities
├── hooks/              # Custom React hooks
├── App.jsx             # Main application
└── main.jsx            # Entry point
```

## Key Components

### GoBook Parser (`lib/gobook-parser.js`)
Responsible for parsing gobook files into structured data.

**Input**: Raw gobook text file
**Output**: Structured object with chapters, diagrams, metadata

Key functions:
- `parseGoBook(text)` - Main parsing function
- `parseChapter(text)` - Parse individual chapters
- `parseDiagram(text)` - Parse ::dia directives

### Diagram Component (`components/Diagram.jsx`)
Handles rendering and interaction with Go diagrams.

**Props**:
- `diagram` - Diagram data object
- `interactive` - Boolean for click-to-play
- `onMove` - Callback for move events

### Storage System (`lib/storage.js`)
Manages local storage for user data.

**Features**:
- Book progress saving
- Bookmark management
- SRS data persistence
- User preferences

## Development Workflow

### 1. Feature Development
1. Create a feature branch: `git checkout -b feature/your-feature`
2. Implement changes
3. Add tests if applicable
4. Update documentation
5. Test across browsers

### 2. Code Standards
- Use ESLint configuration
- Follow React best practices
- Use meaningful variable names
- Add JSDoc comments for functions

### 3. Testing
```bash
npm run test        # Run unit tests
npm run test:e2e    # Run end-to-end tests
npm run lint        # Check code style
```

### 4. Building
```bash
npm run build       # Production build
npm run preview     # Preview production build
```

## GoBook Format Implementation

### Core Elements
- `::book` - Book metadata
- `::chapter` - Chapter divisions
- `::dia` - Diagram definitions
- `::h1`, `::h2`, `::h3` - Headings
- `::p` - Paragraphs

### Diagram Parameters
- `sz` - Board size (9, 13, 19)
- `vw` - Viewport (coordinate range)
- `ab` - Black stones
- `aw` - White stones
- `mv` - Move sequence
- `ca` - Caption

## Integration with Go Libraries

### Shared Libraries
- @sabaki/shudan for Go board rendering and game logic
- Custom Go game logic for move processing and rule validation

## Performance Considerations

### Large Books
- Lazy load chapters
- Virtualize diagram rendering
- Compress stored data

### Memory Management
- Clean up unused diagram instances
- Limit concurrent interactive diagrams
- Use efficient data structures

## Browser Compatibility

### Supported Browsers
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### PWA Requirements
- HTTPS for service worker
- Modern browser APIs
- Touch event support

## Troubleshooting

### Common Issues
1. **File Loading**: Check browser security policies for file:// protocol
2. **Diagram Rendering**: Verify Go libraries are properly imported
3. **Storage Issues**: Check localStorage quota and browser settings

### Debug Tools
- Browser DevTools for React components
- Console logging for parser output
- Network tab for file loading issues

## Contributing

1. Follow the development workflow
2. Write clear commit messages
3. Update documentation for new features
4. Test on multiple browsers/devices
5. Submit pull requests with detailed descriptions

## Resources

- [GoBook Format Specification](gobookformat.md)
- [React Documentation](https://reactjs.org/)
- [Vite Documentation](https://vitejs.dev/)
- [@sabaki/shudan Documentation](https://github.com/SabakiHQ/shudan)