# GoBook Reader Architecture

## Overview

The GoBook Reader is a client-side web application built with React that provides an interactive reading experience for Go books in the gobook format. The application runs entirely in the browser, using local storage for data persistence.

## System Architecture

### High-Level Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Interface │    │  Application    │    │   Data Layer    │
│                 │    │   Logic         │    │                 │
│ - React Components│    │ - State Mgmt   │    │ - Local Storage │
│ - Event Handlers │    │ - Business Logic│    │ - File Parsing  │
│ - UI Rendering   │    │ - SRS Engine    │    │ - Data Models   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Go Libraries  │
                    │                 │
                    │ - Board Rendering│
                    │ - Rule Validation│
                    │ - Move Processing│
                    └─────────────────┘
```

## Component Architecture

### Frontend Layer

#### React Components
- **App**: Root component managing global state
- **BookViewer**: Main reading interface
- **ChapterNavigator**: Table of contents and navigation
- **DiagramViewer**: Interactive Go board display
- **ProgressBar**: Reading progress indicator
- **BookmarkManager**: Bookmark creation and navigation

#### Custom Hooks
- `useBook`: Book loading and parsing
- `useProgress`: Reading progress management
- `useSRS`: Spaced repetition logic
- `useStorage`: Local storage abstraction

### Business Logic Layer

#### GoBook Parser
- **File Parser**: Converts gobook text to structured data
- **Chapter Parser**: Extracts chapter content and metadata
- **Diagram Parser**: Processes ::dia directives
- **Text Processor**: Handles formatting and markup

#### SRS Engine
- **Algorithm**: Spaced repetition scheduling
- **Queue Manager**: Review item prioritization
- **Performance Tracker**: Success/failure recording
- **Interval Calculator**: Next review date computation

#### Go Engine (@sabaki/shudan)
- **Board State**: Game position representation
- **Move Validation**: Go rule enforcement
- **Capture Detection**: Stone removal logic
- **Scoring**: Territory calculation

### Data Layer

#### Storage Abstraction
- **localStorage**: Primary storage mechanism
- **IndexedDB**: Fallback for large data
- **Data Serialization**: JSON-based persistence
- **Migration System**: Schema version handling

#### Data Models
- **Book**: Metadata and chapter structure
- **Chapter**: Content and diagrams
- **Diagram**: Board state and moves
- **Progress**: Reading position and bookmarks
- **SRS Item**: Review scheduling data

## Data Flow

### Book Loading
1. User selects gobook file
2. FileParser processes raw text
3. Book object created with chapters/diagrams
4. Book stored in application state
5. UI renders book content

### Diagram Interaction
1. User clicks on board intersection
2. Move validated by Go Engine
3. Board state updated
4. UI re-renders with new position
5. Move recorded for SRS if applicable

### Progress Saving
1. User navigates or closes app
2. Current position captured
3. Data serialized to JSON
4. Stored in localStorage
5. Retrieved on next session

## State Management

### Global State
- Current book data
- Reading position
- User preferences
- SRS queue

### Component State
- UI interaction states
- Form inputs
- Temporary data

### State Persistence
- Automatic saving on changes
- Recovery on app restart
- Export/import functionality

## Performance Considerations

### Memory Management
- Lazy loading of chapters
- Diagram component unmounting
- Large book pagination
- Garbage collection optimization

### Rendering Optimization
- React.memo for expensive components
- Virtual scrolling for long content
- Debounced event handlers
- Efficient re-rendering

### Storage Optimization
- Data compression for large books
- Incremental saving
- Cache invalidation
- Storage quota management

## Security Considerations

### Client-Side Security
- No server-side data processing
- Local file access only
- No external API dependencies
- Input validation for file parsing

### Data Privacy
- All data stored locally
- No user tracking
- Optional data export
- Clear data deletion

## Extensibility

### Plugin Architecture
- Modular component system
- Hook-based extensions
- Custom diagram types
- Third-party integrations

### API Design
- Clean component interfaces
- Consistent data models
- Event-driven communication
- Backward compatibility

## Deployment Architecture

### Development
- Vite dev server
- Hot module replacement
- Source maps for debugging
- Local file serving

### Production
- Static file hosting (GitHub Pages)
- Service worker for caching
- PWA manifest
- Offline functionality

### Build Process
- Code minification
- Asset optimization
- Bundle splitting
- Tree shaking

## Testing Strategy

### Unit Testing
- Component testing with React Testing Library
- Utility function testing
- Parser validation
- SRS algorithm verification

### Integration Testing
- End-to-end user flows
- File parsing workflows
- Storage operations
- Cross-browser compatibility

### Performance Testing
- Large book loading
- Memory usage monitoring
- Rendering performance
- Storage operation timing

## Monitoring and Analytics

### Error Tracking
- Client-side error logging
- User feedback system
- Performance metrics
- Usage analytics (optional)

### Quality Assurance
- Automated testing pipeline
- Code quality checks
- Browser compatibility testing
- Accessibility auditing

## Future Considerations

### Scalability
- Support for very large books
- Multiple concurrent books
- Advanced search capabilities
- Collaborative features

### Platform Integration
- Native app wrappers
- Cloud sync options
- Social sharing
- API integrations

This architecture provides a solid foundation for building a robust, scalable GoBook Reader while maintaining simplicity and performance.