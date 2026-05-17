# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI生态小镇 (AI Eco Town) is a multi-agent simulation system based on Stanford's "Generative Agents" research paper. It simulates autonomous AI agents with memory, reflection, and planning capabilities living in a virtual 2D world.

**Architecture Note:** The project was refactored to a web-first architecture. The simulation now runs entirely in the browser with a lightweight Node.js server providing LLM API proxying and static file serving. See `ARCHITECTURE.md` for a deeper dive.

## Common Commands

```bash
# Start web server (default) - runs on port 3061
npm start

# Development with hot reload (uses tsx watch)
npm run dev

# Build TypeScript
npm run build

# Run tests (vitest is installed but no test files exist yet — see Testing below)
npm test

# Lint
npm run lint

# Stop server (if running on port 3061)
npm run stop
```

Note: vitest uses default configuration (no `vitest.config.*` file exists). The `data/` directory contains the SQLite database file (`ai-town.db`).

## Testing

There are no formal unit/integration tests. All testing is done via **ad-hoc Playwright scripts** at the project root:

- `test-*.js` files (~15 scripts) launch the browser app, interact with it, and capture `*.png` screenshots for visual verification
- Examples: `test-freehand.js`, `test-agent-move.js`, `test-pan.js`, `test-default-map.js`

When modifying frontend code, write a Playwright script or reuse an existing one to verify the change visually.

## Architecture

### Current Architecture (Web-First)

The system has been refactored from a CLI-based simulator to a browser-based simulation:

1. **Server** (`src/server/`) - Express-based HTTP server with route modules:
   - `index.ts` - Entry point, mounts middleware and routes
   - `routes/llm.ts` - Proxies LLM requests to configured provider
   - `routes/agents.ts` - Agent CRUD and actions
   - `routes/memories.ts` - Memory retrieval and storage
   - `routes/reflections.ts` - Reflection generation
   - `routes/map.ts` - Map data and building management
   - `routes/state.ts` - Simulation state persistence
   - `middleware/json.ts` - JSON body parser
   - `middleware/multipart.ts` - Multipart form handling

2. **Database** (`src/server/db/`) - SQLite via better-sqlite3:
   - `connection.ts` - Database connection singleton
   - `schema.ts` - Table definitions (agents, memories, embeddings, reflections, areas, simulation_state, dialogues)

3. **Browser-Based Simulation** (`public/js/`) - Frontend organized by domain:
   - `core/agent.js` - `Agent` class: perception, decision-making, action execution
   - `core/simulator.js` - `WorldSimulator` class: 2D grid simulation with tick-based timing
   - `core/memory.js` - `MemorySystem` class: three-layer memory (observations, reflections, plans)
   - `core/pathfinder.js` - A\* pathfinding with terrain collision
   - `app/app.js` - Main simulation logic, UI, event handling (canvas renderer)
   - `app/llm-client.js` - Communicates with backend `/api/llm/chat` endpoint
   - `assets/asset-config.js` - Sprite paths and display sizes
   - `assets/image-loader.js` - Asset loading manager
   - `editor/building-editor.js` - Map editing tools

   **Module dependency graph** (ES modules, all imported by `app/app.js`):

   ```
   app/app.js → core/simulator.js → core/agent.js → core/memory.js
                                            → core/pathfinder.js
                 → app/llm-client.js
                 → assets/image-loader.js
                 → assets/asset-config.js
   ```

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

The project currently uses **Kimi K2.5** via Alibaba Cloud DashScope. Configuration is in `src/server/routes/llm.ts`:

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
src/
├── server/
│   ├── index.ts            # Server entry point, mounts routes
│   ├── db/
│   │   ├── connection.ts   # SQLite connection singleton
│   │   └── schema.ts       # Table definitions
│   ├── routes/
│   │   ├── llm.ts          # LLM proxy endpoints
│   │   ├── agents.ts       # Agent CRUD
│   │   ├── memories.ts     # Memory operations
│   │   ├── reflections.ts  # Reflection generation
│   │   ├── map.ts          # Map/building management
│   │   └── state.ts        # Simulation state persistence
│   └── middleware/
│       ├── json.ts         # JSON body parser
│       └── multipart.ts    # Multipart form handling

public/
├── index.html
├── styles.css
├── js/
│   ├── core/               # Simulation logic
│   │   ├── agent.js
│   │   ├── simulator.js
│   │   ├── memory.js
│   │   └── pathfinder.js
│   ├── app/                # UI and main entry
│   │   ├── app.js          # Main entry, canvas renderer (~76KB)
│   │   └── llm-client.js
│   ├── assets/             # Asset management
│   │   ├── asset-config.js
│   │   ├── image-loader.js
│   │   └── sprite-crop-tool.js
│   ├── editor/             # Map editor
│   │   └── building-editor.js
│   └── tools/              # Dev tools
│       └── anim-test.js
└── assets/                 # Images and sprites

data/                       # Runtime data (gitignored)
├── ai-town.db              # SQLite database
└── saves/                  # Save files

ARCHITECTURE.md
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
- `GET/POST /api/agents` - Agent CRUD
- `GET/POST /api/memories` - Memory operations
- `POST /api/reflections` - Reflection generation
- `GET/PUT /api/map` - Map and building data
- `GET/POST /api/state` - Simulation state persistence
- `POST /api/stop` - Shut down the server

## TypeScript Configuration

Uses `moduleResolution: "bundler"` with path mapping `@/*` → `src/*`. The `dist/` directory contains compiled output.
