/**
 * 世界模拟器（前端版本）
 * 管理所有Agent、世界状态和时间推进
 */
import Agent from "./agent.js";

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

    this.tickIntervalMs = 5000; // 默认tick间隔（毫秒）
    this.timeUpdateInterval = null; // 实时时间流逝定时器
    this.lastTimeUpdate = Date.now(); // 上次时间更新时间

    this.llm = llmClient;

    // 小镇血量（生态健康度）
    this.townHealth = {
      current: 100,
      max: 100,
    };

    // Tick计数器
    this.tickCount = 0;

    this.initializeWorld();
  }

  /**
   * 初始化世界对象
   */
  initializeWorld() {
    const locations = [
      {
        id: "cafe",
        name: "咖啡馆",
        type: "building",
        position: { x: 15, y: 5, area: "咖啡馆" },
        interactable: true,
        description: "一个温馨的咖啡馆，提供各种咖啡和点心",
        services: [
          { name: "咖啡", cost: 5, fullness: 5, description: "一杯提神咖啡" },
          { name: "点心", cost: 15, fullness: 15, description: "精致小点心" },
          { name: "套餐", cost: 30, fullness: 30, description: "丰盛套餐" },
          { name: "工作", cost: 0, income: 20, description: "在咖啡馆打工" },
        ],
      },
      {
        id: "park",
        name: "公园",
        type: "area",
        position: { x: 33, y: 18, area: "公园" },
        interactable: true,
        description: "绿树成荫的公园，适合散步和放松",
        services: [
          {
            name: "散步",
            cost: 0,
            health: 2,
            fullness: -2,
            description: "悠闲散步",
          },
          {
            name: "锻炼",
            cost: 0,
            health: 5,
            fullness: -5,
            description: "户外锻炼",
          },
        ],
      },
      {
        id: "home1",
        name: "小明家",
        type: "building",
        position: { x: 5, y: 5, area: "家" },
        interactable: true,
        description: "小明的温馨小屋",
        services: [
          {
            name: "睡觉",
            cost: 0,
            health: 10,
            fullness: -1,
            description: "在家睡觉恢复",
          },
          { name: "休息", cost: 0, health: 3, description: "在家休息" },
        ],
        owner: "xiaoming",
      },
      {
        id: "home2",
        name: "小红家",
        type: "building",
        position: { x: 45, y: 35, area: "家" },
        interactable: true,
        description: "小红的公寓",
        services: [
          {
            name: "睡觉",
            cost: 0,
            health: 10,
            fullness: -1,
            description: "在家睡觉恢复",
          },
          { name: "休息", cost: 0, health: 3, description: "在家休息" },
        ],
        owner: "xiaohong",
      },
      {
        id: "shop",
        name: "便利店",
        type: "building",
        position: { x: 22, y: 15, area: "商店" },
        interactable: true,
        description: "24小时便利店",
        services: [
          { name: "零食", cost: 10, fullness: 10, description: "方便零食" },
          { name: "便当", cost: 25, fullness: 25, description: "加热便当" },
          { name: "大餐", cost: 50, fullness: 50, description: "豪华便当" },
          { name: "工作", cost: 0, income: 15, description: "在便利店打工" },
        ],
      },
      {
        id: "library",
        name: "图书馆",
        type: "building",
        position: { x: 15, y: 22, area: "图书馆" },
        interactable: true,
        description: "安静的阅读场所",
        services: [{ name: "阅读", cost: 0, description: "安静阅读" }],
      },
      {
        id: "home3",
        name: "小米家",
        type: "building",
        position: { x: 5, y: 35, area: "家" },
        interactable: true,
        description: "小米的美食小屋，总是飘着诱人的香气",
        services: [
          {
            name: "睡觉",
            cost: 0,
            health: 10,
            fullness: -1,
            description: "在家睡觉恢复",
          },
          { name: "休息", cost: 0, health: 3, description: "在家休息" },
        ],
        owner: "xiaomi",
      },
      {
        id: "home4",
        name: "小东家",
        type: "building",
        position: { x: 45, y: 5, area: "家" },
        interactable: true,
        description: "小东的健身之家，充满运动活力",
        services: [
          {
            name: "睡觉",
            cost: 0,
            health: 10,
            fullness: -1,
            description: "在家睡觉恢复",
          },
          {
            name: "锻炼",
            cost: 0,
            health: 8,
            fullness: -3,
            description: "在家锻炼",
          },
        ],
        owner: "xiaodong",
      },
    ];

    for (const obj of locations) {
      this.objects.set(obj.id, obj);
    }

    // 初始化地形系统（围墙、河流、大门）
    this.initializeTerrain();
  }

  /**
   * 初始化地形（围墙、河流、大门）
   * 地形有体积，NPC无法穿过（大门除外）
   */
  initializeTerrain() {
    this.terrain = new Map(); // 存储地形格子: key="x,y", value=terrainType
    this.gates = []; // 大门位置列表，用于渲染和快速查找

    const width = this.width;
    const height = this.height;

    // 1. 创建围墙（地图四周）
    // 留出两个大门位置：(25,0) 北边大门, (25,49) 南边大门
    for (let x = 0; x < width; x++) {
      // 上边围墙（除了大门位置）
      if (x !== 25) {
        this.terrain.set(`${x},0`, "wall");
      } else {
        this.terrain.set(`${x},0`, "gate");
        this.gates.push({ x, y: 0, direction: "north" });
      }

      // 下边围墙（除了大门位置）
      if (x !== 25) {
        this.terrain.set(`${x},${height - 1}`, "wall");
      } else {
        this.terrain.set(`${x},${height - 1}`, "gate");
        this.gates.push({ x, y: height - 1, direction: "south" });
      }
    }

    for (let y = 1; y < height - 1; y++) {
      // 左边围墙
      this.terrain.set(`0,${y}`, "wall");
      // 右边围墙
      this.terrain.set(`${width - 1},${y}`, "wall");
    }

    // 2. 创建河流（穿过小镇，从西到东，蜿蜒曲折）
    // 河流使用曲线，让地图更有层次感
    const riverYBase = Math.floor(height / 2); // 河流中心线

    for (let x = 1; x < width - 1; x++) {
      // 使用正弦函数创建蜿蜒河流
      const curve = Math.sin(x * 0.15) * 3;
      const riverY = Math.floor(riverYBase + curve);

      // 河流宽度2-3格
      this.terrain.set(`${x},${riverY}`, "river");
      this.terrain.set(`${x},${riverY + 1}`, "river");

      // 河流弯曲处加宽
      if (Math.abs(curve) > 2) {
        this.terrain.set(`${x},${riverY - 1}`, "river");
      }
    }

    // 3. 添加桥梁（穿过河流的可通行路径）
    // 桥梁位置：(12, riverY) 和 (37, riverY)
    const bridgeX1 = 12;
    const bridgeX2 = 37;

    for (let x of [bridgeX1, bridgeX2]) {
      const curve = Math.sin(x * 0.15) * 3;
      const riverY = Math.floor(riverYBase + curve);

      // 桥梁替换河流地形
      this.terrain.set(`${x},${riverY}`, "bridge");
      this.terrain.set(`${x},${riverY + 1}`, "bridge");
      if (this.terrain.get(`${x},${riverY - 1}`) === "river") {
        this.terrain.set(`${x},${riverY - 1}`, "bridge");
      }
    }

    // 4. 添加一些装饰性围墙（内部小区域）
    // 在公园周围添加矮墙
    const parkX = 33,
      parkY = 18;
    for (let x = parkX - 3; x <= parkX + 3; x++) {
      this.terrain.set(`${x},${parkY - 3}`, "fence");
      this.terrain.set(`${x},${parkY + 3}`, "fence");
    }
    for (let y = parkY - 2; y <= parkY + 2; y++) {
      this.terrain.set(`${parkX - 3},${y}`, "fence");
      this.terrain.set(`${parkX + 3},${y}`, "fence");
    }
    // 公园入口
    this.terrain.set(`${parkX},${parkY + 3}`, "gate");
    this.gates.push({ x: parkX, y: parkY + 3, direction: "south" });
  }

  /**
   * 检查位置是否可通行
   * @param {number} x - x坐标
   * @param {number} y - y坐标
   * @returns {boolean} - 是否可通行
   */
  isPassable(x, y) {
    // 边界检查
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }

    const terrain = this.terrain.get(`${x},${y}`);

    // 可通行的地形：undefined(空地), 'gate'(大门), 'bridge'(桥梁)
    // 不可通行的地形：'wall'(围墙), 'river'(河流), 'fence'(栅栏)
    if (terrain === "wall" || terrain === "river" || terrain === "fence") {
      return false;
    }

    return true;
  }

  /**
   * 获取指定位置的地形类型
   * @param {number} x - x坐标
   * @param {number} y - y坐标
   * @returns {string|null} - 地形类型或null
   */
  getTerrainAt(x, y) {
    return this.terrain.get(`${x},${y}`) || null;
  }

  /**
   * 获取所有地形数据（用于渲染）
   * @returns {Map} - 地形Map
   */
  getTerrainMap() {
    return this.terrain;
  }

  /**
   * 获取所有大门位置
   * @returns {Array} - 大门位置数组
   */
  getGates() {
    return this.gates;
  }

  /**
   * 添加Agent
   */
  async addAgent(config, position = null) {
    const agent = new Agent(config, this.llm);

    if (position) {
      agent.setPosition(position);
    } else {
      // 随机位置，确保在可通行区域
      let validPosition = false;
      let attempts = 0;
      let newPos = { x: 0, y: 0 };

      while (!validPosition && attempts < 100) {
        newPos = {
          x: Math.floor(Math.random() * this.width),
          y: Math.floor(Math.random() * this.height),
        };
        validPosition = this.isPassable(newPos.x, newPos.y);
        attempts++;
      }

      if (!validPosition) {
        // 如果找不到随机位置，使用家门位置
        const home = this.objects
          .values()
          .find((obj) => obj.owner === config.id);
        if (home) {
          newPos = { ...home.position };
        } else {
          newPos = { x: 25, y: 25 }; // 默认中心位置
        }
      }

      agent.setPosition(newPos);
    }

    await agent.initialize();

    this.agents.set(agent.id, agent);

    // 触发事件
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

    // 启动实时时间流逝（每秒更新一次）
    this.lastTimeUpdate = Date.now();
    this.timeUpdateInterval = setInterval(() => {
      const now = Date.now();
      const realSeconds = (now - this.lastTimeUpdate) / 1000;
      this.lastTimeUpdate = now;

      // 推进游戏时间：现实1秒 = 游戏timeScale分钟
      const gameMinutes = realSeconds * this.timeScale;
      this.gameTime = new Date(
        this.gameTime.getTime() + gameMinutes * 60 * 1000,
      );

      // 触发时间更新事件
      this.dispatchEvent(
        new CustomEvent("timeUpdate", {
          detail: { time: this.gameTime, townHealth: this.townHealth },
        }),
      );
    }, 1000); // 每秒更新一次

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
    // 停止实时时间流逝
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }
    this.dispatchEvent(new CustomEvent("stopped"));
  }

  /**
   * 单步执行（只执行一个tick，不影响运行状态）
   */
  async step() {
    await this.tick();
  }

  /**
   * 执行tick
   */
  async tick() {
    this.tickCount++;

    // 推进游戏时间
    const realSeconds = this.tickIntervalMs / 1000; // 使用实际的tick间隔
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
    // 0. 更新生存属性
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

    // 0.1 处理工作收入
    if (isWorking) {
      const hourlyRate = agent.currentAction.hourlyRate || 15; // 默认15积分/小时
      const income = (gameMinutes / 60) * hourlyRate;
      agent.earnPoints(income);
    }

    // 0.2 处理睡觉状态恢复
    if (isSleeping) {
      const hour = this.gameTime.getHours();
      // 早上6点自动醒来
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

    // 1. 检查是否需要做新决策
    // 条件：到达目标、走了50格、或没有移动目标
    if (agent.isMoving && agent.isMoving() && !agent.shouldMakeNewDecision()) {
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

    // 观察附近的物体
    for (const obj of this.objects.values()) {
      const objPos = obj.position;
      const distance = Math.sqrt(
        Math.pow(pos.x - objPos.x, 2) + Math.pow(pos.y - objPos.y, 2),
      );

      if (distance <= 3) {
        observations.push({
          type: "object",
          description: `在${obj.name}附近`,
          position: objPos,
          targetId: obj.id,
          distance,
        });
      }
    }

    // 时间感知
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
    // 简单的随机交互概率 (20%概率，且1分钟冷却)
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

    // 发送对话气泡事件
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
    // 简化版：随机选择对话主题
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
      // 地形相关方法
      isPassable: (x, y) => this.isPassable(x, y),
      getTerrainAt: (x, y) => this.getTerrainAt(x, y),
      getTerrainMap: () => this.getTerrainMap(),
      getGates: () => this.getGates(),
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
      version: 1,
      timestamp: new Date().toISOString(),
      tickCount: this.tickCount,
      gameTime: this.gameTime.toISOString(),
      agents,
      events: this.events,
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
