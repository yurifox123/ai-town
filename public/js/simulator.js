/**
 * 世界模拟器（前端版本）
 * 管理所有Agent、世界状态和时间推进
 */
import Agent from './agent.js';

class WorldSimulator extends EventTarget {
  constructor(width = 50, height = 50, timeScale = 60, llmClient) {
    super();

    this.agents = new Map();
    this.objects = new Map();
    this.events = [];

    this.width = width;
    this.height = height;
    this.timeScale = timeScale; // 1秒现实时间 = X分钟游戏时间

    this.gameTime = new Date();
    this.gameTime.setHours(8, 0, 0, 0);

    this.isRunning = false;
    this.tickInterval = null;
    this.tickCount = 0;

    this.llm = llmClient;

    this.initializeWorld();
  }

  /**
   * 初始化世界对象
   */
  initializeWorld() {
    const locations = [
      {
        id: 'cafe',
        name: '咖啡馆',
        type: 'building',
        position: { x: 10, y: 10, area: '咖啡馆' },
        interactable: true,
        description: '一个温馨的咖啡馆，提供各种咖啡和点心'
      },
      {
        id: 'park',
        name: '公园',
        type: 'area',
        position: { x: 30, y: 20, area: '公园' },
        interactable: true,
        description: '绿树成荫的公园，适合散步和放松'
      },
      {
        id: 'home1',
        name: '小明家',
        type: 'building',
        position: { x: 5, y: 5, area: '家' },
        interactable: true,
        description: '小明的温馨小屋'
      },
      {
        id: 'home2',
        name: '小红家',
        type: 'building',
        position: { x: 40, y: 35, area: '家' },
        interactable: true,
        description: '小红的公寓'
      },
      {
        id: 'shop',
        name: '便利店',
        type: 'building',
        position: { x: 25, y: 15, area: '商店' },
        interactable: true,
        description: '24小时便利店'
      },
      {
        id: 'library',
        name: '图书馆',
        type: 'building',
        position: { x: 15, y: 30, area: '图书馆' },
        interactable: true,
        description: '安静的阅读场所'
      }
    ];

    for (const obj of locations) {
      this.objects.set(obj.id, obj);
    }
  }

  /**
   * 添加Agent
   */
  async addAgent(config, position = null) {
    const agent = new Agent(config, this.llm);

    if (position) {
      agent.setPosition(position);
    } else {
      // 随机位置
      agent.setPosition({
        x: Math.floor(Math.random() * this.width),
        y: Math.floor(Math.random() * this.height)
      });
    }

    await agent.initialize();

    this.agents.set(agent.id, agent);

    // 触发事件
    this.dispatchEvent(new CustomEvent('agentJoined', {
      detail: this.getAgentState(agent)
    }));

    return agent;
  }

