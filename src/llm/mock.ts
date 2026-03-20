import { LLMConfig, Memory } from '../types';

/**
 * Mock LLM客户端
 * 用于测试，无需真实API Key
 */
export class MockLLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = {
      temperature: 0.7,
      maxTokens: 1000,
      ...config,
    };
  }

  /**
   * 模拟生成文本
   */
  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    // 模拟网络延迟
    await this.sleep(100);

    // 根据提示词返回模拟回复
    if (prompt.includes('回复')) {
      return this.getRandomResponse();
    }
    if (prompt.includes('计划')) {
      return this.getMockPlan();
    }
    if (prompt.includes('行动')) {
      return this.getMockAction();
    }
    if (prompt.includes('重要性')) {
      return Math.floor(Math.random() * 5 + 3).toString();
    }

    return '好的，我明白了。';
  }

  /**
   * 模拟生成JSON
   */
  async generateJSON<T>(prompt: string, schema: object): Promise<T> {
    await this.sleep(100);

    if (prompt.includes('反思')) {
      return [
        {
          insight: '我发现自己喜欢在安静的环境中工作',
          importance: 7,
          relatedMemoryIndices: [0, 2],
        },
        {
          insight: '最近经常在咖啡馆遇到熟人',
          importance: 6,
          relatedMemoryIndices: [1, 3],
        },
      ] as unknown as T;
    }

    if (prompt.includes('计划')) {
      return {
        overview: '今天是充实的一天，计划去咖啡馆工作并和朋友见面',
        activities: [
          { time: '08:00', activity: '起床洗漱', location: '家中', duration: 30 },
          { time: '09:00', activity: '去咖啡馆工作', location: '咖啡馆', duration: 120 },
          { time: '12:00', activity: '吃午饭', location: '餐厅', duration: 45 },
          { time: '14:00', activity: '在公园散步', location: '公园', duration: 60 },
          { time: '18:00', activity: '回家休息', location: '家中', duration: 180 },
        ],
      } as unknown as T;
    }

    if (prompt.includes('行动')) {
      return {
        action: '走向咖啡馆准备开始工作',
        type: 'move',
        targetLocation: '咖啡馆',
        duration: 15,
      } as unknown as T;
    }

    return {} as T;
  }

  /**
   * 模拟获取embedding
   */
  async getEmbedding(text: string): Promise<number[]> {
    // 返回固定长度的随机向量（实际应用中应使用真实embedding）
    return new Array(1536).fill(0).map(() => Math.random() - 0.5);
  }

  private getRandomResponse(): string {
    const responses = [
      '嗨！好久不见，最近怎么样？',
      '哈哈，确实是这样！',
      '我也在想去那里呢。',
      '听起来不错，有机会一起！',
      '最近在忙一个新项目，挺有意思的。',
      '天气真好，适合出去走走。',
      '你呢？今天有什么计划？',
      '我也喜欢那个咖啡馆的氛围。',
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private getMockPlan(): string {
    const plans = [
      '今天想去咖啡馆工作，然后下午去公园散步。',
      '计划在家看书，下午可能去商店买点东西。',
      '打算去健身房锻炼，然后和朋友吃饭。',
      '今天要在家里完成一些工作任务。',
    ];
    return plans[Math.floor(Math.random() * plans.length)];
  }

  private getMockAction(): string {
    const actions = [
      '正在走向咖啡馆',
      '坐在公园长椅上休息',
      '在家里看书',
      '在商店挑选商品',
      '和朋友聊天',
      '在街道上散步',
    ];
    return actions[Math.floor(Math.random() * actions.length)];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 导出Mock客户端作为LLMClient的替代
export const MockLLM = MockLLMClient;
