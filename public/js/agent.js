/**
 * Agent类（前端版本）
 * 能够自主感知、记忆、规划和行动的AI代理
 */
import MemorySystem from './memory.js';

class Agent {
  constructor(config, llmClient) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
    this.memory = new MemorySystem(config.id, llmClient);
    this.llm = llmClient;

    // 状态
    this.position = { x: 0, y: 0 };
    this.moveTarget = null; // 移动目标位置（逐格移动）
    this.currentPlan = null;
    this.currentAction = null;
    this.observations = [];
    this.status = 'idle';

    // 社交状态
    this.nearbyAgents = new Set();
    this.lastConversation = new Map();

    // 记忆类型
    this.MemoryType = {
      OBSERVATION: 'OBSERVATION',
      THOUGHT: 'THOUGHT',
      ACTION: 'ACTION',
      REFLECTION: 'REFLECTION',
      DIALOGUE: 'DIALOGUE'
    };

    // 行动类型
    this.ActionType = {
      MOVE: 'MOVE',
      INTERACT: 'INTERACT',
      TALK: 'TALK',
      THINK: 'THINK',
      WAIT: 'WAIT',
      SLEEP: 'SLEEP'
    };
  }

  /**
   * 初始化Agent
   */
  async initialize() {
    // 记录核心记忆
    await this.memory.addMemory(
      `我是${this.name}，${this.config.age}岁。${this.config.background}`,
      this.MemoryType.THOUGHT,
      10
    );

    await this.memory.addMemory(
      `我的性格：${this.config.traits}`,
      this.MemoryType.THOUGHT,
      9
    );

    for (const goal of this.config.goals) {
      await this.memory.addMemory(`我的目标：${goal}`, this.MemoryType.THOUGHT, 8);
    }

    // 创建今日计划
    await this.createDailyPlan();
  }

  /**
   * 感知环境
   */
  async perceive(observations) {
    for (const obs of observations) {
      this.observations.push(obs);

      // 记录到记忆
      let importance = 5;
      if (obs.type === 'agent') importance = 7;
      if (obs.type === 'event') importance = 8;

      await this.memory.addMemory(
        `观察到: ${obs.description}`,
        this.MemoryType.OBSERVATION,
        importance,
        { position: obs.position, type: obs.type }
      );
    }
  }

  /**
   * 决策下一步行动
   */
  async decide(worldState) {
    // 获取相关记忆
    const contextQuery = `当前情况: 我在(${this.position.x}, ${this.position.y})，${this.getTimeContext(worldState.time)}`;
    const relevantMemories = await this.memory.retrieveMemories(contextQuery, 10);

    // 获取世界中的地点
    const locations = [];
    for (const obj of worldState.objects.values()) {
      locations.push(`${obj.name}(${obj.position.x},${obj.position.y})`);
    }

    // 构建决策提示
    const memoryContext = relevantMemories.map(r => r.memory.content).join('\n');
    const prompt = `你是${this.name}，${this.config.age}岁。
性格: ${this.config.traits}

你的记忆:
${memoryContext}

当前情况:
- 位置: (${this.position.x}, ${this.position.y})
- 时间: ${worldState.time.toLocaleString()}
- 状态: ${this.status}
- 附近: ${this.getNearbyDescription()}

世界中的地点: ${locations.join(', ')}

请决定你接下来要做什么。用JSON格式输出你的决定：
{
  "action": "MOVE|TALK|WAIT|SLEEP",
  "description": "行动描述",
  "targetX": 目标x坐标(如果是移动),
  "targetY": 目标y坐标(如果是移动)
}

如果没有特定目标位置，可以随机移动到附近位置。`;

    try {
      console.log(`[${this.name}] 正在请求LLM决策...`);
      const response = await this.llm.chat([
        { role: 'system', content: `你是${this.name}，一个生活在AI小镇的居民。请根据你的性格和记忆做出自然的行为决定。只输出JSON，不要其他解释。` },
        { role: 'user', content: prompt }
      ]);
      console.log(`[${this.name}] LLM响应:`, response);

      // 解析JSON响应
      let decision;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          decision = JSON.parse(jsonMatch[0]);
        } else {
          decision = JSON.parse(response);
        }
        console.log(`[${this.name}] 解析的决策:`, decision);
      } catch (e) {
        // 如果解析失败，使用默认行为
        console.warn(`[${this.name}] 解析决策失败，使用默认:`, response);
        decision = { action: 'WAIT', description: response.trim() };
      }

      // 根据决策类型构建行动
      const actionType = decision.action?.toUpperCase() || 'WAIT';

      if (actionType === 'MOVE' && decision.targetX !== undefined && decision.targetY !== undefined) {
        return {
          type: this.ActionType.MOVE,
          description: decision.description || `移动到(${decision.targetX}, ${decision.targetY})`,
          targetPosition: { x: decision.targetX, y: decision.targetY },
          timestamp: new Date()
        };
      } else if (actionType === 'TALK') {
        return {
          type: this.ActionType.TALK,
          description: decision.description || '与人交谈',
          timestamp: new Date()
        };
      } else if (actionType === 'SLEEP') {
        return {
          type: this.ActionType.SLEEP,
          description: decision.description || '休息',
          timestamp: new Date()
        };
      } else {
        return {
          type: this.ActionType.WAIT,
          description: decision.description || '等待',
          timestamp: new Date()
        };
      }
    } catch (e) {
      console.error('决策失败:', e);
      return {
        type: this.ActionType.WAIT,
        description: '正在思考...',
        timestamp: new Date()
      };
    }
  }

  /**
   * 执行行动
   */
  async executeAction(action, world) {
    // 确保 action 是对象格式
    if (typeof action === 'string') {
      this.currentAction = { description: action, timestamp: new Date() };
    } else {
      this.currentAction = action;
    }
    this.status = 'busy';

    // 记录行动到记忆
    const actionDesc = typeof action === 'object' ? action.description : action;
    await this.memory.addMemory(
      `我决定: ${actionDesc}`,
      this.MemoryType.ACTION,
      6
    );

    // 根据行动类型执行
    switch (action.type) {
      case this.ActionType.MOVE:
        if (action.targetPosition) {
          // 存储移动目标，而不是立即移动
          this.moveTarget = { ...action.targetPosition };
          console.log(`[${this.name}] 设定移动目标: (${this.position.x},${this.position.y}) -> (${this.moveTarget.x},${this.moveTarget.y})`);
          // 执行一步移动
          this.moveOneStep();
        }
        break;

      case this.ActionType.TALK:
        if (action.targetAgent) {
          await this.converseWith(action.targetAgent, world);
        }
        break;

      case this.ActionType.SLEEP:
        this.status = 'sleeping';
        break;
    }

    return action;
  }

  /**
   * 逐格移动一步
   * 如果还有移动目标，向目标移动一格
   * @returns {boolean} 是否还有剩余移动
   */
  moveOneStep() {
    if (!this.moveTarget) return false;

    const dx = this.moveTarget.x - this.position.x;
    const dy = this.moveTarget.y - this.position.y;

    // 检查是否已到达目标
    if (dx === 0 && dy === 0) {
      console.log(`[${this.name}] 已到达目标位置`);
      this.moveTarget = null;
      this.status = 'idle';
      return false;
    }

    // 决定移动方向（先水平后垂直，或随机选择）
    let moveX = 0;
    let moveY = 0;

    if (dx !== 0 && dy !== 0) {
      // 两个方向都有距离，随机选择先移动哪个方向
      if (Math.random() < 0.5) {
        moveX = dx > 0 ? 1 : -1;
      } else {
        moveY = dy > 0 ? 1 : -1;
      }
    } else if (dx !== 0) {
      // 只水平移动
      moveX = dx > 0 ? 1 : -1;
    } else if (dy !== 0) {
      // 只垂直移动
      moveY = dy > 0 ? 1 : -1;
    }

    // 执行移动
    const oldPos = { ...this.position };
    this.position.x += moveX;
    this.position.y += moveY;

    const distance = Math.abs(dx) + Math.abs(dy);
    console.log(`[${this.name}] 移动: (${oldPos.x},${oldPos.y}) -> (${this.position.x},${this.position.y})，剩余距离: ${distance - 1}`);

    // 记录移动记忆
    this.memory.addMemory(
      `我移动到了位置(${this.position.x}, ${this.position.y})`,
      this.MemoryType.ACTION,
      5
    );

    // 检查是否到达目标
    if (this.position.x === this.moveTarget.x && this.position.y === this.moveTarget.y) {
      console.log(`[${this.name}] 已到达目标位置 (${this.moveTarget.x},${this.moveTarget.y})`);
      this.moveTarget = null;
      this.status = 'idle';
      return false;
    }

    // 还有剩余移动
    this.status = 'moving';
    return true;
  }

  /**
   * 检查是否正在移动中
   */
  isMoving() {
    return this.moveTarget !== null;
  }

  /**
   * 与其他Agent对话
   */
  async converseWith(otherAgent, world) {
    const conversationKey = [this.id, otherAgent.id].sort().join('-');
    const lastTalk = this.lastConversation.get(conversationKey);

    // 避免过于频繁的对话
    if (lastTalk && (Date.now() - lastTalk.getTime()) < 5 * 60 * 1000) {
      return;
    }

    // 获取相关记忆
    const query = `关于${otherAgent.name}`;
    const myMemories = await this.memory.retrieveMemories(query, 5);

    // 简单的对话生成
    const prompt = `${this.name}对${otherAgent.name}说:`;

    try {
      const response = await this.llm.chat([
        { role: 'system', content: `你是${this.name}，${this.config.traits}` },
        { role: 'user', content: prompt }
      ]);

      // 记录对话
      await this.memory.addMemory(
        `我对${otherAgent.name}说: ${response}`,
        this.MemoryType.DIALOGUE,
        7,
        { targetAgent: otherAgent.id }
      );

      // 更新最后对话时间
      this.lastConversation.set(conversationKey, new Date());
      otherAgent.lastConversation.set(conversationKey, new Date());

      return response;
    } catch (e) {
      console.error('对话失败:', e);
    }
  }

  /**
   * 创建每日计划
   */
  async createDailyPlan() {
    const prompt = `作为${this.name}（${this.config.traits}），你今天的计划是什么？请列出3-5个主要活动。`;

    try {
      const plan = await this.llm.chat([
        { role: 'system', content: `你是${this.name}` },
        { role: 'user', content: prompt }
      ]);

      this.currentPlan = {
        content: plan,
        created: new Date(),
        type: 'DAILY'
      };

      await this.memory.addMemory(
        `今日计划: ${plan}`,
        this.MemoryType.THOUGHT,
        7
      );
    } catch (e) {
      console.error('创建计划失败:', e);
    }
  }

  /**
   * 获取时间上下文
   */
  getTimeContext(time) {
    const hour = time.getHours();
    if (hour < 6) return '凌晨';
    if (hour < 9) return '早晨';
    if (hour < 12) return '上午';
    if (hour < 14) return '中午';
    if (hour < 18) return '下午';
    if (hour < 22) return '晚上';
    return '深夜';
  }

  /**
   * 获取附近描述
   */
  getNearbyDescription() {
    if (this.nearbyAgents.size === 0) {
      return '周围没有人';
    }
    return `附近有${this.nearbyAgents.size}个人`;
  }

  /**
   * 设置位置
   */
  setPosition(pos) {
    this.position = pos;
  }

  /**
   * 获取位置
   */
  getPosition() {
    return this.position;
  }

  /**
   * 获取当前状态
   */
  getState() {
    return {
      status: this.status,
      currentAction: this.currentAction,
      position: this.position
    };
  }

  /**
   * 获取序列化数据
   */
  serialize() {
    return {
      id: this.id,
      name: this.name,
      config: this.config,
      position: this.position,
      status: this.status,
      currentAction: this.currentAction,
      memory: this.memory.exportData()
    };
  }

  /**
   * 从序列化数据恢复
   */
  static deserialize(data, llmClient) {
    const agent = new Agent(data.config, llmClient);
    agent.position = data.position;
    agent.status = data.status || 'idle';
    agent.currentAction = data.currentAction || null;
    if (data.memory) {
      agent.memory.importData(data.memory);
    }
    return agent;
  }
}

export default Agent;
