# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI生态小镇 (AI Eco Town) is a multi-agent simulation system based on Stanford's "Generative Agents" research paper. It simulates autonomous AI agents with memory, reflection, and planning capabilities living in a virtual 2D world.

**Architecture Note:** The project was refactored to a web-first architecture. The simulation now runs entirely in the browser with a lightweight Node.js server providing LLM API proxying and static file serving. See `ARCHITECTURE.md` for a deeper dive.

## Common Commands

```bash
# Start web server (default) - runs on port 3061
npm start

# Development with hot reload
npm run dev

# Build TypeScript
npm run build

# Run tests (vitest is installed but no test files exist yet — see Testing below)
npm test

# Lint
npm run lint

# Stop server (if running on port 3061)
npm run stop

# Database setup
npm run db:setup
```

Note: vitest uses default configuration (no `vitest.config.*` file exists).

## Testing

There are no formal unit/integration tests. All testing is done via **ad-hoc Playwright scripts** at the project root:

- `test-*.js` files (~15 scripts) launch the browser app, interact with it, and capture `*.png` screenshots for visual verification
- Examples: `test-freehand.js`, `test-agent-move.js`, `test-pan.js`, `test-default-map.js`
- `src/test.ts` is a legacy mock-mode test (excluded from TS compilation, not part of the active codebase)

When modifying frontend code, write a Playwright script or reuse an existing one to verify the change visually.

## Architecture

### Current Architecture (Web-First)

The system has been refactored from a CLI-based simulator to a browser-based simulation:

1. **Simple Server** (`src/server/simple-server.ts`) - HTTP server that:
   - Proxies LLM requests to the configured provider (Anthropic-style headers)
   - Serves static files from `public/`
   - Handles embedding requests
   - Auto-increments port if 3061 is in use

2. **Browser-Based Simulation** (`public/js/`) - Frontend contains:
   - `app.js` - Main simulation logic, UI, event handling (also contains its own canvas renderer)
   - `agent.js` - `Agent` class: perception, decision-making, action execution
   - `simulator.js` - `WorldSimulator` class: 2D grid simulation with tick-based timing
   - `memory.js` - `MemorySystem` class: three-layer memory (observations, reflections, plans)
   - `llm-client.js` - Communicates with backend `/api/llm/chat` endpoint
   - `asset-config.js` - Sprite paths and display sizes
   - `pathfinder.js` - A\* pathfinding with terrain collision
   - `building-editor.js` - Map editing tools
   - `image-loader.js` - Asset loading manager

   **Module dependency graph** (ES modules, all imported by `app.js`):

   ```
   app.js → simulator.js → agent.js → memory.js
                                  → pathfinder.js
                → llm-client.js
                → image-loader.js
                → asset-config.js
   ```

   **Note:** `renderer.js` exists but is not imported by the active codebase — `app.js` contains its own rendering logic. It is legacy/unused.

### Movement System

Agent movement is now independent of the simulation tick:

- **Tick interval** (`TICK_INTERVAL_MS`): Controls decision-making frequency (default: 5000ms)
- **Move interval**: 200ms per grid cell (independent timer in Agent)
- Agents make new decisions every 50 ticks OR when reaching their destination
- Movement uses A\* pathfinding (`pathfinder.js`) with terrain collision detection
- Path recalculates dynamically when blocked

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

### Survival Attributes System

Each Agent has three survival attributes that affect behavior:

- **Health** (0-100): Affected by hunger, sleep, and activities
  - Sleeping at home restores health (+10/hour)
  - Hunger below 20 causes health loss
  - Sleep deprivation penalty: 1 day (-10), 2 days (-50), 3 days (health → 0)

- **Fullness** (0-100): Hunger level, decreases over time
  - Base consumption: 3/hour
  - Moving adds: +2/hour
  - Working adds: +2/hour
  - Eating at buildings restores fullness

- **Green Points** (-10000 to 10000000): Currency system
  - Earned by working at cafes/convenience stores
  - Spent on food and services
  - Starting amount: 10 points

### Terrain System

The world includes impassable terrain that agents must navigate around:

- **wall**: Map boundary, impassable
- **river**: Winding waterway, impassable
- **fence**: Decorative barriers (e.g., around park), impassable
- **gate**: Passable entry points (map edges, park entrance)
- **bridge**: Passable river crossings

Collision detection in `agent.js:moveOneStep()` prevents agents from entering impassable cells and triggers path recalculation.

### Building Services

Buildings provide services that agents can use:

```typescript
{ name: string, cost: number, fullness?: number, health?: number, income?: number, description: string }
```

**Service Types:**

- **Food services**: Restore fullness (coffee +5, snacks +10, meals +25-50)
- **Sleep services**: Restore health (+10), only available at home
- **Work services**: Earn green points (15-25/hour), available at cafe/shop
- **Recreation**: Park activities (walking, exercise)

**Action Types:**

