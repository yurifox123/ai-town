# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI生态小镇 (AI Eco Town) is a multi-agent simulation system based on Stanford's "Generative Agents" research paper. It simulates autonomous AI agents with memory, reflection, and planning capabilities living in a virtual 2D world.

**Architecture Note:** The project was refactored to a web-first architecture. The simulation now runs entirely in the browser with a lightweight Node.js server providing LLM API proxying and static file serving.

## Common Commands

```bash
# Start web server (default) - runs on port 3061
npm start

# Development with hot reload
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Run a single test file
npx vitest run src/path/to/test.ts

# Lint
npm run lint

# Stop server (if running on port 3061)
npm run stop

# Database setup
npm run db:setup
```

## Architecture

### Current Architecture (Web-First)

The system has been refactored from a CLI-based simulator to a browser-based simulation:

1. **Simple Server** (`src/server/simple-server.ts`) - HTTP server that:
   - Proxies LLM requests to the configured provider
   - Serves static files from `public/`
   - Handles embedding requests

2. **Browser-Based Simulation** (`public/js/app.js`) - Frontend contains:
   - `Agent` class - Perception, decision-making, and action execution
   - `WorldSimulator` class - 2D grid simulation with tick-based timing
   - `MemorySystem` - Three-layer memory (observations, reflections, plans)
   - `LLMClient` - Communicates with backend `/api/llm/chat` endpoint
   - `Renderer` - Canvas-based 2D rendering with sprite support

### Movement System

Agent movement is now independent of the simulation tick:
- **Tick interval** (`TICK_INTERVAL_MS`): Controls decision-making frequency (default: 5000ms)
- **Move interval**: 200ms per grid cell
- Agents make new decisions only every 50 ticks or when they reach their destination

### Memory Retrieval Algorithm

The system uses a three-dimensional weighted scoring for memory retrieval:
```
score = relevance × 0.6 + recency × 0.2 + importance × 0.2
```

Where:
- Relevance = cosine similarity between query and memory embeddings
- Recency = exponential decay based on hours since creation
- Importance = 1-10 score normalized to 0-1

### Agent Lifecycle

```
initialize() → perceive() → decide() → executeAction() → (loop)
```

Reflection triggers when memory count exceeds 100, generating high-level insights that are added back to the memory stream.

## LLM Configuration

The project currently uses **Kimi K2.5** via Alibaba Cloud DashScope. Configuration is in `src/server/simple-server.ts`:

- Provider: `custom`
- Endpoint: `https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages`
- Response path: `content[1].text` (Kimi returns thinking + text as two content items)

To switch providers, modify `.env`:
```
LLM_PROVIDER=openai  # or anthropic, ollama, custom
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4o-mini
```

## Project Structure

```
src/                        # TypeScript source (legacy CLI + server)
├── server/
│   └── simple-server.ts    # HTTP server + LLM proxy
├── types/
│   └── index.ts            # TypeScript interfaces and enums
├── data/
│   └── agent-templates.ts  # Legacy agent templates
└── ...                     # Other legacy CLI code

public/                     # Static frontend files (primary simulation)
├── index.html              # Main HTML
├── styles.css              # Dark theme UI
├── js/
│   ├── app.js              # Main simulation logic, UI, event handling
│   ├── agent.js            # Agent class (perception, decisions, actions)
│   ├── simulator.js        # WorldSimulator class (world state, tick loop)
│   ├── memory.js           # MemorySystem class (storage, retrieval, reflection)
│   ├── llm-client.js       # Frontend LLM client
│   ├── renderer.js         # Canvas rendering with sprite support
│   ├── image-loader.js     # Asset loading manager
│   ├── asset-config.js     # Sprite paths and display sizes
│   └── building-editor.js  # Map editing tools
└── assets/                 # Images and sprites
    ├── characters/         # Agent sprites (48x48px)
    ├── portraits/          # Agent portraits for UI
    ├── buildings/          # Building sprites
    ├── tiles/              # Ground tiles
    └── ui/                 # UI elements
```

## Key Types

- `MemoryType`: OBSERVATION, THOUGHT, ACTION, REFLECTION, DIALOGUE
- `ActionType`: MOVE, INTERACT, TALK, THINK, WAIT, SLEEP
- `PlanType`: LONG_TERM, DAILY, HOURLY, IMMEDIATE

## Environment Variables

Critical variables (from `.env.example`):
- `LLM_PROVIDER` - openai/anthropic/ollama/custom
- `CUSTOM_API_KEY` / `CUSTOM_ENDPOINT` / `CUSTOM_RESPONSE_PATH` - For custom provider
- `CUSTOM_EMBEDDING_ENDPOINT` / `CUSTOM_EMBEDDING_RESPONSE_PATH` - Optional embedding service
- `TICK_INTERVAL_MS` - Simulation tick interval (default: 5000ms)
- `WORLD_WIDTH` / `WORLD_HEIGHT` - Map dimensions (default: 50x50)
- `TIME_SCALE` - Game time speed (default: 5, meaning 1 real second = 5 game minutes)

## Web Frontend

The web frontend is a browser-based simulation.

### Running the Frontend

```bash
# Start the server
npm start
```

Then open your browser to `http://localhost:3061` (or the port shown in console).

### Frontend Features

- **Real-time Visualization**: 2D grid world with Agent positions and buildings
- **Live Updates**: Agent movement and status updates via browser-based simulation
- **Agent Details**: Click on any Agent to view their memories, reflections, and background
- **Event Log**: Real-time display of world events and Agent actions
- **Simulation Control**: Start/stop/pause simulation from the web interface
- **Interactive Map**: Hover over elements to see tooltips, click Agents for details
- **Map Editor**: Build mode for editing terrain and placing buildings (toggle with "编辑地图" button)

### API Endpoints

The server exposes these endpoints:

- `POST /api/llm/chat` - Proxy LLM requests (messages, options)
- `POST /api/llm/embedding` - Get text embeddings
- `POST /api/stop` - Shut down the server

## Asset Configuration

Character and building sprites are configured in `public/js/asset-config.js`:
- Characters have `sprite` (world), `portrait` (UI), and `displaySize`
- Buildings have `sprite` and `displaySize`
- Supports dynamic loading with fallback to default

**Note:** Agent templates in `public/js/app.js` (xiaoming, xiaohong, xiaomi, xiaodong) are different from the legacy templates in `src/data/agent-templates.ts`.

## TypeScript Configuration

Uses `moduleResolution: "bundler"` with path mapping `@/*` → `src/*`. The `dist/` directory contains compiled output.

## Legacy CLI Mode

The original CLI mode is deprecated. The web-based simulation is now the primary interface. Legacy scripts exist for reference but may not be maintained:
- `npm run legacy:cli` - Original CLI entry point
- `npm run legacy:web` - Original WebSocket-based server
