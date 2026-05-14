import http from "http";
import { db } from "../db/connection";
import { readJsonBody } from "../middleware/json";

export async function handleState(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  subPath?: string
) {
  const url = new URL(req.url!, "http://localhost");
  const pathname = url.pathname;

  // GET /api/state - read current state
  if (pathname === "/api/state" && req.method === "GET") {
    const state = db.prepare("SELECT * FROM simulation_state WHERE id = 1").get();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(state));
    return;
  }

  // PUT /api/state - update simulation state
  if (pathname === "/api/state" && req.method === "PUT") {
    try {
      const body = await readJsonBody(req) as Record<string, unknown>;
      const allowed = [
        "tick_count", "game_time",
        "town_health_current", "town_health_max",
        "time_scale", "tile_size",
        "image_width", "image_height",
      ];
      const updates: string[] = [];
      const values: unknown[] = [];
      for (const key of allowed) {
        if (key in body) {
          updates.push(`${key} = ?`);
          values.push(body[key]);
        }
      }
      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        values.push(1);
        db.prepare(`UPDATE simulation_state SET ${updates.join(", ")} WHERE id = ?`).run(...values);
      }

      const state = db.prepare("SELECT * FROM simulation_state WHERE id = 1").get();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(state));
    } catch (e: unknown) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  // POST /api/state/snapshot - full world save
  if (subPath === "snapshot" && req.method === "POST") {
    try {
      const body = await readJsonBody(req) as Record<string, unknown>;
      const { agents, memories, reflections, areas, state: simState } = body as {
        agents: Array<Record<string, unknown>>;
        memories: Array<Record<string, unknown>>;
        reflections: Array<Record<string, unknown>>;
        areas: Array<Record<string, unknown>>;
        state: Record<string, unknown>;
      };

      const transaction = db.transaction(() => {
        // Clear and reinsert
        if (areas) {
          db.exec("DELETE FROM area_cells");
          db.exec("DELETE FROM areas");
          for (const area of areas) {
            db.prepare("INSERT INTO areas (id, name, is_blocked, services) VALUES (?, ?, ?, ?)").run(
              area.id, area.name, area.isBlocked ? 1 : 0,
              area.services ? JSON.stringify(area.services) : null
            );
            if (area.cells) {
              const cells = (area.cells as Array<{ x: number; y: number }>);
              for (const cell of cells) {
                db.prepare("INSERT INTO area_cells (area_id, x, y) VALUES (?, ?, ?)").run(area.id, cell.x, cell.y);
              }
            }
          }
        }

        if (simState) {
          const updates: string[] = [];
          const values: unknown[] = [];
          for (const key of ["tick_count", "game_time", "town_health_current", "town_health_max", "time_scale"]) {
            if (key in simState) {
              updates.push(`${key} = ?`);
              values.push(simState[key]);
            }
          }
          if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            values.push(1);
            db.prepare(`UPDATE simulation_state SET ${updates.join(", ")} WHERE id = ?`).run(...values);
          }
        }

        if (agents) {
          for (const agent of agents) {
            db.prepare(`INSERT OR REPLACE INTO agents
              (id, name, age, traits, background, goals, position_x, position_y, status,
               health_current, health_max, green_points, fullness, facing_direction,
               last_sleep_time, no_sleep_days)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              agent.id, agent.name, agent.age ?? 20,
              typeof agent.traits === "object" ? JSON.stringify(agent.traits) : String(agent.traits ?? ""),
              typeof agent.background === "object" ? JSON.stringify(agent.background) : String(agent.background ?? ""),
              typeof agent.goals === "object" ? JSON.stringify(agent.goals) : String(agent.goals ?? "[]"),
              agent.position_x ?? 0, agent.position_y ?? 0,
              agent.status ?? "idle",
              agent.health_current ?? 100, agent.health_max ?? 100,
              agent.green_points ?? 10, agent.fullness ?? 80,
              agent.facing_direction ?? "down",
              agent.last_sleep_time ?? 0, agent.no_sleep_days ?? 0
            );
          }
        }

        if (memories) {
          for (const mem of memories) {
            db.prepare(`INSERT OR REPLACE INTO memories
              (id, agent_id, content, timestamp, importance, type, last_accessed, access_count, metadata)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              mem.id, mem.agent_id, mem.content, mem.timestamp,
              mem.importance ?? 5, mem.type ?? "OBSERVATION",
              mem.last_accessed ?? mem.timestamp, mem.access_count ?? 0,
              mem.metadata ? JSON.stringify(mem.metadata) : null
            );
          }
        }

        if (reflections) {
          for (const ref of reflections) {
            db.prepare(`INSERT OR REPLACE INTO reflections (id, agent_id, content, timestamp)
              VALUES (?, ?, ?, ?)`
            ).run(ref.id, ref.agent_id, ref.content, ref.timestamp);
          }
        }
      });

      transaction();

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Snapshot saved", timestamp: new Date().toISOString() }));
    } catch (e: unknown) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return;
  }

  // GET /api/state/snapshot - full world read
  if (subPath === "snapshot" && req.method === "GET") {
    const state = db.prepare("SELECT * FROM simulation_state WHERE id = 1").get();
    const agents = db.prepare("SELECT * FROM agents").all();
    const memories = db.prepare("SELECT * FROM memories").all();
    const reflections = db.prepare("SELECT * FROM reflections").all();
    const areas = db.prepare(`
      SELECT a.id, a.name, a.is_blocked, a.services,
             JSON_GROUP_ARRAY(JSON_OBJECT('x', ac.x, 'y', ac.y))
               FILTER (WHERE ac.x IS NOT NULL) as cells
      FROM areas a
      LEFT JOIN area_cells ac ON a.id = ac.area_id
      GROUP BY a.id
    `).all();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ state, agents, memories, reflections, areas }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
}
