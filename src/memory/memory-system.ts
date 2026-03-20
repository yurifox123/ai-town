import { Memory, MemoryType, Reflection, RetrievalResult } from '../types';
import { LLMClient } from '../llm/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * 记忆系统
 * 管理Agent的记忆流、检索和反思
 */
export class MemorySystem {
  private memories: Map<string, Memory> = new Map();
  private reflections: Map<string, Reflection> = new Map();
  private agentId: string;
  private llm: LLMClient;

  // 配置参数
  private readonly REFLECTION_THRESHOLD = 100;  // 触发反思的记忆数量阈值
  private readonly IMPORTANCE_THRESHOLD = 5;     // 重要记忆阈值
  private readonly EMBEDDING_DIMENSION = 1536;

  constructor(agentId: string, llm: LLMClient) {
    this.agentId = agentId;
    this.llm = llm;
  }

  /**
   * 添加记忆
   */
  async addMemory(
    content: string,
    type: MemoryType,
    importance: number = 5,
    metadata?: Memory['metadata']
  ): Promise<Memory> {
    // 生成向量嵌入
    const embedding = await this.llm.getEmbedding(content);

    const memory: Memory = {
      id: uuidv4(),
      agentId: this.agentId,
      content,
      timestamp: new Date(),
      importance,
      type,
      embedding,
      lastAccessed: new Date(),
      accessCount: 0,
      metadata,
    };

    this.memories.set(memory.id, memory);

    // 检查是否需要触发反思
    await this.checkAndTriggerReflection();

    return memory;
  }

  /**
   * 检索相关记忆
   * 使用相关性 + 时效性 + 重要性三维度加权
   */
  async retrieveMemories(
    query: string,
    limit: number = 10,
    filter?: { type?: MemoryType; minImportance?: number }
  ): Promise<RetrievalResult[]> {
    const queryEmbedding = await this.llm.getEmbedding(query);

    let memories = Array.from(this.memories.values());

    // 应用过滤
    if (filter?.type) {
      memories = memories.filter((m) => m.type === filter.type);
    }
    if (filter?.minImportance) {
      memories = memories.filter((m) => m.importance >= filter.minImportance!);
    }

    // 计算得分并排序
    const results: RetrievalResult[] = memories.map((memory) => {
      const relevance = this.cosineSimilarity(queryEmbedding, memory.embedding!);
      const recency = this.calculateRecency(memory.lastAccessed);
      const importance = memory.importance / 10; // 归一化到0-1

      // 综合得分（可调权重）
      const score = relevance * 0.6 + recency * 0.2 + importance * 0.2;

      // 更新访问统计
      memory.lastAccessed = new Date();
      memory.accessCount++;

      return {
        memory,
        score,
        relevance,
        recency,
        importance: memory.importance,
      };
    });

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * 获取最近记忆
   */
  getRecentMemories(count: number = 10): Memory[] {
    return Array.from(this.memories.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, count);
  }

  /**
   * 获取重要记忆
   */
  getImportantMemories(threshold: number = this.IMPORTANCE_THRESHOLD): Memory[] {
    return Array.from(this.memories.values())
      .filter((m) => m.importance >= threshold)
      .sort((a, b) => b.importance - a.importance);
  }

  /**
   * 生成反思
   * 将低层记忆聚合成高维洞察
   */
  async generateReflection(): Promise<Reflection[]> {
    const recentMemories = this.getRecentMemories(this.REFLECTION_THRESHOLD);

    if (recentMemories.length < 10) {
      console.log(`[${this.agentId}] 记忆不足，跳过反思`);
      return [];
    }

    const memoryTexts = recentMemories.map((m) => `- ${m.content}`).join('\n');

    const prompt = `
基于以下最近记忆，总结3-5个高层次洞察（反思）。
这些洞察应该捕捉行为模式、偏好、人际关系或目标。

记忆：
${memoryTexts}

请返回JSON数组格式：
[
  {
    "insight": "反思内容",
    "importance": 8,
    "relatedMemoryIndices": [0, 3, 5]
  }
]`;

    try {
      const response = await this.llm.generateJSON<
        { insight: string; importance: number; relatedMemoryIndices: number[] }[]
      >(prompt, {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            insight: { type: 'string' },
            importance: { type: 'number', minimum: 1, maximum: 10 },
            relatedMemoryIndices: {
              type: 'array',
              items: { type: 'number' },
            },
          },
        },
      });

      const newReflections: Reflection[] = [];

      for (const item of response) {
        const reflection: Reflection = {
          id: uuidv4(),
          agentId: this.agentId,
          content: item.insight,
          timestamp: new Date(),
          importance: item.importance,
          sourceMemoryIds: item.relatedMemoryIndices.map(
            (i) => recentMemories[i]?.id
          ).filter(Boolean),
          reflectionDepth: 1,
        };

        this.reflections.set(reflection.id, reflection);
        newReflections.push(reflection);

        // 同时将反思加入记忆流
        await this.addMemory(
          `反思：${item.insight}`,
          MemoryType.REFLECTION,
          item.importance
        );
      }

      console.log(
        `[${this.agentId}] 生成 ${newReflections.length} 条反思`
      );
      return newReflections;
    } catch (e) {
      console.error('生成反思失败:', e);
      return [];
    }
  }

  /**
   * 获取所有反思
   */
  getReflections(): Reflection[] {
    return Array.from(this.reflections.values()).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalMemories: number;
    totalReflections: number;
    byType: Record<MemoryType, number>;
  } {
    const byType = {} as Record<MemoryType, number>;
    for (const memory of this.memories.values()) {
      byType[memory.type] = (byType[memory.type] || 0) + 1;
    }

    return {
      totalMemories: this.memories.size,
      totalReflections: this.reflections.size,
      byType,
    };
  }

  /**
   * 导出数据
   */
  exportData(): { memories: Memory[]; reflections: Reflection[] } {
    return {
      memories: Array.from(this.memories.values()),
      reflections: Array.from(this.reflections.values()),
    };
  }

  /**
   * 导入数据
   */
  importData(data: { memories: Memory[]; reflections: Reflection[] }): void {
    for (const memory of data.memories) {
      // 转换日期字符串为 Date 对象
      const fixedMemory: Memory = {
        ...memory,
        timestamp: new Date(memory.timestamp),
        lastAccessed: new Date(memory.lastAccessed),
      };
      this.memories.set(memory.id, fixedMemory);
    }
    for (const reflection of data.reflections) {
      // 转换日期字符串为 Date 对象
      const fixedReflection: Reflection = {
        ...reflection,
        timestamp: new Date(reflection.timestamp),
      };
      this.reflections.set(reflection.id, fixedReflection);
    }
  }

  // 私有方法

  private async checkAndTriggerReflection(): Promise<void> {
    const recentCount = this.getRecentMemories(this.REFLECTION_THRESHOLD).length;
    if (recentCount >= this.REFLECTION_THRESHOLD) {
      // 随机概率触发，避免所有Agent同时反思
      if (Math.random() < 0.3) {
        await this.generateReflection();
      }
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private calculateRecency(lastAccessed: Date | string): number {
    const now = new Date().getTime();
    // 处理字符串或Date对象
    const accessed = typeof lastAccessed === 'string' ? new Date(lastAccessed).getTime() : lastAccessed.getTime();
    const hoursPassed = (now - accessed) / (1000 * 60 * 60);

    // 指数衰减：最近1小时=1.0，24小时=0.5，7天=0.1
    return Math.exp(-hoursPassed / 24);
  }
}
