# Genshin Artifact Helper

A Vue 3 + TypeScript web application that helps score Genshin Impact artifacts by capturing screenshots, reading artifact stats via OCR, and calculating quality scores based on customizable build profiles.

## Features

✨ **Artifact Scoring**
- Accurate scoring algorithm based on substat rolls and character builds
- Support for 3-liner and 4-liner artifacts
- Potential score calculation for unleveled artifacts
- Multiple pre-configured build profiles (DPS, EM, Support, etc.)
- Custom build profile creation

📸 **Screen Capture**
- Browser-based screen capture (getDisplayMedia API)
- Manual screenshot upload support
- Customizable capture regions
- Continuous or manual capture modes

🔍 **OCR & Text Recognition**
- Tesseract.js integration for client-side OCR
- Image preprocessing for improved accuracy
- Auto-correction of common OCR errors
- Validation against known roll values

📊 **Artifact Management**
- Scan history with persistent storage
- Filter and sort by score, set, slot, rarity
- Export/import artifact data
- Quality recommendations

🎨 **Modern UI**
- Vue 3 Composition API
- TypeScript for type safety
- Pinia for state management
- Responsive design
- Dark/light theme support

## Project Structure

```
genshin-artifact-helper/
├── .claude/                          # Claude Code agent skills
│   ├── genshin-impact-artifacts/
│   │   ├── SKILL.md                 # Artifact scoring knowledge
│   │   ├── screen-capture-apis.md   # Screen capture documentation
│   │   ├── ocr-solutions.md         # OCR implementation guide
│   │   ├── image-preprocessing.md   # Image processing techniques
│   │   └── performance-optimization.md
│   └── project/
│       └── SKILL.md                 # Project structure & tech stack
├── src/
│   ├── types/
│   │   └── artifact.ts              # TypeScript interfaces & types
│   ├── utils/
│   │   └── scoring.ts               # Artifact scoring engine
│   ├── stores/
│   │   ├── artifact.ts              # Current artifact state
│   │   ├── settings.ts              # App settings & build profiles
│   │   └── history.ts               # Scanned artifacts history
│   ├── components/                  # Vue components (to be created)
│   ├── views/                       # Page views (to be created)
│   ├── App.vue                      # Root component
│   └── main.ts                      # Application entry
├── package.json
└── vite.config.ts
```

## Development Roadmap

### ✅ Phase 1: Core Architecture (COMPLETED)
- [x] TypeScript type definitions for artifacts
- [x] Artifact scoring engine with all formulas
- [x] Pinia stores (artifact, settings, history)
- [x] Build profile system
- [x] Agent skills documentation

### 🚧 Phase 2: Screen Capture & Image Processing (IN PROGRESS)
- [ ] Screen capture utilities (getDisplayMedia)
- [ ] Canvas-based image processing
- [ ] Region selector UI component
- [ ] Image preprocessing pipeline
- [ ] Manual screenshot upload

### 📋 Phase 3: OCR & Text Recognition (PLANNED)
- [ ] Tesseract.js integration
- [ ] OCR worker setup
- [ ] Text parsing for artifact stats
- [ ] OCR error correction
- [ ] Confidence scoring

### 📋 Phase 4: UI Components (PLANNED)
- [ ] Main dashboard view
- [ ] Capture view with live preview
- [ ] Artifact display component
- [ ] Score visualization component
- [ ] Settings panel
- [ ] History view with filtering

### 📋 Phase 5: Integration & Polish (PLANNED)
- [ ] Connect capture → OCR → scoring pipeline
- [ ] Auto-detection of new artifacts
- [ ] Keyboard shortcuts
- [ ] Performance optimization
- [ ] Error handling & user feedback
- [ ] Unit tests

## Tech Stack

### Core
- **Vue 3** - Progressive JavaScript framework
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and dev server
- **Pinia** - State management
- **Vue Router** - Client-side routing

