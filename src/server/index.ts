import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// Initialize database (side effects: creates tables)
import "./db/connection";
import "./db/schema";

import { handleLlmChat, handleLlmEmbedding } from "./routes/llm";
import { handleAgents } from "./routes/agents";
import { handleMemories } from "./routes/memories";
import { handleReflections } from "./routes/reflections";
import { handleMap } from "./routes/map";
import { handleState } from "./routes/state";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve public/ relative to project root (src/server/ -> public/)
const publicDir = path.resolve(__dirname, "..", "..", "public");

const PORT = process.env.PORT || 3061;

// Route matching: return { handler, params } or null
function matchRoute(url: string, method: string) {
  const pathname = new URL(url, "http://localhost").pathname;

  // LLM endpoints
  if (pathname === "/api/llm/chat" && method === "POST") return { handler: "llm-chat" };
  if (pathname === "/api/llm/embedding" && method === "POST") return { handler: "llm-embedding" };
  if (pathname === "/api/stop" && method === "POST") return { handler: "stop" };

  // Agent endpoints: /api/agents or /api/agents/:id
  if (pathname.startsWith("/api/agents/")) {
    const parts = pathname.split("/");
    // /api/agents/:id/memories
    if (parts.length === 5 && parts[4] === "memories") {
      return { handler: "memories", agentId: parts[3] };
    }
    // /api/agents/:id/memories/:memoryId
    if (parts.length === 6 && parts[4] === "memories") {
      return { handler: "memory", agentId: parts[3], memoryId: parts[5] };
    }
    // /api/agents/:id/reflections
    if (parts.length === 5 && parts[4] === "reflections") {
      return { handler: "reflections", agentId: parts[3] };
    }
    // /api/agents/:id
    return { handler: "agent", id: parts[3] };
  }
  if (pathname === "/api/agents") return { handler: "agents" };

  // Map endpoints
  if (pathname.startsWith("/api/map/")) {
    return { handler: "map" };
  }

  // State endpoints
  if (pathname === "/api/state") return { handler: "state" };
  if (pathname === "/api/state/snapshot") return { handler: "state", subPath: "snapshot" };

  return null;
}

/**
 * Route request to appropriate handler
 */
async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = req.url!;
  const method = req.method!;

  // API routing
  const route = matchRoute(url, method);
  if (route) {
    res.setHeader("Content-Type", "application/json");

    switch (route.handler) {
      case "llm-chat":
        return handleLlmChat(req, res);
      case "llm-embedding":
        return handleLlmEmbedding(req, res);
      case "stop":
        res.writeHead(200);
        res.end(JSON.stringify({ message: "服务器正在关闭..." }));
        console.log("\n👋 收到停止请求，正在关闭服务器...");
        setTimeout(() => process.exit(0), 500);
        return;
      case "agents":
        return handleAgents(req, res);
      case "agent":
        return handleAgents(req, res, route.id as string);
      case "memories":
        return handleMemories(req, res, route.agentId as string);
      case "memory":
        return handleMemories(req, res, route.agentId as string, route.memoryId as string);
      case "reflections":
        return handleReflections(req, res, route.agentId as string);
      case "map":
        return handleMap(req, res);
      case "state":
        return handleState(req, res, route.subPath as string | undefined);
    }
  }

  // Static file serving
  const filePath = url === "/" ? "/index.html" : url;
  const fullPath = path.join(publicDir, filePath);

  // Security: prevent directory traversal
  const resolvedPath = path.resolve(fullPath);
  if (!resolvedPath.startsWith(path.resolve(publicDir))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.promises.readFile(fullPath);
    const ext = path.extname(fullPath);
    const contentType =
      {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
      }[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      res.writeHead(404);
      res.end("Not Found");
    } else {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  }
}

/**
 * Start server with auto port increment
 */
async function main() {
  if (!process.env.CUSTOM_API_KEY) {
    console.error("❌ 错误: 未配置 LLM API Key");
    console.log("请设置 CUSTOM_API_KEY 环境变量");
    process.exit(1);
  }

  let currentPort = Number(PORT);
  let started = false;

  while (!started) {
    try {
      await new Promise((resolve, reject) => {
        const server = http.createServer(handleRequest);

        server.listen(currentPort, () => {
          console.log("\n🌐 AI生态小镇服务器已启动");
          console.log(`   访问地址: http://localhost:${currentPort}`);
          console.log(`   LLM模型: ${process.env.CUSTOM_MODEL || "kimi-k2.5"}`);
          console.log(`   数据库: ${process.env.DB_PATH || "data/ai-town.db"}`);
          console.log("");
          started = true;

          process.on("SIGINT", () => {
            console.log("\n👋 正在关闭服务器...");
            server.close(() => process.exit(0));
          });

          resolve(true);
        });

        server.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EACCES" || err.code === "EADDRINUSE") {
            console.log(`⚠️ 端口 ${currentPort} 不可用，尝试下一个端口...`);
            server.close();
            currentPort++;
            reject(err);
          } else {
            reject(err);
          }
        });
      });
    } catch {
      // continue to next port
    }
  }
}

main().catch(console.error);
