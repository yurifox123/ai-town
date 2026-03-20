import { Agent } from '../agent/agent';
import {
  WorldState,
  GameTime,
  Position,
  Observation,
  WorldObject,
  WorldEvent,
  AgentConfig,
} from '../types';
import { LLMClient } from '../llm/client';
import { EventEmitter } from 'events';
import { SaveData, SavedAgent } from '../save-system';

/**
 * 世界模拟器
 * 管理所有Agent、世界状态和时间推进
 */
export class WorldSimulator extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private objects: Map<string, WorldObject> = new Map();
  private events: WorldEvent[] = [];

  // 世界配置
  private width: number;
  private height: number;
  private timeScale: number; // 时间缩放（1秒现实时间 = X分钟游戏时间）

  // 游戏时间
  private gameTime: Date;
  private isRunning: boolean = false;
  private tickInterval: NodeJS.Timeout | null = null;
  private tickCount: number = 0; // tick计数器

  // LLM客户端
  private llm: LLMClient;

  constructor(
    width: number = 50,
    height: number = 50,
    timeScale: number = 60, // 默认1秒=1分钟
    llm: LLMClient
  ) {
    super();
    this.width = width;
    this.height = height;
    this.timeScale = timeScale;
    this.llm = llm;

    // 初始化游戏时间（早上8点）
    this.gameTime = new Date();
    this.gameTime.setHours(8, 0, 0, 0);

    this.initializeWorld();
  }

  /**
   * 初始化世界对象
   */
  private initializeWorld(): void {
    // 创建一些地点
    const locations: WorldObject[] = [
      {
        id: 'cafe',
        name: '咖啡馆',
        type: 'building',
        position: { x: 10, y: 10, area: '咖啡馆' },
        interactable: true,
        description: '一个温馨的咖啡馆，提供各种咖啡和点心',
      },
      {
        id: 'park',
        name: '公园',
        type: 'area',
        position: { x: 30, y: 20, area: '公园' },
        interactable: true,
        description: '绿树成荫的公园，适合散步和放松',
      },
      {
        id: 'home1',
        name: '小屋1',
        type: 'building',
        position: { x: 5, y: 5, area: '家' },
        interactable: true,
        description: '舒适的住宅',
      },
      {
        id: 'home2',
        name: '小屋2',
        type: 'building',
        position: { x: 40, y: 40, area: '家' },
        interactable: true,
        description: '舒适的住宅',
      },
      {
        id: 'shop',
        name: '商店',
        type: 'building',
        position: { x: 20, y: 30, area: '商店' },
        interactable: true,
        description: '出售各种日用品',
      },
    ];

    for (const loc of locations) {
      this.objects.set(loc.id, loc);
    }

    console.log(`世界初始化完成: ${this.width}x${this.height}`);
  }

  /**
   * 添加Agent
   */
  async addAgent(config: AgentConfig, position?: Position): Promise<Agent> {
    const agent = new Agent(config, this.llm);

    if (position) {
      agent.setPosition(position);
    } else {
      // 随机位置
      agent.setPosition({
        x: Math.floor(Math.random() * this.width),
        y: Math.floor(Math.random() * this.height),
      });
    }

    await agent.initialize();
    this.agents.set(agent.id, agent);

    console.log(`Agent ${agent.name} 加入世界`);
    this.emit('agentJoined', agent.getState());

    return agent;
  }

  /**
   * 移除Agent
   */
  removeAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      this.emit('agentLeft', { agentId });
      return true;
    }
    return false;
  }

  /**
   * 启动模拟
   */
  start(tickIntervalMs: number = 5000): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`世界模拟启动，tick间隔: ${tickIntervalMs}ms`);

    this.tickInterval = setInterval(() => {
      this.tick();
    }, tickIntervalMs);

    this.emit('started');
  }

  /**
   * 停止模拟
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    console.log('世界模拟停止');
    this.emit('stopped');
  }

  /**
   * 单次Tick
   */
  private async tick(): Promise<void> {
    this.tickCount++;

    // 推进游戏时间
    this.advanceGameTime();

    // 获取当前世界状态
    const worldState = this.getWorldState();

    // 每个Agent执行决策（并行执行，不阻塞tick）
    const agentPromises: Promise<void>[] = [];

    for (const agent of this.agents.values()) {
      const agentPromise = (async () => {
        try {
          // 1. 感知环境
          const observations = this.getObservationsForAgent(agent);
          await agent.perceive(observations);

          // 2. 决策
          const action = await agent.decide({
            time: this.gameTime,
            location: this.getLocationName(agent.getPosition()),
          });

          // 3. 执行动作（只在空闲且没有当前动作时执行）
          const state = agent.getState();
          if (state.status !== 'busy' && !state.currentAction) {
            // 不等待动作完成，让Agent在后台执行
            agent.executeAction(action).catch((e) => {
              console.error(`Agent ${agent.name} 执行动作失败:`, e);
            });
          }

          // 4. 处理交互
          await this.handleInteractions(agent);
        } catch (e) {
          console.error(`Agent ${agent.name} tick失败:`, e);
        }
      })();

      agentPromises.push(agentPromise);
    }

    // 等待所有Agent的感知和决策完成（但不等待动作执行）
    await Promise.all(agentPromises);

    // 广播状态更新
    this.emit('tick', {
      time: this.gameTime,
      agents: Array.from(this.agents.values()).map((a) => a.getState()),
    });
  }

  /**
   * 获取世界状态
   */
  getWorldState(): WorldState {
    return {
      time: {
        realTime: new Date(),
        gameTime: this.gameTime,
        timeScale: this.timeScale,
      },
      agents: new Map(
        Array.from(this.agents.entries()).map(([id, agent]) => [
          id,
          {
            agentId: id,
            position: agent.getPosition(),
            currentAction: agent.getState().currentAction,
            status: agent.getState().status,
            lastUpdate: new Date(),
          },
        ])
      ),
      objects: this.objects,
      weather: 'sunny', // 可扩展天气系统
      events: this.events.slice(-10), // 最近10个事件
    };
  }

  /**
   * 获取特定位置附近的Agent
   */
  getNearbyAgents(position: Position, radius: number = 5): Agent[] {
    return Array.from(this.agents.values()).filter((agent) => {
      const pos = agent.getPosition();
      const distance = Math.sqrt(
        Math.pow(pos.x - position.x, 2) + Math.pow(pos.y - position.y, 2)
      );
      return distance <= radius;
    });
  }

  /**
   * 手动触发Agent间对话
   */
  async startConversation(agentId1: string, agentId2: string): Promise<void> {
    const agent1 = this.agents.get(agentId1);
    const agent2 = this.agents.get(agentId2);

    if (!agent1 || !agent2) {
      console.error('Agent不存在');
      return;
    }

    console.log(`\n=== ${agent1.name} 与 ${agent2.name} 开始对话 ===`);

    // 发起对话
    const greeting = await agent1.respondToDialogue(
      agent2.id,
      agent2.name,
      `你好${agent1.name}，今天怎么样？`
    );
    console.log(`${agent1.name}: ${greeting}`);

    // 简单对话回合
    let lastMessage = greeting;
    for (let i = 0; i < 3; i++) {
      const response = await agent2.respondToDialogue(agent1.id, agent1.name, lastMessage);
      console.log(`${agent2.name}: ${response}`);

      lastMessage = await agent1.respondToDialogue(agent2.id, agent2.name, response);
      console.log(`${agent1.name}: ${lastMessage}`);
    }

    console.log(`=== 对话结束 ===\n`);
  }

  /**
   * 触发世界事件
   */
  triggerEvent(type: string, description: string, location?: Position): WorldEvent {
    const event: WorldEvent = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      description,
      timestamp: this.gameTime,
      location,
      affectedAgents: [],
    };

    this.events.push(event);
    this.emit('event', event);

    console.log(`[世界事件] ${description}`);
    return event;
  }

  /**
   * 导出世界状态（用于存档）
   */
  exportState(): SaveData {
    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      gameTime: this.gameTime.toISOString(),
      world: {
        width: this.width,
        height: this.height,
        timeScale: this.timeScale,
        tickCount: this.tickCount,
      },
      agents: Array.from(this.agents.values()).map((agent) => ({
        config: agent.config,
        position: agent.getPosition(),
        memories: agent.memory.exportData().memories,
        reflections: agent.memory.exportData().reflections,
        currentAction: agent.getState().currentAction,
        status: agent.getState().status,
      })),
      events: this.events,
    };
  }

  /**
   * 从存档加载世界状态
   * @param saveData 存档数据
   * @param agentConfigs Agent配置（用于重建Agent）
   */
  async loadFromSave(saveData: SaveData): Promise<void> {
    // 停止当前模拟
    this.stop();

    // 恢复世界配置
    this.width = saveData.world.width;
    this.height = saveData.world.height;
    this.timeScale = saveData.world.timeScale;
    this.tickCount = saveData.world.tickCount || 0;

    // 恢复游戏时间
    this.gameTime = new Date(saveData.gameTime);

    // 清除现有Agent
    this.agents.clear();
    this.events = saveData.events || [];

    // 重建Agent
    console.log(`\n📥 从存档恢复 ${saveData.agents.length} 个Agent...`);

    for (const savedAgent of saveData.agents) {
      const agent = new Agent(savedAgent.config, this.llm);
      agent.setPosition(savedAgent.position);

      // 恢复记忆
      if (savedAgent.memories.length > 0 || savedAgent.reflections.length > 0) {
        agent.memory.importData({
          memories: savedAgent.memories,
          reflections: savedAgent.reflections,
        });
      }

      this.agents.set(agent.id, agent);
      console.log(`  ✓ ${agent.name} 已恢复（${savedAgent.memories.length} 条记忆）`);
    }

    console.log(`\n✅ 存档加载完成`);
    console.log(`   游戏时间: ${this.gameTime.toLocaleString()}`);
    console.log(`   已运行: ${this.tickCount} ticks`);

    this.emit('loaded', { tickCount: this.tickCount, agentCount: this.agents.size });
  }

  /**
   * 重置世界（重新开始）
   * @param keepAgents 是否保留Agent配置（true=只重置状态和记忆，false=清空所有Agent）
   */
  async reset(keepAgents: boolean = false): Promise<AgentConfig[]> {
    this.stop();

    const savedConfigs: AgentConfig[] = [];

    if (keepAgents) {
      // 保存现有Agent的配置
      for (const agent of this.agents.values()) {
        savedConfigs.push(agent.config);
      }
    }

    // 清除所有Agent
    this.agents.clear();
    this.events = [];
    this.tickCount = 0;

    // 重置游戏时间到早上8点
    this.gameTime = new Date();
    this.gameTime.setHours(8, 0, 0, 0);

    console.log('\n🔄 世界已重置');
    this.emit('reset');

    return savedConfigs;
  }

  /**
   * 获取tick计数
   */
  getTickCount(): number {
    return this.tickCount;
  }

  // 私有方法

  private advanceGameTime(): void {
    // 根据tick间隔和游戏时间缩放推进时间
    // 假设tick间隔是5秒，时间缩放是60，则游戏时间推进5分钟
    const minutesToAdd = 5; // 简化处理，每次tick推进5分钟
    this.gameTime = new Date(this.gameTime.getTime() + minutesToAdd * 60 * 1000);
  }

  private getObservationsForAgent(agent: Agent): Observation[] {
    const observations: Observation[] = [];
    const pos = agent.getPosition();

    // 1. 环境观察（当前位置）
    const nearbyObjects = Array.from(this.objects.values()).filter((obj) => {
      const distance = Math.sqrt(
        Math.pow(obj.position.x - pos.x, 2) + Math.pow(obj.position.y - pos.y, 2)
      );
      return distance <= 3;
    });

    for (const obj of nearbyObjects) {
      observations.push({
        id: Math.random().toString(36).substr(2, 9),
        timestamp: this.gameTime,
        content: `看到${obj.name}: ${obj.description}`,
        source: 'object',
        sourceId: obj.id,
        location: pos,
      });
    }

    // 2. 其他Agent观察
    const nearbyAgents = this.getNearbyAgents(pos, 5).filter((a) => a.id !== agent.id);

    for (const other of nearbyAgents) {
      const otherState = other.getState();
      observations.push({
        id: Math.random().toString(36).substr(2, 9),
        timestamp: this.gameTime,
        content: `看到${other.name}在${this.getLocationName(other.getPosition())}，正在${otherState.currentAction?.description || '闲逛'}`,
        source: 'agent',
        sourceId: other.id,
        location: pos,
      });
    }

    // 3. 时间感知
    const hour = this.gameTime.getHours();
    let timeDesc = '';
    if (hour >= 6 && hour < 12) timeDesc = '早上';
    else if (hour >= 12 && hour < 14) timeDesc = '中午';
    else if (hour >= 14 && hour < 18) timeDesc = '下午';
    else if (hour >= 18 && hour < 22) timeDesc = '晚上';
    else timeDesc = '深夜';

    observations.push({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: this.gameTime,
      content: `现在是${timeDesc}${hour}点`,
      source: 'environment',
      location: pos,
    });

    return observations;
  }

  private getLocationName(pos: Position): string {
    // 查找最近的地点
    let nearest: WorldObject | null = null;
    let minDistance = Infinity;

    for (const obj of this.objects.values()) {
      const distance = Math.sqrt(
        Math.pow(obj.position.x - pos.x, 2) + Math.pow(obj.position.y - pos.y, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearest = obj;
      }
    }

    if (nearest && minDistance <= 5) {
      return nearest.name;
    }
    return '街道上';
  }

  private async handleInteractions(agent: Agent): Promise<void> {
    const state = agent.getState();
    if (state.currentAction?.type !== 'talk') return;

    const targetId = state.currentAction.targetAgentId;
    if (!targetId) return;

    const target = this.agents.get(targetId);
    if (!target) return;

    // 触发对话
    await this.startConversation(agent.id, targetId);
  }
}
