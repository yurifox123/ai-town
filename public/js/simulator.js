/**
 * 世界模拟器（前端版本）
 * 管理所有Agent、世界状态和时间推进
 */
import Agent from "./agent.js";

class WorldSimulator extends EventTarget {
  constructor(
    tileSize = 48,
    imageWidth = 1536,
    imageHeight = 1024,
    timeScale = 60,
    llmClient,
  ) {
    super();

    this.agents = new Map();
    this.objects = new Map();
    this.events = [];

    this.tileSize = tileSize;
    this.imageWidth = imageWidth;
    this.imageHeight = imageHeight;
    this.gridCols = Math.floor(imageWidth / tileSize);
    this.gridRows = Math.floor(imageHeight / tileSize);
    this.timeScale = timeScale;

    this.gameTime = new Date();
    this.gameTime.setHours(8, 0, 0, 0);

    this.tickIntervalMs = 5000;
    this.timeUpdateInterval = null;
    this.lastTimeUpdate = Date.now();

    this.llm = llmClient;

    this.townHealth = {
      current: 100,
      max: 100,
    };

    this.tickCount = 0;

    // 区域系统
    this.areas = [];
    this.passabilityGrid = null;
    this.initPassabilityGrid();

    this.initializeWorld();
  }

  /**
   * 初始化世界对象（初始为空，由编辑器通过 setAreas 定义）
   */
  initializeWorld() {
    this.objects.clear();
  }

  /**
   * 初始化通行网格（全部可通行）
   */
  initPassabilityGrid() {
    this.passabilityGrid = Array.from({ length: this.gridRows }, () =>
      new Array(this.gridCols).fill(true),
    );
  }

  /**
   * 从区域数组重建通行网格
   */
  rebuildPassabilityFromAreas() {
    this.initPassabilityGrid();
    for (const area of this.areas) {
      if (area.isBlocked && area.cells) {
        for (const c of area.cells) {
          if (
            c.x >= 0 &&
            c.x < this.gridCols &&
            c.y >= 0 &&
            c.y < this.gridRows
          ) {
            this.passabilityGrid[c.y][c.x] = false;
          }
        }
      }
    }
  }

  /**
   * 设置区域并重建通行网格
   */
  setAreas(areas) {
    this.areas = areas;
    this.rebuildPassabilityFromAreas();
  }

  /**
   * 更新格子大小并重建网格
   */
  updateGridSize(newTileSize) {
    this.tileSize = newTileSize;
    this.gridCols = Math.floor(this.imageWidth / newTileSize);
    this.gridRows = Math.floor(this.imageHeight / newTileSize);
    this.rebuildPassabilityFromAreas();
    for (const agent of this.agents.values()) {
      const pos = agent.getPosition();
      agent.setPosition({
        x: Math.max(0, Math.min(pos.x, this.gridCols - 1)),
        y: Math.max(0, Math.min(pos.y, this.gridRows - 1)),
      });
    }
  }

  /**
   * 获取所有区域
   */
  getAreas() {
    return this.areas;
  }

  /**
   * 检查位置是否可通行
   */
  isPassable(x, y) {
    if (x < 0 || x >= this.gridCols || y < 0 || y >= this.gridRows) {
      return false;
    }
    return this.passabilityGrid[y][x];
  }

  /**
   * 获取指定坐标的区域名称
   */
  getAreaNameAt(x, y) {
    for (let i = this.areas.length - 1; i >= 0; i--) {
      const a = this.areas[i];
      if (a.cells && a.cells.some((c) => c.x === x && c.y === y)) {
        return a.name || null;
      }
    }
    return null;
  }

  /**
   * 获取指定坐标区域的服务列表
   */
  getAreaServicesAt(x, y) {
    for (let i = this.areas.length - 1; i >= 0; i--) {
      const a = this.areas[i];
      if (a.cells && a.cells.some((c) => c.x === x && c.y === y)) {
        return a.services || [];
      }
    }
    return [];
  }

  /**
   * 添加Agent
   */
  async addAgent(config, position = null) {
    const agent = new Agent(config, this.llm);

    if (position) {
      // Clamp position to grid bounds
      const clamped = {
        x: Math.max(0, Math.min(position.x, this.gridCols - 1)),
        y: Math.max(0, Math.min(position.y, this.gridRows - 1)),
      };
      agent.setPosition(clamped);
    } else {
      let validPosition = false;
      let attempts = 0;
      let newPos = { x: 0, y: 0 };

      while (!validPosition && attempts < 100) {
        newPos = {
          x: Math.floor(Math.random() * this.gridCols),
          y: Math.floor(Math.random() * this.gridRows),
        };
        validPosition = this.isPassable(newPos.x, newPos.y);
        attempts++;
      }

      if (!validPosition) {
        // 默认中心位置
        newPos = {
          x: Math.floor(this.gridCols / 2),
          y: Math.floor(this.gridRows / 2),
        };
      }

      agent.setPosition(newPos);
    }

    try {
      await agent.initialize();
    } catch (err) {
      console.error(`Agent ${agent.name} 初始化失败:`, err);
    }

    this.agents.set(agent.id, agent);

    this.dispatchEvent(
      new CustomEvent("agentJoined", {
        detail: this.getAgentState(agent),
      }),
    );

    return agent;
  }

