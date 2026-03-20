import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { LLMConfig } from '../types';

/**
 * LLM客户端封装
 * 支持 OpenAI、Claude、Ollama
 */
export class LLMClient {
  private config: LLMConfig;
  private openai?: OpenAI;
  private anthropic?: Anthropic;

  constructor(config: LLMConfig) {
    this.config = {
      temperature: 0.7,
      maxTokens: 1000,
      ...config,
    };

    this.initClient();
  }

  private initClient(): void {
    switch (this.config.provider) {
      case 'openai':
        this.openai = new OpenAI({
          apiKey: this.config.apiKey || process.env.OPENAI_API_KEY,
        });
        break;
      case 'anthropic':
        this.anthropic = new Anthropic({
          apiKey: this.config.apiKey || process.env.ANTHROPIC_API_KEY,
        });
        break;
      case 'ollama':
        // Ollama 使用 fetch API 调用
        break;
      case 'custom':
        // 自定义供应商，不需要特殊初始化
        if (!this.config.custom?.endpoint) {
          throw new Error('自定义供应商需要提供 endpoint 配置');
        }
        break;
    }
  }

  /**
   * 生成文本
   */
  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    switch (this.config.provider) {
      case 'openai':
        return this.generateOpenAI(prompt, systemPrompt);
      case 'anthropic':
        return this.generateAnthropic(prompt, systemPrompt);
      case 'ollama':
        return this.generateOllama(prompt, systemPrompt);
      case 'custom':
        return this.generateCustom(prompt, systemPrompt);
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }

  /**
   * 生成JSON（带schema约束）
   */
  async generateJSON<T>(
    prompt: string,
    schema: object,
    systemPrompt?: string
  ): Promise<T> {
    const jsonPrompt = `${prompt}

请严格按照以下JSON格式返回，不要包含其他文字：
${JSON.stringify(schema, null, 2)}`;

    const response = await this.generate(jsonPrompt, systemPrompt);

    try {
      // 清理可能的Markdown代码块
      const cleanJson = response.replace(/```json\n?|```\n?/g, '').trim();
      return JSON.parse(cleanJson) as T;
    } catch (e) {
      console.error('JSON解析失败:', response);
      throw new Error(`Failed to parse JSON response: ${e}`);
    }
  }

  /**
   * 获取文本嵌入向量
   */
  async getEmbedding(text: string): Promise<number[]> {
    if (this.config.provider === 'openai') {
      const response = await this.openai!.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    }

    if (this.config.provider === 'custom' && this.config.custom?.embeddingEndpoint) {
      return this.getEmbeddingCustom(text);
    }

    // 其他Provider使用简化版（或可以集成其他embedding服务）
    // 这里返回一个模拟向量，生产环境应使用真实embedding
    console.warn('使用模拟embedding，生产环境请接入真实服务');
    return new Array(1536).fill(0).map(() => Math.random() - 0.5);
  }

  private async generateOpenAI(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.openai!.chat.completions.create({
      model: this.config.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    });

    return response.choices[0].message.content || '';
  }

  private async generateAnthropic(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await this.anthropic!.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens!,
      temperature: this.config.temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    return content.type === 'text' ? content.text : '';
  }

  private async generateOllama(prompt: string, systemPrompt?: string): Promise<string> {
    const url = this.config.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434';

    const response = await fetch(`${url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  }

  /**
   * 自定义供应商 - 生成文本
   */
  private async generateCustom(prompt: string, systemPrompt?: string): Promise<string> {
    const customConfig = this.config.custom!;

    // 构建请求体（兼容 OpenAI 格式）
    const requestBody: any = {
      model: this.config.model,
      messages: [],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    if (systemPrompt) {
      requestBody.messages.push({ role: 'system', content: systemPrompt });
    }
    requestBody.messages.push({ role: 'user', content: prompt });

    // 发送请求
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.config.apiKey && !customConfig.headers?.['x-api-key'] && { Authorization: `Bearer ${this.config.apiKey}` }),
      ...(customConfig.headers || {}),
    };

    const response = await fetch(customConfig.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Custom provider request failed: ${response.statusText}`);
    }

    const data = await response.json();

    // 根据配置的响应路径提取内容
    const responsePath = customConfig.responsePath || 'choices[0].message.content';
    return this.extractFromPath(data, responsePath) || '';
  }

  /**
   * 自定义供应商 - 获取Embedding
   */
  private async getEmbeddingCustom(text: string): Promise<number[]> {
    const customConfig = this.config.custom!;
    const endpoint = customConfig.embeddingEndpoint!;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        ...(customConfig.headers || {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Custom embedding request failed: ${response.statusText}`);
    }

    const data = await response.json();

    // 根据配置的响应路径提取embedding
    const responsePath = customConfig.embeddingResponsePath || 'data[0].embedding';
    const embedding = this.extractFromPath(data, responsePath);

    if (!Array.isArray(embedding)) {
      throw new Error('Invalid embedding response format');
    }

    return embedding;
  }

  /**
   * 从对象路径提取值
   * 支持：data[0].message.content 或 data.items[0].text
   */
  private extractFromPath(obj: any, path: string): any {
    const parts = path.split(/\.|\[|\]/).filter(Boolean);
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }
}

// 单例实例
let defaultClient: LLMClient | null = null;

export function getLLMClient(config?: LLMConfig): LLMClient {
  if (!defaultClient && config) {
    defaultClient = new LLMClient(config);
  }
  if (!defaultClient) {
    throw new Error('LLM client not initialized');
  }
  return defaultClient;
}
