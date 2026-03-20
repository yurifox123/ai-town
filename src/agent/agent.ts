import { LLMClient } from '../llm/client';
import { MemorySystem } from '../memory/memory-system';
import {
  AgentConfig,
  Position,
  Action,
  ActionType,
  Observation,
  Plan,
  PlanType,
  MemoryType,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generative Agent
 * 能够自主感知、记忆、规划和行动的AI代理
 */
export class Agent {
  readonly id: string;
  readonly name: string;
  readonly config: AgentConfig;

  // 子系统
  readonly memory: MemorySystem;
  private llm: LLMClient;

  // 状态
  private position: Position = { x: 0, y: 0 };
  private currentPlan?: Plan;
  private currentAction?: Action;
  private observations: Observation[] = [];
  private status: 'idle' | 'busy' | 'sleeping' = 'idle';

  // 社交状态
  private nearbyAgents: Set<string> = new Set();
  private lastConversation: Map<string, Date> = new Map();

  constructor(config: AgentConfig, llm: LLMClient) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
    this.llm = llm;
    this.memory = new MemorySystem(this.id, llm);
  }

  /**
   * 初始化Agent
   * 创建初始记忆和计划
   */
  async initialize(): Promise<void> {
    // 记录核心记忆
    await this.memory.addMemory(
      `我是${this.name}，${this.config.age}岁。${this.config.background}`,
      MemoryType.THOUGHT,
      10
    );

    await this.memory.addMemory(
      `我的性格：${this.config.traits}`,
      MemoryType.THOUGHT,
      9
    );

    for (const goal of this.config.goals) {
      await this.memory.addMemory(`我的目标：${goal}`, MemoryType.THOUGHT, 8);
    }

    // 创建今日计划
    await this.createDailyPlan();

    console.log(`[${this.name}] 初始化完成`);
  }

  /**
   * 感知环境
   */
  async perceive(observations: Observation[]): Promise<void> {
    for (const obs of observations) {
      this.observations.push(obs);

      // 过滤重要观察
      const importance = await this.assessImportance(obs.content);

      if (importance >= 3) {
        await this.memory.addMemory(obs.content, MemoryType.OBSERVATION, importance, {
          location: obs.location.area,
        });
      }

      // 检测附近Agent
      if (obs.source === 'agent' && obs.sourceId && obs.sourceId !== this.id) {
        this.nearbyAgents.add(obs.sourceId);
      }
    }

    // 只保留最近20条观察
    if (this.observations.length > 20) {
      this.observations = this.observations.slice(-20);
    }
  }

  /**
   * 决策并行动
   */
  async decide(context: { time: Date; location: string }): Promise<Action> {
    // 如果正在执行动作，继续完成
    if (this.status === 'busy' && this.currentAction) {
      return this.currentAction;
    }

    // 检查是否需要交互（附近有Agent）
    if (this.nearbyAgents.size > 0) {
      const shouldInteract = await this.decideInteraction();
      if (shouldInteract) {
        return this.initiateInteraction();
      }
    }

    // 执行计划中的下一个动作
    const action = await this.planNextAction(context);
    // 注意：不在这里设置 status 和 currentAction，由 executeAction 来设置

    return action;
  }

  /**
   * 执行动作
   */
  async executeAction(action: Action): Promise<void> {
    // 如果已经在执行这个动作，跳过（避免重复执行）
    if (this.status === 'busy' && this.currentAction && this.currentAction.id === action.id) {
      return;
    }

    // 如果正在执行其他动作，先结束它
    if (this.status === 'busy' && this.currentAction) {
      this.status = 'idle';
      this.currentAction = undefined;
    }

    // 记录动作到记忆
    await this.memory.addMemory(
      `我${action.description}`,
      MemoryType.ACTION,
      this.assessActionImportance(action)
    );

    // 更新位置
    if (action.targetPosition) {
      this.position = action.targetPosition;
    }

    // 设置状态为执行中
    this.status = 'busy';
    this.currentAction = action;

    // 模拟执行时间（将游戏时间转换为现实时间）
    // 游戏内30分钟 = 现实3秒
    const realDurationMs = Math.min((action.duration / 10) * 1000, 10000); // 最长10秒

    // 异步执行，不阻塞
    setTimeout(() => {
      // 动作完成
      if (this.currentAction?.id === action.id) {
        this.status = 'idle';
        this.currentAction = undefined;
      }
    }, realDurationMs);
  }

  /**
   * 响应对话
   */
  async respondToDialogue(
    otherAgentId: string,
    otherAgentName: string,
    message: string
  ): Promise<string> {
    // 检索相关记忆
    const relevantMemories = await this.memory.retrieveMemories(
      `${otherAgentName} ${message}`,
      5
    );

    const prompt = `
你是${this.name}。
性格：${this.config.traits}

相关记忆：
${relevantMemories.map((r) => `- ${r.memory.content}`).join('\n')}

${otherAgentName}对你说："${message}"

请用第一人称回复（简短自然，1-2句话）：`;

    const response = await this.llm.generate(prompt);

    // 记录对话
    await this.memory.addMemory(
      `${otherAgentName}说：${message}`,
      MemoryType.DIALOGUE,
      6,
      { participants: [otherAgentId] }
    );
    await this.memory.addMemory(
      `我回复${otherAgentName}：${response}`,
      MemoryType.DIALOGUE,
      6,
      { participants: [otherAgentId] }
    );

    this.lastConversation.set(otherAgentId, new Date());

    return response;
  }

  /**
   * 创建日计划
   */
  async createDailyPlan(): Promise<void> {
    const reflections = this.memory.getReflections().slice(0, 5);
    const recentMemories = this.memory.getRecentMemories(20);

    const prompt = `
你是${this.name}。
性格：${this.config.traits}
背景：${this.config.background}
目标：${this.config.goals.join('，')}

近期反思：
${reflections.map((r) => `- ${r.content}`).join('\n') || '无'}

近期活动：
${recentMemories.map((m) => `- ${m.content}`).join('\n')}

请制定今日详细计划（从当前时间开始，包含具体时间）。
考虑：日常作息、工作目标、社交需求、个人爱好。

返回JSON格式：
{
  "overview": "今日总体安排概述",
  "activities": [
    {"time": "08:00", "activity": "起床洗漱", "location": "家中", "duration": 30},
    {"time": "09:00", "activity": "去咖啡馆工作", "location": "咖啡馆", "duration": 120}
  ]
}`;

    try {
      const planData = await this.llm.generateJSON<{
        overview: string;
        activities: Array<{ time: string; activity: string; location: string; duration: number }>;
      }>(prompt, {
        type: 'object',
        properties: {
          overview: { type: 'string' },
          activities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                time: { type: 'string' },
                activity: { type: 'string' },
                location: { type: 'string' },
                duration: { type: 'number' },
              },
            },
          },
        },
      });

      // 记录计划到记忆
      await this.memory.addMemory(
        `今日计划：${planData.overview}`,
        MemoryType.THOUGHT,
        7
      );

      console.log(`[${this.name}] 制定今日计划: ${planData.overview}`);
    } catch (e) {
      console.error('创建计划失败:', e);
    }
  }

  /**
   * 获取当前状态
   */
  getState() {
    return {
      id: this.id,
      name: this.name,
      position: this.position,
      status: this.status,
      currentAction: this.currentAction,
      nearbyAgents: Array.from(this.nearbyAgents),
      memoryStats: this.memory.getStats(),
    };
  }

  /**
   * 设置位置
   */
  setPosition(pos: Position): void {
    this.position = pos;
  }

  /**
   * 获取位置
   */
  getPosition(): Position {
    return this.position;
  }

  // 私有方法

  private async planNextAction(context: {
    time: Date;
    location: string;
  }): Promise<Action> {
    const relevantMemories = await this.memory.retrieveMemories(
      `当前在${context.location}，${context.time.getHours()}:00 应该做什么`,
      5
    );

    const prompt = `
你是${this.name}。
当前时间：${context.time.toLocaleTimeString()}
当前位置：${context.location}
性格：${this.config.traits}

相关记忆：
${relevantMemories.map((r) => `- ${r.memory.content}`).join('\n')}

请决定下一步行动。

返回JSON格式：
{
  "action": "动作描述（第一人称）",
  "type": "move/interact/talk/think/wait",
  "targetLocation": "目标位置（可选）",
  "duration": 30
}`;

    try {
      const decision = await this.llm.generateJSON<{
        action: string;
        type: string;
        targetLocation?: string;
        duration: number;
      }>(prompt, {
        type: 'object',
        properties: {
          action: { type: 'string' },
          type: { type: 'string' },
          targetLocation: { type: 'string' },
          duration: { type: 'number' },
        },
      });

      return {
        id: uuidv4(),
        agentId: this.id,
        type: decision.type as ActionType,
        description: decision.action,
        duration: decision.duration,
        startTime: new Date(),
      };
    } catch (e) {
      // 默认动作
      return {
        id: uuidv4(),
        agentId: this.id,
        type: ActionType.WAIT,
        description: '正在思考接下来做什么',
        duration: 10,
      };
    }
  }

  private async decideInteraction(): Promise<boolean> {
    // 简单概率判断
    const lastInteract = Date.now() - (this.lastConversation.values().next().value?.getTime() || 0);
    if (lastInteract < 5 * 60 * 1000) return false; // 5分钟内不重复交互
    return Math.random() < 0.3; // 30%概率选择交互
  }

  private initiateInteraction(): Action {
    const targetId = Array.from(this.nearbyAgents)[0];
    return {
      id: uuidv4(),
      agentId: this.id,
      type: ActionType.TALK,
      description: `准备与某人交谈`,
      targetAgentId: targetId,
      duration: 15,
    };
  }

  private async assessImportance(content: string): Promise<number> {
    const prompt = `评估以下事件对一个人的重要性（1-10分，只返回数字）：\n${content}\n\n评分：`;
    try {
      const response = await this.llm.generate(prompt);
      const score = parseInt(response.trim());
      return isNaN(score) ? 5 : Math.max(1, Math.min(10, score));
    } catch {
      return 5;
    }
  }

  private assessActionImportance(action: Action): number {
    switch (action.type) {
      case ActionType.TALK:
        return 7;
      case ActionType.MOVE:
        return 3;
      case ActionType.INTERACT:
        return 6;
      case ActionType.THINK:
        return 5;
      default:
        return 4;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