  /**
   * 移除Agent
   */
  removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      this.dispatchEvent(
        new CustomEvent("agentLeft", {
          detail: { agentId },
        }),
      );
    }
  }

  /**
   * 启动模拟
   */
  start(tickIntervalMs = 5000) {
    if (this.isRunning) return;

    this.isRunning = true;
    this.tickIntervalMs = tickIntervalMs;
    this.tickInterval = setInterval(() => this.tick(), tickIntervalMs);

    this.lastTimeUpdate = Date.now();
    this.timeUpdateInterval = setInterval(() => {
      const now = Date.now();
      const realSeconds = (now - this.lastTimeUpdate) / 1000;
      this.lastTimeUpdate = now;

      const gameMinutes = realSeconds * this.timeScale;
      this.gameTime = new Date(
        this.gameTime.getTime() + gameMinutes * 60 * 1000,
      );

      this.dispatchEvent(
        new CustomEvent("timeUpdate", {
          detail: { time: this.gameTime, townHealth: this.townHealth },
        }),
      );
    }, 1000);

    this.dispatchEvent(new CustomEvent("started"));
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
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }
    this.dispatchEvent(new CustomEvent("stopped"));
  }

  /**
   * 单步执行
   */
  async step() {
    await this.tick();
  }

  /**
   * 执行tick
   */
  async tick() {
    this.tickCount++;

    const realSeconds = this.tickIntervalMs / 1000;
    const gameMinutes = realSeconds * this.timeScale;
    this.gameTime = new Date(this.gameTime.getTime() + gameMinutes * 60 * 1000);

    const agentStates = [];
    for (const agent of this.agents.values()) {
      try {
        await this.updateAgent(agent);
        agentStates.push(this.getAgentState(agent));
      } catch (e) {
        console.error(`更新Agent ${agent.name}失败:`, e);
      }
    }

    this.dispatchEvent(
      new CustomEvent("tick", {
        detail: {
          time: this.gameTime,
          agents: agentStates,
          tickCount: this.tickCount,
          townHealth: this.townHealth,
        },
      }),
    );
  }

  /**
   * 更新单个Agent
   */
  async updateAgent(agent) {
    const realSeconds = this.tickIntervalMs / 1000;
    const gameMinutes = realSeconds * this.timeScale;
    const isMoving = agent.isMoving && agent.isMoving();
    const isWorking =
      agent.currentAction && agent.currentAction.type === "WORK";
    const isSleeping = agent.status === "sleeping";
    agent.updateSurvivalAttributes(
      gameMinutes,
      isMoving,
      isWorking,
      isSleeping,
    );

    if (isWorking) {
      const hourlyRate = agent.currentAction.hourlyRate || 15;
      const income = (gameMinutes / 60) * hourlyRate;
      agent.earnPoints(income);
    }

    if (isSleeping) {
      const hour = this.gameTime.getHours();
      if (hour >= 6 && hour < 22) {
        agent.status = "idle";
        agent.currentAction = null;
        await agent.memory.addMemory(
          "睡醒了，感觉精神饱满",
          agent.MemoryType.OBSERVATION,
          5,
        );
      }
    }

    if (agent.isMoving && agent.isMoving() && !agent.shouldMakeNewDecision()) {
      return;
    }

    const observations = this.getObservationsForAgent(agent);
    await agent.perceive(observations);

    const worldState = this.getWorldState();
    const action = await agent.decide(worldState);

    await agent.executeAction(action, this);

    agent.resetDecisionCounter();

    await this.checkAgentInteractions(agent);
  }

  /**
   * 获取Agent的观察
   */
  getObservationsForAgent(agent) {
    const observations = [];
    const pos = agent.getPosition();

    for (const other of this.agents.values()) {
      if (other.id === agent.id) continue;

      const otherPos = other.getPosition();
      const distance = Math.sqrt(
        Math.pow(pos.x - otherPos.x, 2) + Math.pow(pos.y - otherPos.y, 2),
      );

      if (distance <= 5) {
        observations.push({
          type: "agent",
          description: `看到${other.name}在附近`,
          position: otherPos,
          targetId: other.id,
          distance,
        });
        agent.nearbyAgents.add(other.id);
      } else {
        agent.nearbyAgents.delete(other.id);
      }
    }

    // 观察附近的区域
    const areaName = this.getAreaNameAt(pos.x, pos.y);
    if (areaName) {
      observations.push({
        type: "area",
        description: `在${areaName}区域`,
        position: pos,
      });
    }

    const hour = this.gameTime.getHours();
    if (hour >= 22 || hour < 6) {
      observations.push({
        type: "time",
        description: "现在是夜晚",
        position: pos,
      });
    }

    return observations;
  }

  /**
   * 检查Agent交互
   */
  async checkAgentInteractions(agent) {
    if (agent.nearbyAgents.size > 0 && Math.random() < 0.2) {
      const nearbyId = Array.from(agent.nearbyAgents)[
        Math.floor(Math.random() * agent.nearbyAgents.size)
      ];
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

    const now = Date.now();
    const lastTalk1 = agent1.lastConversation.get(agentId2) || 0;
    const lastTalk2 = agent2.lastConversation.get(agentId1) || 0;
    if (now - lastTalk1 < 60000 || now - lastTalk2 < 60000) return;

    agent1.lastConversation.set(agentId2, now);
    agent2.lastConversation.set(agentId1, now);

    const dialogue = await this.generateDialogue(agent1, agent2);

    this.dispatchEvent(
      new CustomEvent("event", {
        detail: {
          type: "conversation",
          description: `${agent1.name}和${agent2.name}在交谈`,
          timestamp: new Date(),
          agentIds: [agentId1, agentId2],
          dialogue: dialogue,
        },
      }),
    );

    this.dispatchEvent(
      new CustomEvent("dialogue", {
        detail: {
          agentId: agentId1,
          message: dialogue.speaker1,
          timestamp: now,
        },
      }),
    );

    setTimeout(() => {
      this.dispatchEvent(
        new CustomEvent("dialogue", {
          detail: {
            agentId: agentId2,
            message: dialogue.speaker2,
            timestamp: Date.now(),
          },
        }),
      );
    }, 2000);
  }

  /**
   * 生成对话内容
   */
  async generateDialogue(agent1, agent2) {
    const topics = [
      "今天的天气真好啊！",
      "你最近在看什么书？",
      "咖啡馆的新品不错，去试试吗？",
      "公园里花开得真漂亮。",
      "最近工作/学习怎么样？",
      "听说镇上要来新人了。",
    ];

    const responses = [
      "是啊，我也这么觉得！",
      "真的吗？我也想看看。",
      "好啊，一起去吧！",
      "听起来不错呢。",
      "还好啦，就是有点忙。",
      "期待见到新朋友！",
    ];

    return {
      speaker1: topics[Math.floor(Math.random() * topics.length)],
      speaker2: responses[Math.floor(Math.random() * responses.length)],
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
      tickCount: this.tickCount,
    };

    this.events.push(event);
    if (this.events.length > 100) {
      this.events.shift();
    }

    this.dispatchEvent(
      new CustomEvent("event", {
        detail: event,
      }),
    );

    return event;
  }

  /**
   * 将区域转换为Agent可用的对象格式
   */
  areasToObjects() {
    const objects = new Map();
    for (const area of this.areas) {
      if (area.isBlocked || !area.cells || area.cells.length === 0) continue;
      if (!area.services || area.services.length === 0) continue;

      // 计算区域中心位置
      let sumX = 0,
        sumY = 0;
      for (const c of area.cells) {
        sumX += c.x;
        sumY += c.y;
      }
      const center = {
        x: Math.round(sumX / area.cells.length),
        y: Math.round(sumY / area.cells.length),
      };

      objects.set(area.id, {
        name: area.name,
        position: center,
        services: area.services,
        cells: area.cells,
      });
    }
    return objects;
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
      isRunning: this.isRunning,
      townHealth: this.townHealth,
      gridSize: { cols: this.gridCols, rows: this.gridRows },
      tileSize: this.tileSize,
      isPassable: (x, y) => this.isPassable(x, y),
      getAreaNameAt: (x, y) => this.getAreaNameAt(x, y),
      getAreaServicesAt: (x, y) => this.getAreaServicesAt(x, y),
      getAreas: () => this.getAreas(),
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
      facingDirection: agent.facingDirection || "down",
      currentAction: state.currentAction,
      health: agent.health,
      greenPoints: agent.greenPoints,
      fullness: agent.fullness,
      config: {
        age: agent.config.age,
        traits: agent.config.traits,
        background: agent.config.background,
        goals: agent.config.goals,
      },
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
      version: 2,
      timestamp: new Date().toISOString(),
      tickCount: this.tickCount,
      gameTime: this.gameTime.toISOString(),
      agents,
      events: this.events,
      areas: this.areas,
    };
  }

  /**
   * 从保存数据加载
   */
  async loadFromSave(data) {
    this.tickCount = data.tickCount || 0;
    this.gameTime = new Date(data.gameTime);

    this.agents.clear();

    for (const agentData of data.agents) {
      const agent = Agent.deserialize(agentData, this.llm);
      this.agents.set(agent.id, agent);
    }

    if (data.events) {
      this.events = data.events;
    }

    if (data.areas) {
      this.setAreas(data.areas);
    }

    this.dispatchEvent(
      new CustomEvent("loaded", {
        detail: { tickCount: this.tickCount, agentCount: this.agents.size },
      }),
    );
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

  getIsRunning() {
    return this.isRunning;
  }

  getTickCount() {
    return this.tickCount;
  }
}

export default WorldSimulator;
