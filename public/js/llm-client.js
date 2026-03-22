/**
 * LLM客户端（前端版本）
 * 通过后端代理调用LLM API，保护API密钥
 */
class LLMClient {
  constructor() {
    this.baseUrl = '/api/llm';
  }

  /**
   * 发送聊天请求
   */
  async chat(messages, options = {}) {
    // 提取system消息（Kimi API要求system放在顶层）
    let systemMessage = null;
    const filteredMessages = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessage = msg.content;
      } else {
        filteredMessages.push(msg);
      }
    }

    const requestBody = {
      messages: filteredMessages,
      options: {
        ...options,
        system: systemMessage || options.system
      }
    };

    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`LLM请求失败: ${response.status}`);
    }

    const data = await response.json();
    return data.content;
  }

  /**
   * 获取文本的嵌入向量
   */
  async getEmbedding(text) {
    const response = await fetch(`${this.baseUrl}/embedding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      // 如果后端不支持嵌入，返回随机向量作为fallback
      console.warn('嵌入API不可用，使用随机向量');
      return this.generateRandomEmbedding();
    }

    const data = await response.json();
    return data.embedding;
  }

  /**
   * 生成随机嵌入向量（fallback）
   */
  generateRandomEmbedding() {
    // 生成1536维的随机向量
    const vec = [];
    for (let i = 0; i < 1536; i++) {
      vec.push((Math.random() - 0.5) * 2);
    }
    // 归一化
    const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map(v => v / magnitude);
  }

  /**
   * 计算余弦相似度
   */
  cosineSimilarity(a, b) {
    // 处理 null/undefined 情况
    if (!a || !b || !Array.isArray(a) || !Array.isArray(b)) {
      return 0.5; // 返回中性相似度
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  }
}

export default LLMClient;
