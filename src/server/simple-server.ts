/**
 * 简化服务器
 * 只提供静态文件和LLM代理API
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3061;

// LLM配置
const llmConfig = {
  provider: process.env.LLM_PROVIDER || 'custom',
  model: process.env.CUSTOM_MODEL || 'kimi-k2.5',
  apiKey: process.env.CUSTOM_API_KEY,
  endpoint: process.env.CUSTOM_ENDPOINT || 'https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages',
  responsePath: process.env.CUSTOM_RESPONSE_PATH || 'content[1].text'
};

/**
 * 从对象中提取嵌套路径的值
 */
function getValueByPath(obj, path) {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let value = obj;
  for (const key of keys) {
    if (value === null || value === undefined) return undefined;
    value = value[key];
  }
  return value;
}

/**
 * 调用LLM API
 */
async function callLLM(messages, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': llmConfig.apiKey,
    'anthropic-version': '2023-06-01'
  };

  const body = {
    model: llmConfig.model,
    max_tokens: options.maxTokens || 1000,
    temperature: options.temperature || 0.7,
    messages
  };

  if (options.system) {
    body.system = options.system;
  }

  const response = await fetch(llmConfig.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API错误: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = getValueByPath(data, llmConfig.responsePath);

  return { content, raw: data };
}

/**
 * 获取嵌入向量
 */
async function getEmbedding(text) {
  // 如果有自定义嵌入端点，使用它
  if (process.env.CUSTOM_EMBEDDING_ENDPOINT) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${llmConfig.apiKey}`
    };

    const response = await fetch(process.env.CUSTOM_EMBEDDING_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input: text, model: 'text-embedding-3-small' })
    });

    if (!response.ok) {
      throw new Error(`Embedding API错误: ${response.status}`);
    }

    const data = await response.json();
    const embeddingPath = process.env.CUSTOM_EMBEDDING_RESPONSE_PATH || 'data[0].embedding';
    return getValueByPath(data, embeddingPath);
  }

  // 否则返回null，让前端使用随机向量
  return null;
}

/**
 * 处理请求
 */
async function handleRequest(req, res) {
  const url = req.url;

  // API路由
  if (url.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');

    if (url === '/api/llm/chat' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const { messages, options } = JSON.parse(body);
        // 支持新的请求格式（system从options中提取）
        const result = await callLLM(messages, options || {});
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (e) {
        console.error('LLM Chat Error:', e);
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (url === '/api/llm/embedding' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const { text } = JSON.parse(body);
        const embedding = await getEmbedding(text);
        res.writeHead(200);
        res.end(JSON.stringify({ embedding }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // 停止服务器
    if (url === '/api/stop' && req.method === 'POST') {
      res.writeHead(200);
      res.end(JSON.stringify({ message: '服务器正在关闭...' }));
      console.log('\n👋 收到停止请求，正在关闭服务器...');
      setTimeout(() => {
        process.exit(0);
      }, 500);
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }

  // 静态文件
  const filePath = url === '/' ? '/index.html' : url;
  const fullPath = path.join(__dirname, '..', '..', 'public', filePath);

  // 安全检查
  const resolvedPath = path.resolve(fullPath);
  const publicPath = path.resolve(path.join(__dirname, '..', '..', 'public'));
  if (!resolvedPath.startsWith(publicPath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const data = await fs.promises.readFile(fullPath);
    const ext = path.extname(fullPath);
    const contentType = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon'
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }
}

/**
 * 读取请求体
 */
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * 主函数
 */
async function main() {
  // 检查配置
  if (!llmConfig.apiKey) {
    console.error('❌ 错误: 未配置 LLM API Key');
    console.log('请设置 CUSTOM_API_KEY 环境变量');
    process.exit(1);
  }

  // 创建服务器
  const server = http.createServer(handleRequest);

  server.listen(PORT, () => {
    console.log('\n🌐 AI生态小镇服务器已启动');
    console.log(`   访问地址: http://localhost:${PORT}`);
    console.log(`   LLM模型: ${llmConfig.model}`);
    console.log('');
  });

  // 优雅关闭
  process.on('SIGINT', () => {
    console.log('\n👋 正在关闭服务器...');
    server.close(() => {
      process.exit(0);
    });
  });
}

main().catch(console.error);
