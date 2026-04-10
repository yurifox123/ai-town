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

2. **Browser-Based Simulation** (`public/js/`) - Frontend contains:
   - `app.js` - Main simulation logic, UI, event handling
   - `agent.js` - `Agent` class: perception, decision-making, action execution
   - `simulator.js` - `WorldSimulator` class: 2D grid simulation with tick-based timing
   - `memory.js` - `MemorySystem` class: three-layer memory (observations, reflections, plans)
   - `llm-client.js` - Communicates with backend `/api/llm/chat` endpoint
   - `renderer.js` - Canvas-based 2D rendering with sprite support
   - `asset-config.js` - Sprite paths and display sizes
   - `building-editor.js` - Map editing tools

### Movement System

Agent movement is now independent of the simulation tick:
- **Tick interval** (`TICK_INTERVAL_MS`): Controls decision-making frequency (default: 5000ms)
- **Move interval**: 200ms per grid cell (independent timer in Agent)
- Agents make new decisions every 50 ticks OR when reaching their destination
- Movement uses pathfinding with terrain collision detection

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
│   └── building-editor.js  # Map editor with terrain/building tools
└── assets/                 # Images and sprites
    ├── characters/         # Agent sprites (48x48px)
    ├── portraits/          # Agent portraits for UI
    ├── buildings/          # Building sprites
    ├── tiles/              # Ground tiles (grass, path, water, wall)
    └── ui/                 # UI elements
```

## Key Types

- `MemoryType`: OBSERVATION, THOUGHT, ACTION, REFLECTION, DIALOGUE
- `ActionType`: MOVE, INTERACT, TALK, THINK, WAIT, SLEEP, WORK, BUY
- `PlanType`: LONG_TERM, DAILY, HOURLY, IMMEDIATE

## Environment Variables

Critical variables (from `.env.example`):
- `LLM_PROVIDER` - openai/anthropic/ollama/custom
- `CUSTOM_API_KEY` / `CUSTOM_ENDPOINT` / `CUSTOM_RESPONSE_PATH` - For custom provider
- `CUSTOM_EMBEDDING_ENDPOINT` / `CUSTOM_EMBEDDING_RESPONSE_PATH` - Optional embedding service
- `TICK_INTERVAL_MS` - Simulation tick interval (default: 5000ms)
- `WORLD_WIDTH` / `WORLD_HEIGHT` - Map dimensions (default: 50x50)
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
- **Map Editor**: Build mode for editing terrain and placing buildings

### Agent Templates

Default agents (configured in `public/js/app.js`):

| Name | Age | Traits | Health Max | Fullness | Green Points |
|------|-----|--------|------------|----------|--------------|
| 小明 | 25 | 开朗活泼，喜欢社交 | 100 | 80 | 10 |
| 小红 | 24 | 温柔细腻，喜欢阅读 | 85 | 75 | 10 |
| 小米 | 22 | 活泼可爱，喜欢美食 | 90 | 70 | 10 |
| 小东 | 26 | 沉稳内敛，喜欢运动 | 100 | 90 | 10 |

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

**Note:** Agent templates in `public/js/app.js` are different from the legacy templates in `src/data/agent-templates.ts`.

## TypeScript Configuration

Uses `moduleResolution: "bundler"` with path mapping `@/*` → `src/*`. The `dist/` directory contains compiled output.

## Legacy CLI Mode

The original CLI mode is deprecated. The web-based simulation is now the primary interface. Legacy scripts exist for reference but may not be maintained:
- `npm run legacy:cli` - Original CLI entry point
- `npm run legacy:web` - Original WebSocket-based server
