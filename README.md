# Genshin Artifact Helper

Browser-based tool for scoring Genshin Impact artifacts in live mode. Runs locally in your browser, scans a captured game window for artifact details, and scores them based on potential.

## Current status

In active development, not ready for general use. Currently works as a vertical slice to test the core functionality.

## Features

- **Live capture** [works] - shares your game window with the browser and scans artifacts automatically
- **OCR** [mostly works] - reads artifact name, set, main stat, and all four substats using Tesseract.js, entirely in-browser
- **Build profiles** [basic functionality] - configure which substats matter for each character/build and their weights
- **Scoring** [works] - scores each artifact against the active build profile, showing roll efficiency and potential
- **Continuous mode** [mostly works] - auto-scans at a set interval for hands-free artifact farming
- **Inventory** [planned] - keeps a log of all scanned artifacts in the session, helps compare artifacts and make better decisions on what to keep and what to feed to the strongbox 

## Getting Started

### Prerequisites

- A modern desktop browser with screen capture support (Firefox, Chrome, Edge, Brave).

### Install and run

```sh
bun install
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for production

```sh
bun run build
bun run preview   # preview the built output
```

## Usage

1. Open the app in your browser
2. Click **Start Capture** and select your Genshin Impact game window
3. Navigate to an artifact in your inventory, character screen or on domain reward screen - the app will scan and score it automatically
4. Adjust build profiles in **Settings** to match the character you're farming for

## How it works

```
Screen capture > Image preprocessing > Screen Detection > Artifact Detection > OCR > Parsing > Scoring
```

- **Capture** - uses the browser `getDisplayMedia` API to share the game window
- **OCR** - runs Tesseract.js in parallel across multiple artifact screen regions

## Tech stack

- TypeScript
- [Vue 3](https://vuejs.org/), [Pinia](https://pinia.vuejs.org/), [Vitest](https://vitest.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Tesseract.js](https://tesseract.projectnaptha.com/)

## Acknowledgements

This project was inspired by the excellent work of the Genshin Impact community, especially:

- [Genshin Optimizer](https://github.com/frzyc/genshin-optimizer)
- [Inventory Kamera](https://github.com/Andrewthe13th/Inventory_Kamera)

## License

MIT - see [LICENSE](LICENSE).

This project is not affiliated with, endorsed by, or in any way connected to HoYoverse or the Genshin Impact team. Genshin Impact is a trademark of HoYoverse.

This project makes use of several third-party open source libraries. See `package.json` for the full list of dependencies and their respective licenses.
