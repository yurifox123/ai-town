import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';

// 加载环境变量
config({ path: resolve(process.cwd(), '.env') });

/**
 * 应用配置
 */
export const appConfig = {
  // LLM配置 - 默认使用 Kimi K2.5
  llm: {
    provider: (process.env.LLM_PROVIDER || 'custom') as 'openai' | 'anthropic' | 'ollama' | 'custom',
    model: process.env.CUSTOM_MODEL || 'kimi-k2.5',
    apiKey: process.env.CUSTOM_API_KEY || 'sk-sp-991b70d4182e4608949442d262161dc2',
    temperature: 0.7,
    maxTokens: 1000,
    // 自定义供应商配置 - Kimi via DashScope
    custom: {
      endpoint: process.env.CUSTOM_ENDPOINT || 'https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages',
      headers: {
        'x-api-key': process.env.CUSTOM_API_KEY || 'sk-sp-991b70d4182e4608949442d262161dc2',
        'anthropic-version': '2023-06-01',
      },
      responsePath: process.env.CUSTOM_RESPONSE_PATH || 'content[1].text',
      embeddingEndpoint: process.env.CUSTOM_EMBEDDING_ENDPOINT,
      embeddingResponsePath: process.env.CUSTOM_EMBEDDING_RESPONSE_PATH || 'data[0].embedding',
    },
  },

  // 世界配置
  world: {
    width: parseInt(process.env.WORLD_WIDTH || '50'),
    height: parseInt(process.env.WORLD_HEIGHT || '50'),
    timeScale: parseInt(process.env.TIME_SCALE || '60'),
    tickIntervalMs: parseInt(process.env.TICK_INTERVAL_MS || '5000'),
    maxAgents: parseInt(process.env.MAX_AGENTS || '10'),
  },

  // 数据库配置
  database: {
    url: process.env.DATABASE_URL || './data/ai-town.db',
    chromaPath: process.env.CHROMA_DB_PATH || './data/chroma',
  },

  // 服务器配置
  server: {
    port: parseInt(process.env.PORT || '3000'),
    wsPort: parseInt(process.env.WS_PORT || '3001'),
  },
};

/**
 * 确保数据目录存在
 */
export function ensureDataDir(): void {
  const dataDir = resolve(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    console.log('✅ 创建数据目录:', dataDir);
  }
}

/**
 * 验证配置
 */
export function validateConfig(): boolean {
  const { llm } = appConfig;

  if (llm.provider === 'openai' && !llm.apiKey) {
    console.error('❌ 错误: 使用OpenAI需要提供 OPENAI_API_KEY');
    return false;
  }

  if (llm.provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    console.error('❌ 错误: 使用Claude需要提供 ANTHROPIC_API_KEY');
    return false;
  }

  if (llm.provider === 'custom') {
    if (!llm.custom?.endpoint) {
      console.error('❌ 错误: 使用自定义供应商需要提供 CUSTOM_ENDPOINT');
      return false;
    }
    if (!llm.apiKey) {
      console.error('❌ 错误: 使用自定义供应商需要提供 CUSTOM_API_KEY');
      return false;
    }
  }

  return true;
}
