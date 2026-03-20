# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI小镇 (AI Town) is a multi-agent simulation system based on Stanford's "Generative Agents" research paper. It simulates autonomous AI agents with memory, reflection, and planning capabilities living in a virtual 2D world.

## Common Commands

```bash
# Development (hot reload)
npm run dev

# Run once
npm start

# Build TypeScript
npm run build

# Run tests
npm test

# Lint
npm run lint

# Database setup
npm run db:setup
```

## Architecture

### Core Components

1. **Agent** (`src/agent/agent.ts`) - Individual AI agent with perception, decision-making, and action execution
2. **Memory System** (`src/memory/memory-system.ts`) - Three-layer architecture: memory stream + reflection + retrieval
3. **LLM Client** (`src/llm/client.ts`) - Unified interface supporting OpenAI, Anthropic, Ollama, and custom providers
4. **World Simulator** (`src/world/simulator.ts`) - Event-driven simulation engine extending EventEmitter
5. **Save System** (`src/save-system.ts`) - JSON-based save/load with autosave

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

The project currently uses **Kimi K2.5** via Alibaba Cloud DashScope. Configuration is in `src/config/index.ts`:

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
src/
├── index.ts              # CLI entry with menu system and commands
├── types/index.ts        # All TypeScript interfaces and enums
├── config/index.ts       # Environment-based configuration
├── llm/client.ts         # Multi-provider LLM client
├── memory/memory-system.ts   # Memory stream, reflection, retrieval
├── agent/agent.ts        # Agent behavior and state machine
├── world/simulator.ts    # World simulation and tick loop
├── data/agent-templates.ts   # Pre-defined character templates
└── save-system.ts        # Save/load functionality
```

## Key Types

- `MemoryType`: OBSERVATION, THOUGHT, ACTION, REFLECTION, DIALOGUE
- `ActionType`: MOVE, INTERACT, TALK, THINK, WAIT, SLEEP
- `PlanType`: LONG_TERM, DAILY, HOURLY, IMMEDIATE
- `LLMConfig`: Supports provider-specific custom configuration with response path extraction

## Save/Load System

Saves are stored as JSON in `data/saves/`. The system supports:
- Manual save: `save [name]` command
- Auto-save every 5 minutes
- Exit auto-save on SIGINT
- Multiple save slots with `load <number>`

## CLI Commands

Available at runtime:
- `save [name]` / `load [number]` - Save/load game
- `talk <agent1> <agent2>` - Trigger conversation between agents
- `status` / `agents` / `memories <name>` - Inspect state
- `pause` / `resume` / `menu` - Control simulation
- `restart` / `newgame` - Reset options

## Environment Variables

Critical variables (from `.env.example`):
- `LLM_PROVIDER` - openai/anthropic/ollama/custom
- `CUSTOM_API_KEY` / `CUSTOM_ENDPOINT` - For custom provider
- `TICK_INTERVAL_MS` - Simulation tick interval (default: 5000ms)
- `WORLD_WIDTH` / `WORLD_HEIGHT` - Map dimensions (default: 50x50)
- `TIME_SCALE` - Game time speed (default: 60, meaning 1 real second = 1 game minute)
