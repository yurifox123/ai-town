/**
 * 记忆系统（前端版本）
 * 管理Agent的记忆流、检索和反思
 */
class MemorySystem {
  constructor(agentId, llmClient) {
    this.memories = new Map();
    this.reflections = new Map();
    this.agentId = agentId;
    this.llm = llmClient;

    // 配置参数
    this.REFLECTION_THRESHOLD = 100;
    this.IMPORTANCE_THRESHOLD = 5;
    this.EMBEDDING_DIMENSION = 1536;
  }

  /**
   * 添加记忆
   */
  async addMemory(content, type, importance = 5, metadata = null) {
    // 生成向量嵌入
    let embedding;
    try {
      embedding = await this.llm.getEmbedding(content);
    } catch (e) {
      console.warn('获取嵌入失败，使用随机向量:', e);
    }

    // 如果嵌入为null，生成随机向量
    if (!embedding) {
      embedding = this.llm.generateRandomEmbedding();
    }

    const memory = {
      id: this.generateId(),
      agentId: this.agentId,
      content,
      timestamp: new Date(),
      importance,
      type,
      embedding,
      lastAccessed: new Date(),
      accessCount: 0,
      metadata
    };

    this.memories.set(memory.id, memory);

    // 检查是否需要触发反思
    await this.checkAndTriggerReflection();

    return memory;
  }

  /**
   * 检索相关记忆
   */
  async retrieveMemories(query, limit = 10, filter = null) {
    let queryEmbedding;
    try {
      queryEmbedding = await this.llm.getEmbedding(query);
    } catch (e) {
      console.warn('获取查询嵌入失败:', e);
    }

    // 如果嵌入为null，生成随机向量
    if (!queryEmbedding) {
      queryEmbedding = this.llm.generateRandomEmbedding();
    }

    let memories = Array.from(this.memories.values());

    // 应用过滤
    if (filter?.type) {
      memories = memories.filter(m => m.type === filter.type);
    }
    if (filter?.minImportance) {
      memories = memories.filter(m => m.importance >= filter.minImportance);
    }

    // 计算得分并排序
    const results = memories.map(memory => {
      const relevance = this.llm.cosineSimilarity(queryEmbedding, memory.embedding);
      const recency = this.calculateRecency(memory);
      const normalizedImportance = memory.importance / 10;

      // 加权得分
      const score = relevance * 0.6 + recency * 0.2 + normalizedImportance * 0.2;

      return { memory, score, relevance, recency, importance: normalizedImportance };
    });

    // 按得分排序并返回前N个
    results.sort((a, b) => b.score - a.score);

    // 更新访问记录
    for (const result of results.slice(0, limit)) {
      result.memory.lastAccessed = new Date();
      result.memory.accessCount++;
    }

    return results.slice(0, limit);
  }

  /**
   * 计算时效性分数
   */
  calculateRecency(memory) {
    const hoursSince = (new Date() - new Date(memory.timestamp)) / (1000 * 60 * 60);
    // 指数衰减
    return Math.exp(-hoursSince / 24);
  }

  /**
   * 检查并触发反思
   */
  async checkAndTriggerReflection() {
    if (this.memories.size >= this.REFLECTION_THRESHOLD &&
        this.memories.size % 50 === 0) {
      await this.generateReflection();
    }
  }

  /**
   * 生成反思
   */
  async generateReflection() {
    // 获取高重要性记忆
    const importantMemories = Array.from(this.memories.values())
      .filter(m => m.importance >= this.IMPORTANCE_THRESHOLD)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 20);

    if (importantMemories.length < 5) return;

    const memoryTexts = importantMemories.map(m => m.content).join('\n');

    const prompt = `基于以下记忆，总结这个人的高层次洞察和模式：

${memoryTexts}

请用一句话总结一个关键的洞察。`;

    try {
      const insight = await this.llm.chat([
        { role: 'system', content: '你是一个擅长总结和发现模式的助手。' },
        { role: 'user', content: prompt }
      ]);

      const reflection = {
        id: this.generateId(),
        agentId: this.agentId,
        content: insight,
        timestamp: new Date(),
        sourceMemories: importantMemories.map(m => m.id),
        insight: true
      };

      this.reflections.set(reflection.id, reflection);

      // 将反思也作为记忆添加
      await this.addMemory(
        `反思: ${insight}`,
        'REFLECTION',
        8,
        { reflectionId: reflection.id }
      );
    } catch (e) {
      console.error('生成反思失败:', e);
    }
  }

  /**
   * 获取最近记忆
   */
  getRecentMemories(limit = 10) {
    const memories = Array.from(this.memories.values());
    memories.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return memories.slice(0, limit);
  }

  /**
   * 导出数据（用于保存）
   */
  exportData() {
    return {
      memories: Array.from(this.memories.values()),
      reflections: Array.from(this.reflections.values())
    };
  }

  /**
   * 导入数据
   */
  importData(data) {
    this.memories.clear();
    this.reflections.clear();

    if (data.memories) {
      for (const memory of data.memories) {
        this.memories.set(memory.id, memory);
      }
    }

    if (data.reflections) {
      for (const reflection of data.reflections) {
        this.reflections.set(reflection.id, reflection);
      }
    }
  }

  /**
   * 生成唯一ID
   */
  generateId() {
    return 'mem_' + Math.random().toString(36).substr(2, 9);
  }
}

export default MemorySystem;
