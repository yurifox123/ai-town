import { db } from "./connection";

const schemaSql = `
-- Agents table: identity, config, runtime state
CREATE TABLE IF NOT EXISTS agents (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  age              INTEGER NOT NULL,
  traits           TEXT NOT NULL,
  background       TEXT NOT NULL,
  goals            TEXT NOT NULL DEFAULT '[]',
  position_x       INTEGER NOT NULL DEFAULT 0,
  position_y       INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'idle',
  current_action   TEXT,
  health_current   REAL NOT NULL DEFAULT 100,
  health_max       REAL NOT NULL DEFAULT 100,
  green_points     REAL NOT NULL DEFAULT 10,
  fullness         REAL NOT NULL DEFAULT 80,
  facing_direction TEXT NOT NULL DEFAULT 'down',
  last_sleep_time  INTEGER NOT NULL DEFAULT 0,
  no_sleep_days    INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Memories: observations, actions, thoughts, dialogue records
CREATE TABLE IF NOT EXISTS memories (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  timestamp     TEXT NOT NULL,
  importance    INTEGER NOT NULL,
  type          TEXT NOT NULL,
  last_accessed TEXT NOT NULL,
  access_count  INTEGER NOT NULL DEFAULT 0,
  metadata      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Embeddings stored as raw Float64 BLOB (1536 * 8 = 12288 bytes)
CREATE TABLE IF NOT EXISTS embeddings (
  memory_id TEXT PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  vector    BLOB NOT NULL
);

-- Reflections: high-level insights from memory synthesis
CREATE TABLE IF NOT EXISTS reflections (
  id               TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content          TEXT NOT NULL,
  timestamp        TEXT NOT NULL,
  reflection_depth INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Source memories that contributed to each reflection
CREATE TABLE IF NOT EXISTS reflection_sources (
  reflection_id TEXT REFERENCES reflections(id) ON DELETE CASCADE,
  memory_id     TEXT REFERENCES memories(id) ON DELETE CASCADE,
  PRIMARY KEY (reflection_id, memory_id)
);

-- Map areas with services and passability
CREATE TABLE IF NOT EXISTS areas (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  services   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual grid cells belonging to areas
CREATE TABLE IF NOT EXISTS area_cells (
  area_id TEXT REFERENCES areas(id) ON DELETE CASCADE,
  x       INTEGER NOT NULL,
  y       INTEGER NOT NULL,
  PRIMARY KEY (area_id, x, y)
);

-- Simulation state (singleton row, id=1)
CREATE TABLE IF NOT EXISTS simulation_state (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  tick_count        INTEGER NOT NULL DEFAULT 0,
  game_time         TEXT NOT NULL,
  town_health_current REAL NOT NULL DEFAULT 100,
  town_health_max   REAL NOT NULL DEFAULT 100,
  time_scale        REAL NOT NULL DEFAULT 60,
  tile_size         INTEGER NOT NULL DEFAULT 48,
  image_width       INTEGER NOT NULL DEFAULT 1536,
  image_height      INTEGER NOT NULL DEFAULT 1024,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dialogue history between agent pairs
CREATE TABLE IF NOT EXISTS dialogues (
  id         TEXT PRIMARY KEY,
  agent_id_1 TEXT NOT NULL,
  agent_id_2 TEXT NOT NULL,
  speaker_1  TEXT NOT NULL,
  speaker_2  TEXT NOT NULL,
  timestamp  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);
CREATE INDEX IF NOT EXISTS idx_reflections_agent ON reflections(agent_id);
CREATE INDEX IF NOT EXISTS idx_area_cells_area ON area_cells(area_id);
CREATE INDEX IF NOT EXISTS idx_dialogues_agents ON dialogues(agent_id_1, agent_id_2);
`;

db.exec(schemaSql);

// Seed simulation_state if not exists
const existing = db.prepare("SELECT id FROM simulation_state WHERE id = 1").get();
if (!existing) {
  db.prepare(`
    INSERT INTO simulation_state (id, tick_count, game_time, town_health_current, town_health_max, time_scale, tile_size, image_width, image_height)
    VALUES (1, 0, datetime('now'), 100, 100, 60, 48, 1536, 1024)
  `).run();
}

console.log("✅ Database schema initialized");
