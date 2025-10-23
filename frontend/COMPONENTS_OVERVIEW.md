# Frontend Components Overview

## Project Structure

```
frontend/src/
├── components/           # Reusable UI components
│   ├── common/          # Common utilities and shared components
│   │   └── NodeIcons.jsx # Node type icons and colors
│   ├── AuthModal.jsx    # Authentication modal
│   ├── BlockSettingsPanel.jsx # Block configuration panel
│   ├── ConnectionPreview.jsx  # Connection preview component
│   ├── CustomBlock.jsx  # Custom node block component
│   ├── CustomEdge.jsx   # Custom edge component
│   ├── EditorControls.jsx # Editor toolbar controls
│   ├── ErrorBoundary.jsx # Error boundary wrapper
│   ├── ErrorIndicator.jsx # Error display component
│   ├── Footer.jsx       # Site footer
│   ├── Header.jsx       # Site header
│   ├── ImportPreviewModal.jsx # JSON import preview modal
│   ├── Layout.jsx       # Main layout wrapper
│   └── Toast.jsx        # Toast notification component
├── features/            # Feature-specific components
│   └── editorV2/        # Visual editor v2
│       ├── Canvas.tsx   # Main canvas component
│       ├── constants.ts # Editor constants and specs
│       ├── CustomEdge.tsx # Custom edge implementation
│       ├── EditorShell.tsx # Editor shell wrapper
│       ├── EditorV2Shell.tsx # Main editor component
│       ├── NodePanel.tsx # Node selection panel
│       ├── nodeTypes.ts # Node type definitions
│       ├── SettingsPanel.tsx # Settings panel
│       └── Toolbar.tsx  # Editor toolbar
├── layouts/             # Layout components
│   └── SiteLayout.jsx   # Main site layout
├── pages/               # Page components
│   ├── Account.jsx      # User account page
│   ├── Editor.tsx       # Legacy editor page
│   ├── Features.jsx     # Features showcase page
│   ├── Home.jsx         # Home page
│   ├── Login.jsx        # Login page
│   ├── NotFound.jsx     # 404 page
│   ├── Pricing.jsx      # Pricing page
│   └── Templates.jsx    # Templates page
├── context/             # React context providers
├── hooks/               # Custom React hooks
├── types/               # TypeScript type definitions
├── utils/               # Utility functions
└── main.jsx            # Application entry point
```

## Key Components

### EditorV2Shell

**Location**: `features/editorV2/EditorV2Shell.tsx`
**Purpose**: Main visual editor component with React Flow integration
**Features**:

- Drag & drop node creation
- Visual flow editing
- Export/import JSON functionality
- Real-time collaboration ready

**Props**: None (uses React Router params)
**State**:

- `nodes`: Array of flow nodes
- `edges`: Array of flow edges
- `viewport`: Canvas viewport state
- `selectedNodeId`: Currently selected node

### Canvas

**Location**: `features/editorV2/Canvas.tsx`
**Purpose**: React Flow canvas wrapper
**Features**:

- Node types configuration
- Edge creation and deletion
- Viewport management
- Custom node rendering

### NodePanel

**Location**: `features/editorV2/NodePanel.tsx`
**Purpose**: Sidebar with draggable node types
**Features**:

- Categorized node types
- Drag & drop functionality
- Visual node previews
- Icon-based identification

### ImportPreviewModal

**Location**: `components/ImportPreviewModal.jsx`
**Purpose**: JSON import preview and validation
**Features**:

- Schema validation
- Visual preview
- Statistics display
- Import confirmation

### Toast

**Location**: `components/Toast.jsx`
**Purpose**: Notification system
**Features**:

- Multiple types (success, error, warning, info)
- Auto-dismiss functionality
- Smooth animations
- Custom styling

## Component Patterns

### Common Utilities

**Location**: `components/common/NodeIcons.jsx`
**Purpose**: Shared utilities for node visualization
**Functions**:

- `getNodeIcon(type)`: Returns appropriate icon for node type
- `getNodeColor(type)`: Returns color scheme for node type

### Error Handling

- **ErrorBoundary**: Catches and displays React errors
- **ErrorIndicator**: Shows error states in UI
- **Toast**: Displays error notifications

### State Management

- Local state with `useState` and `useReducer`
- Context providers for global state
- Custom hooks for reusable logic

## Styling

### Tailwind CSS

- Utility-first CSS framework
- Responsive design patterns
- Custom color schemes
- Component-specific styles

### QA Mode

**Activation**: `?qa=1` URL parameter
**Features**:

- Grid overlay for layout debugging
- Watermark with screen info
- Element outlines
- Accessibility indicators

## Data Flow

### Editor State

1. **Canvas**: Manages node/edge state
2. **NodePanel**: Provides drag sources
3. **SettingsPanel**: Edits selected node properties
4. **Toolbar**: Provides export/import actions

### Authentication

1. **AuthModal**: Handles login/register
2. **Context**: Manages auth state
3. **Protected Routes**: Route-level auth checks

## Performance Optimizations

### React Flow

- Virtualized rendering for large flows
- Memoized components
- Efficient re-rendering strategies

### Code Splitting

- Route-based code splitting
- Lazy loading for heavy components
- Dynamic imports for features

## Development Tools

### ESLint Configuration

- React-specific rules
- TypeScript support
- Accessibility checks
- Code quality enforcement

### Build Process

- Vite for fast development
- Hot module replacement
- Optimized production builds
- Asset optimization

## Testing Strategy

### Component Testing

- Unit tests for utilities
- Integration tests for workflows
- Visual regression testing
- Accessibility testing

### QA Mode Features

- Layout debugging tools
- Visual indicators
- Screen size information
- User agent display