  /**
   * 移除Agent
   */
  removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      this.dispatchEvent(new CustomEvent('agentLeft', {
        detail: { agentId }
      }));
    }
  }

  /**
   * 启动模拟
   */
  start(tickIntervalMs = 5000) {
    if (this.isRunning) return;

    this.isRunning = true;
    this.tickInterval = setInterval(() => this.tick(), tickIntervalMs);

    this.dispatchEvent(new CustomEvent('started'));
  }

  /**
   * 停止模拟
   */
  stop() {
    this.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.dispatchEvent(new CustomEvent('stopped'));
  }

  /**
   * 单步执行
   */
  async tick() {
    this.tickCount++;

    // 推进游戏时间
    const realSeconds = 5; // tick间隔秒数
    const gameMinutes = realSeconds * this.timeScale;
    this.gameTime = new Date(this.gameTime.getTime() + gameMinutes * 60 * 1000);

    // 更新所有Agent
    const agentStates = [];
    for (const agent of this.agents.values()) {
      try {
        await this.updateAgent(agent);
        agentStates.push(this.getAgentState(agent));
      } catch (e) {
        console.error(`更新Agent ${agent.name}失败:`, e);
      }
    }

    // 触发tick事件
    this.dispatchEvent(new CustomEvent('tick', {
      detail: {
        time: this.gameTime,
        agents: agentStates,
        tickCount: this.tickCount
      }
    }));
  }

  /**
   * 更新单个Agent
   */
  async updateAgent(agent) {
    // 1. 检查是否需要做新决策
    // 条件：到达目标、走了50格、或没有移动目标
    if (agent.isMoving() && !agent.shouldMakeNewDecision()) {
      // 还在移动中，不做新决策（移动由 Agent 自己的定时器处理）
      return;
    }

    // 2. 感知环境
    const observations = this.getObservationsForAgent(agent);
    await agent.perceive(observations);

    // 3. 决策新行动
    const worldState = this.getWorldState();
    const action = await agent.decide(worldState);

    // 4. 执行行动（如果是移动，会启动独立定时器）
    await agent.executeAction(action, this);

    // 5. 重置决策计数器
    agent.resetDecisionCounter();

    // 6. 检查Agent交互
    await this.checkAgentInteractions(agent);
  }

  /**
   * 获取Agent的观察
   */
  getObservationsForAgent(agent) {
    const observations = [];
    const pos = agent.getPosition();

    // 观察附近的Agent
    for (const other of this.agents.values()) {
      if (other.id === agent.id) continue;

      const otherPos = other.getPosition();
      const distance = Math.sqrt(
        Math.pow(pos.x - otherPos.x, 2) + Math.pow(pos.y - otherPos.y, 2)
      );

      if (distance <= 5) {
        observations.push({
          type: 'agent',
          description: `看到${other.name}在附近`,
          position: otherPos,
          targetId: other.id,
          distance
        });
        agent.nearbyAgents.add(other.id);
      } else {
        agent.nearbyAgents.delete(other.id);
      }
    }

    // 观察附近的物体
    for (const obj of this.objects.values()) {
      const objPos = obj.position;
      const distance = Math.sqrt(
        Math.pow(pos.x - objPos.x, 2) + Math.pow(pos.y - objPos.y, 2)
      );

      if (distance <= 3) {
        observations.push({
          type: 'object',
          description: `在${obj.name}附近`,
          position: objPos,
          targetId: obj.id,
          distance
        });
      }
    }

    // 时间感知
    const hour = this.gameTime.getHours();
    if (hour >= 22 || hour < 6) {
      observations.push({
        type: 'time',
        description: '现在是夜晚',
        position: pos
      });
    }

    return observations;
  }

  /**
   * 检查Agent交互
   */
  async checkAgentInteractions(agent) {
    // 简单的随机交互概率 (20%概率，且1分钟冷却)
    if (agent.nearbyAgents.size > 0 && Math.random() < 0.2) {
      const nearbyId = Array.from(agent.nearbyAgents)[Math.floor(Math.random() * agent.nearbyAgents.size)];
      const other = this.agents.get(nearbyId);
      if (other) {
        await this.startConversation(agent.id, nearbyId);
      }
    }
  }

  /**
   * 开始对话
   */
  async startConversation(agentId1, agentId2) {
    const agent1 = this.agents.get(agentId1);
    const agent2 = this.agents.get(agentId2);

    if (!agent1 || !agent2) return;

    // 检查是否在冷却期内
    const now = Date.now();
    const lastTalk1 = agent1.lastConversation.get(agentId2) || 0;
    const lastTalk2 = agent2.lastConversation.get(agentId1) || 0;
    if (now - lastTalk1 < 60000 || now - lastTalk2 < 60000) return;

    // 更新最后对话时间
    agent1.lastConversation.set(agentId2, now);
    agent2.lastConversation.set(agentId1, now);

    // 生成对话内容
    const dialogue = await this.generateDialogue(agent1, agent2);

    // 触发对话事件
    this.dispatchEvent(new CustomEvent('event', {
      detail: {
        type: 'conversation',
        description: `${agent1.name}和${agent2.name}在交谈`,
        timestamp: new Date(),
        agentIds: [agentId1, agentId2],
        dialogue: dialogue
      }
    }));

    // 发送对话气泡事件
    this.dispatchEvent(new CustomEvent('dialogue', {
      detail: {
        agentId: agentId1,
        message: dialogue.speaker1,
        timestamp: now
      }
    }));

    setTimeout(() => {
      this.dispatchEvent(new CustomEvent('dialogue', {
        detail: {
          agentId: agentId2,
          message: dialogue.speaker2,
          timestamp: Date.now()
        }
      }));
    }, 2000);
  }

  /**
   * 生成对话内容
   */
  async generateDialogue(agent1, agent2) {
    // 简化版：随机选择对话主题
    const topics = [
      '今天的天气真好啊！',
      '你最近在看什么书？',
      '咖啡馆的新品不错，去试试吗？',
      '公园里花开得真漂亮。',
      '最近工作/学习怎么样？',
      '听说镇上要来新人了。'
    ];

    const responses = [
      '是啊，我也这么觉得！',
      '真的吗？我也想看看。',
      '好啊，一起去吧！',
      '听起来不错呢。',
      '还好啦，就是有点忙。',
      '期待见到新朋友！'
    ];

    return {
      speaker1: topics[Math.floor(Math.random() * topics.length)],
      speaker2: responses[Math.floor(Math.random() * responses.length)]
    };
  }

  /**
   * 触发世界事件
   */
  triggerEvent(type, description) {
    const event = {
      type,
      description,
      timestamp: new Date(),
      tickCount: this.tickCount
    };

    this.events.push(event);
    if (this.events.length > 100) {
      this.events.shift();
    }

    this.dispatchEvent(new CustomEvent('event', {
      detail: event
    }));

    return event;
  }

  /**
   * 获取世界状态
   */
  getWorldState() {
    const agentStates = new Map();
    for (const [id, agent] of this.agents) {
      agentStates.set(id, this.getAgentState(agent));
    }

    return {
      time: this.gameTime,
      agents: agentStates,
      objects: this.objects,
      events: this.events.slice(-20),
      tickCount: this.tickCount,
      isRunning: this.isRunning
    };
  }

  /**
   * 获取Agent状态
   */
  getAgentState(agent) {
    const state = agent.getState();
    return {
      agentId: agent.id,
      name: agent.name,
      position: state.position,
      status: state.status,
      currentAction: state.currentAction,
      config: {
        age: agent.config.age,
        traits: agent.config.traits,
        background: agent.config.background,
        goals: agent.config.goals
      }
    };
  }

  /**
   * 导出状态（用于保存）
   */
  exportState() {
    const agents = [];
    for (const agent of this.agents.values()) {
      agents.push(agent.serialize());
    }

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      tickCount: this.tickCount,
      gameTime: this.gameTime.toISOString(),
      agents,
      events: this.events
    };
  }

  /**
   * 从保存数据加载
   */
  async loadFromSave(data) {
    this.tickCount = data.tickCount || 0;
    this.gameTime = new Date(data.gameTime);

    // 清除现有Agent
    this.agents.clear();

    // 加载Agent
    for (const agentData of data.agents) {
      const agent = Agent.deserialize(agentData, this.llm);
      this.agents.set(agent.id, agent);
    }

    // 加载事件
    if (data.events) {
      this.events = data.events;
    }

    this.dispatchEvent(new CustomEvent('loaded', {
      detail: { tickCount: this.tickCount, agentCount: this.agents.size }
    }));
  }

  /**
   * 重置世界
   */
  async reset(clearAgents = false) {
    this.stop();
    this.tickCount = 0;
    this.gameTime = new Date();
    this.gameTime.setHours(8, 0, 0, 0);
    this.events = [];

    const configs = [];
    if (!clearAgents) {
      for (const agent of this.agents.values()) {
        configs.push(agent.config);
      }
    }

    this.agents.clear();

    return configs;
  }

  /**
   * 获取是否运行中
   */
  getIsRunning() {
    return this.isRunning;
  }

  /**
   * 获取tick计数
   */
  getTickCount() {
    return this.tickCount;
  }
}

export default WorldSimulator;