### Development
- **Vitest** - Unit testing framework
- **ESLint** - Code linting (oxlint + eslint)
- **Prettier** - Code formatting
- **Bun/npm** - Package management

### Planned Dependencies
- **Tesseract.js** - OCR engine for text recognition
- (Optional) **Transformers.js** - Advanced ML models for OCR
- (Optional) **vue-virtual-scroller** - Virtual scrolling for large lists

## Getting Started

### Prerequisites
- Node.js v20.19.0+ or v22.12.0+
- Bun (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/GenshinArtifactHelper.git
cd GenshinArtifactHelper/genshin-artifact-helper

# Install dependencies
bun install
# or
npm install
```

### Development

```bash
# Start dev server (http://localhost:5173)
bun dev

# Type checking
bun run type-check

# Linting
bun lint

# Running tests
bun test:unit

# Build for production
bun run build
```

## Artifact Scoring Algorithm

The scoring system is based on the official Genshin Impact artifact mechanics:

### Substat Scoring
Each substat is scored as a percentage of its theoretical maximum:
```
substat_score = (current_value / max_possible_value) * 100
max_possible_value = max_roll_value × 6 (for 5★ artifacts)
```

### Overall Artifact Score
```
total_score = sum(substat_score × weight) / 1.5 / (sum(weights) / 4)
```

Where:
- `1.5` = artifact combined substats constant (9 total rolls / 6 rolls per substat)
- `4` = total possible substats
- `weight` = importance of stat for your build (0-1)

### Potential Scoring
For artifacts not at max level, remaining rolls are assumed to roll maximum values on the highest-weighted substat.

## Build Profiles

Pre-configured profiles:
- **Default** - All substats weighted equally
- **DPS (Crit focused)** - Prioritizes CRIT Rate, CRIT DMG, ATK%
- **Elemental Mastery** - For reaction-based characters
- **Support** - Energy Recharge focused
- **DEF Scaler** - For DEF-scaling characters (Albedo, Itto, etc.)
- **HP Scaler** - For HP-scaling characters (Hu Tao, Yelan, etc.)

Custom profiles can be created and saved in settings.

## Usage Guide

### Basic Workflow
1. **Start the app** and navigate to Capture view
2. **Select capture region** - Define where artifact stats appear on your screen
3. **Capture artifact** - Take screenshot or use continuous capture mode
4. **Review results** - See score, grade, and recommendations
5. **Save to history** - Keep track of your best artifacts

### Tips for Best Results
- Ensure artifact stats are clearly visible with good contrast
- Use consistent game resolution and UI scale
- Calibrate capture region once per session
- Enable preprocessing for better OCR accuracy
- Create custom build profiles for your characters

## Contributing

Contributions are welcome! This project is in active development.

### Development Priorities
1. Complete Phase 2 (Screen Capture)
2. Integrate Tesseract.js (Phase 3)
3. Build UI components (Phase 4)

### Agent Skills
Claude Code developers can use the agent skills in `.claude/` directory for context-aware assistance:
- `genshin-impact-artifacts/SKILL.md` - Artifact mechanics & scoring
- `screen-capture-apis.md` - Screen capture implementation
- `ocr-solutions.md` - OCR integration guide
- `image-preprocessing.md` - Image processing techniques
- `performance-optimization.md` - Performance best practices
- `project/SKILL.md` - Project structure & patterns

## License

[Choose a license]

## Acknowledgments

- Genshin Impact by HoYoverse/miHoYo
- Artifact roll values from the Genshin community
- OCR powered by Tesseract.js

## Roadmap Features (Future)

- 🔮 Artifact set bonus recommendations
- 📱 Mobile app version (React Native/Capacitor)
- 🖥️ Electron desktop app with overlay
- 🌍 Multi-language support (CN, JP, KR, etc.)
- 📈 Statistical analysis of artifact collection
- 🔄 Automatic artifact comparison
- 💾 Cloud sync for artifact history
- 🎯 Character-specific artifact recommendations
- 📊 Visual artifact upgrade simulator