- `MOVE` - Navigate to target position
- `TALK` - Conversations with nearby agents
- `WAIT` - Idle action
- `SLEEP` - Return home and sleep (nighttime priority)
- `WORK` - Work at building to earn points
- `BUY` - Purchase food/service at nearby building

### Decision Priority System

Agent decisions follow a strict priority (highest to lowest):

1. Sleep deprivation (2+ days) → must SLEEP
2. Health < 30 → prioritize rest
3. Nighttime (22:00-6:00) → should SLEEP
4. Starving + has money → BUY food
5. Starving + no money → WORK first
6. Low points → consider WORK
7. Hungry + has money → seek food

## LLM Configuration

The project currently uses **Kimi K2.5** via Alibaba Cloud DashScope. Configuration is in `src/server/simple-server.ts`:

- Provider: `custom`
- Model: `kimi-k2.5` (from `CUSTOM_MODEL` env var, defaults to this)
- Endpoint: `https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages`
- Response path: `content[1].text` (Kimi returns thinking + text as two content items)

The server uses Anthropic-style headers (`x-api-key`, `anthropic-version`) for the DashScope endpoint.

To switch providers, modify `.env`:

```
LLM_PROVIDER=openai  # or anthropic, ollama, custom
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4o-mini
```

## Project Structure

```
src/                        # TypeScript source (legacy CLI + active server)
├── server/
│   └── simple-server.ts    # HTTP server + LLM proxy (the only active TS code)
├── types/
│   └── index.ts            # TypeScript interfaces and enums
├── data/
│   └── agent-templates.ts  # Legacy agent templates
└── ...                     # Legacy CLI code (deprecated, kept for reference)

public/                     # Static frontend files (primary simulation)
├── index.html              # Main HTML
├── styles.css              # Dark theme UI
├── js/
│   ├── app.js              # Main simulation logic, UI, event handling (76KB — largest file)
│   ├── agent.js            # Agent class (perception, decisions, actions)
│   ├── simulator.js        # WorldSimulator class (world state, tick loop)
│   ├── memory.js           # MemorySystem class (storage, retrieval, reflection)
│   ├── llm-client.js       # Frontend LLM client
│   ├── pathfinder.js       # A* pathfinding with terrain collision
│   ├── image-loader.js     # Asset loading manager
│   ├── asset-config.js     # Sprite paths and display sizes
│   ├── building-editor.js  # Map editor with terrain/building tools
│   └── renderer.js         # LEGACY/UNUSED — app.js has its own renderer
└── assets/                 # Images and sprites
    ├── characters/         # Agent sprites (48x48px)
    ├── portraits/          # Agent portraits for UI
    ├── buildings/          # Building sprites
    ├── tiles/              # Ground tiles (grass, path, water, wall)
    └── ui/                 # UI elements

ARCHITECTURE.md             # Detailed architecture documentation
```

## Environment Variables

Critical variables (from `.env.example`):

- `LLM_PROVIDER` - openai/anthropic/ollama/custom
- `CUSTOM_API_KEY` / `CUSTOM_ENDPOINT` / `CUSTOM_RESPONSE_PATH` - For custom provider
- `CUSTOM_EMBEDDING_ENDPOINT` / `CUSTOM_EMBEDDING_RESPONSE_PATH` - Optional embedding service
- `PORT` - Server port (default: 3061, auto-increments if in use)
- `TICK_INTERVAL_MS` - Simulation tick interval (default: 5000ms)
- `WORLD_WIDTH` / `WORLD_HEIGHT` - Map dimensions (default: 50x50)
- `MAX_AGENTS` - Maximum number of agents (default: 10)
- `TIME_SCALE` - Game time speed (default: 60, meaning 1 real second = 1 game minute)

## Map Editor

The web interface includes a full map editor accessible via "编辑地图" button:

**Tools:**

- **Select**: Click to select/move buildings
- **Ground/Path**: Paint terrain tiles (grass, path, water)
- **Building**: Place new buildings
- **Eraser**: Remove buildings

**Features:**

- Drag buildings to reposition
- Edit building properties (name, size, obstacle flag)
- Import/export map data as JSON
- Undo/redo with Ctrl+Z/Ctrl+Y
- Delete selected building with Delete key

## Web Frontend

Run `npm start` and open `http://localhost:3061`. The UI supports real-time simulation visualization, agent details (click to view memories), event log, and a map editor.

### API Endpoints

The server exposes these endpoints:

- `POST /api/llm/chat` - Proxy LLM requests (messages, options)
- `POST /api/llm/embedding` - Get text embeddings
- `POST /api/stop` - Shut down the server

## TypeScript Configuration

Uses `moduleResolution: "bundler"` with path mapping `@/*` → `src/*`. The `dist/` directory contains compiled output.

## Legacy CLI Mode

The original CLI mode is deprecated. The web-based simulation is now the primary interface. Legacy scripts exist for reference but may not be maintained:

- `npm run legacy:cli` - Original CLI entry point
- `npm run legacy:web` - Original WebSocket-based server
