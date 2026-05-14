import http from "http";
import dotenv from "dotenv";
dotenv.config();

const llmConfig = {
  provider: process.env.LLM_PROVIDER || "custom",
  model: process.env.CUSTOM_MODEL || "kimi-k2.5",
  apiKey: process.env.CUSTOM_API_KEY,
  endpoint:
    process.env.CUSTOM_ENDPOINT ||
    "https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages",
  responsePath: process.env.CUSTOM_RESPONSE_PATH || "content[1].text",
};

const embeddingConfig = {
  endpoint: process.env.CUSTOM_EMBEDDING_ENDPOINT,
  responsePath: process.env.CUSTOM_EMBEDDING_RESPONSE_PATH || "data[0].embedding",
};

function getValueByPath(obj: unknown, path: string): unknown {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let value: unknown = obj;
  for (const key of keys) {
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

async function callLLM(messages: unknown[], options: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": llmConfig.apiKey as string,
    "anthropic-version": "2023-06-01",
  };

  const body: Record<string, unknown> = {
    model: llmConfig.model,
    max_tokens: (options.maxTokens as number) || 1000,
    temperature: (options.temperature as number) || 0.7,
    thinking: { type: "disabled" },
    messages,
  };

  if (options.system) {
    body.system = options.system;
  }

  const response = await fetch(llmConfig.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  let content: unknown;
  if (data.content && Array.isArray(data.content)) {
    const textBlock = (data.content as Array<{ type: string; text: string }>).find(
      (b) => b.type === "text"
    );
    content = textBlock ? textBlock.text : getValueByPath(data, llmConfig.responsePath);
  } else {
    content = getValueByPath(data, llmConfig.responsePath);
  }

  return { content, raw: data };
}

async function getEmbedding(text: string): Promise<number[] | null> {
  if (!embeddingConfig.endpoint) return null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${llmConfig.apiKey}`,
  };

  const response = await fetch(embeddingConfig.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ input: text, model: "text-embedding-3-small" }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = await response.json();
  return (getValueByPath(data, embeddingConfig.responsePath) as number[]) ?? null;
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export async function handleLlmChat(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  try {
    const body = await readJsonBody(req);
    const { messages, options } = body as {
      messages: unknown[];
      options: Record<string, unknown>;
    };
    const result = await callLLM(messages, options || {});
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (e: unknown) {
    console.error("LLM Chat Error:", e);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}

export async function handleLlmEmbedding(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  try {
    const body = await readJsonBody(req);
    const { text } = body as { text: string };
    const embedding = await getEmbedding(text);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ embedding }));
  } catch (e: unknown) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}
