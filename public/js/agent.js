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
    // 移动相关
    this.moveTarget = null;
    this.movesSinceLastDecision = 0;
    this.decisionInterval = 50; // 每50格做一次新决策
    this.moveInterval = null; // 移动定时器
    this.moveSpeed = 200; // 每 0.2 秒 (200ms) 走一格
    this.moveListeners = []; // 移动监听（用于通知渲染更新）

    this.currentPlan = null;
    this.currentAction = null;
    this.observations = [];
    this.status = 'idle';

    // 社交状态
    this.nearbyAgents = new Set();
    this.lastConversation = new Map();

    // 生存属性
    this.health = {
      current: config.healthMax || 100, // 当前健康值 (0-100)
      max: config.healthMax || 100      // 健康值上限
    };
    this.greenPoints = config.greenPoints || 10; // 绿色积分，初始10，范围-10000~10000000
    this.fullness = config.fullness || 80;       // 饱腹值 (0-100)
    this.lastSurvivalUpdate = Date.now();        // 上次更新生存属性的时间戳

    // 睡眠追踪（不睡觉惩罚机制）
    this.lastSleepTime = Date.now();             // 上次睡觉时间戳
    this.consecutiveNoSleepDays = 0;             // 连续不睡觉天数

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
      SLEEP: 'SLEEP',
      WORK: 'WORK',
      BUY: 'BUY'
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

    // 获取世界中的地点和服务信息
    const locations = [];
    const workLocations = [];
    const foodLocations = [];
    for (const obj of worldState.objects.values()) {
      locations.push(`${obj.name}(${obj.position.x},${obj.position.y})`);

      // 分类地点
      if (obj.services) {
        const hasWork = obj.services.some(s => s.name === '工作');
        const hasFood = obj.services.some(s => s.fullness > 0);
        if (hasWork) workLocations.push(`${obj.name}(${obj.position.x},${obj.position.y})`);
        if (hasFood) foodLocations.push(`${obj.name}(${obj.position.x},${obj.position.y})`);
      }
    }

    // 构建决策提示
    const memoryContext = relevantMemories.map(r => r.memory.content).join('\n');

    // 生存属性上下文
    let survivalContext = '';
    if (this.health.current < 30) {
      survivalContext += `【紧急】健康值极低(${this.health.current}/${this.health.max})，你需要立即休息恢复！\n`;
    } else if (this.health.current < 50) {
      survivalContext += `【警告】健康值较低(${this.health.current}/${this.health.max})，建议休息。\n`;
    }

    // 判断食物价格（最便宜的食物）
    const cheapestFoodPrice = 5; // 咖啡最便宜5积分
    const canAffordFood = this.greenPoints >= cheapestFoodPrice;

    if (this.fullness < 20) {
      if (canAffordFood) {
        survivalContext += `【紧急】极度饥饿(${this.fullness}/100)，你必须立即寻找食物！优先前往咖啡馆或便利店。\n`;
      } else {
        survivalContext += `【紧急】极度饥饿(${this.fullness}/100)且没有钱(只有${this.greenPoints}积分)，你必须先去咖啡馆或便利店工作赚钱，然后再买食物！\n`;
      }
    } else if (this.fullness < 40) {
      if (canAffordFood) {
        survivalContext += `【警告】很饿(${this.fullness}/100)，建议找点东西吃。\n`;
      } else {
        survivalContext += `【警告】很饿(${this.fullness}/100)但没有钱买食物(只有${this.greenPoints}积分)，你需要先去工作赚钱。可工作地点: ${workLocations.join(', ') || '咖啡馆、便利店'}\n`;
      }
    }

    if (this.greenPoints < 0) {
      survivalContext += `【警告】积分为负(${this.greenPoints})，急需工作赚钱！可工作地点: ${workLocations.join(', ') || '咖啡馆、便利店'}\n`;
    } else if (this.greenPoints < cheapestFoodPrice) {
      survivalContext += `【警告】积分太少(${this.greenPoints})，连最便宜的食物都买不起，必须先去工作赚钱！可工作地点: ${workLocations.join(', ') || '咖啡馆、便利店'}\n`;
    } else if (this.greenPoints < 30) {
      survivalContext += `【提示】积分较少(${this.greenPoints})，可能需要工作。\n`;
    }

    // 时间提示
    const hour = worldState.time.getHours();
    const isNight = hour >= 22 || hour < 6;
    if (isNight) {
      survivalContext += `【深夜】现在${hour}点，夜深了，你应该回家睡觉休息！在家睡觉可以恢复健康。\n`;
    } else if (hour >= 20) {
      survivalContext += `【晚间】现在${hour}点，天色已晚，如果累了可以准备回家休息。\n`;
    }

    // 不睡觉惩罚警告
    if (this.consecutiveNoSleepDays >= 2) {
      survivalContext += `【严重警告】你已经连续${this.consecutiveNoSleepDays}天没有睡觉了！不睡觉会严重损害健康：1天-10健康，2天-50健康，3天健康归零！你必须立即去睡觉！\n`;
    } else if (this.consecutiveNoSleepDays >= 1) {
      survivalContext += `【警告】你已经${this.consecutiveNoSleepDays}天没有睡觉了，健康值会持续下降。请尽快回家休息。\n`;
    }

    // 附近建筑提示
    let nearbyBuildings = '';
    let canBuyFood = false;
    for (const obj of worldState.objects.values()) {
      const distance = Math.abs(obj.position.x - this.position.x) + Math.abs(obj.position.y - this.position.y);
      if (distance <= 3 && obj.services) {
        const foodServices = obj.services.filter(s => s.fullness > 0);
        const services = obj.services.map(s => `${s.name}(+${s.fullness || s.health || ''},${s.cost}积分)`).join(', ');
        nearbyBuildings += `- ${obj.name}: ${services}\n`;
        if (foodServices.length > 0) {
          canBuyFood = true;
        }
      }
    }

    const prompt = `你是${this.name}，${this.config.age}岁。
性格: ${this.config.traits}

你的记忆:
${memoryContext}

当前生存状态:
- 健康: ${this.health.current}/${this.health.max}
- 饱腹: ${this.fullness}/100
- 积分: ${this.greenPoints}
${survivalContext}

当前情况:
- 位置: (${this.position.x}, ${this.position.y})
- 时间: ${worldState.time.toLocaleString()}
- 状态: ${this.status}
- 附近: ${this.getNearbyDescription()}

世界中的地点: ${locations.join(', ')}

附近建筑服务:
${nearbyBuildings || '无'}

请决定你接下来要做什么。用JSON格式输出你的决定：
{
  "action": "MOVE|TALK|WAIT|SLEEP|WORK|BUY",
  "description": "行动描述",
  "targetX": 目标x坐标(如果是移动),
  "targetY": 目标y坐标(如果是移动),
  "hourlyRate": 时薪(如果是工作，可选15-25),
  "serviceName": "服务名称(如果是购买)"
}

行动说明:
- MOVE: 移动到目标位置
- TALK: 与附近的人交谈
- WAIT: 原地等待
- SLEEP: 回家睡觉(恢复健康和饱腹)
- WORK: 在工作地点工作赚取积分
- BUY: 在附近建筑购买食物或服务${canBuyFood ? '，你现在就在建筑附近可以购买' : ''}

决策优先级（严格遵循，从高到低）:
1. 连续2天+没睡觉: 必须立即回家睡觉（SLEEP），不睡觉会扣大量健康值甚至死亡！
2. 健康<30: 优先休息恢复
3. 深夜(22:00-6:00): 必须回家睡觉（SLEEP），除非你正在工作赚钱
4. 饱腹<20且积分>=5: 必须立即购买食物（前往咖啡馆/便利店后BUY）
5. 饱腹<20但积分<5: 必须先去工作赚钱（WORK），有钱了再买食物
6. 积分<5（买不起食物）: 优先去咖啡馆或便利店工作赚钱
7. 饱腹<40且积分>=5: 前往有食物的地方购买
8. 积分<30: 考虑工作赚钱储备

重要提醒:
- 不睡觉惩罚：1天不睡-10健康，2天不睡-50健康，3天不睡健康归零直接昏迷！
- 深夜(22:00-6:00)不睡觉会持续累积不睡觉天数，请按时睡觉。
${this.consecutiveNoSleepDays >= 1 ? `【警告】你已经${this.consecutiveNoSleepDays}天没睡觉了，请立即SLEEP回家睡觉！` : ''}
${isNight ? '【深夜】现在就是深夜，请使用SLEEP行动回家休息！' : ''}

${canBuyFood ? '你现在就在有食物的地点附近，可以直接使用BUY行动购买食物恢复饱腹。' : ''}

如果没有特定目标位置，可以随机移动到附近位置。`;

    try {
      console.log(`[${this.name}] 正在请求LLM决策...`);
      const response = await this.llm.chat([
        { role: 'system', content: `你是${this.name}，一个生活在AI生态小镇的居民。请根据你的性格和记忆做出自然的行为决定。只输出JSON，不要其他解释。` },
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
      } else if (actionType === 'WORK') {
        return {
          type: this.ActionType.WORK,
          description: decision.description || '工作',
          hourlyRate: decision.hourlyRate || 15,
          timestamp: new Date()
        };
      } else if (actionType === 'BUY') {
        console.log(`[${this.name}] LLM决策: BUY购买食物`);
        return {
          type: this.ActionType.BUY,
          description: decision.description || '购买',
          serviceName: decision.serviceName || '',
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

    console.log(`[${this.name}] 执行行动: ${action.type || '未知类型'} - ${action.description || '无描述'}`);

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
          // 启动独立移动循环，每 0.2 秒走一格，不依赖 tick
          this.startMoving({ ...action.targetPosition });
        }
        break;

      case this.ActionType.TALK:
        if (action.targetAgent) {
          await this.converseWith(action.targetAgent, world);
        }
        break;

      case this.ActionType.SLEEP:
        console.log(`[${this.name}] 执行SLEEP行动，准备回家睡觉...`);
        if (world && world.objects) {
          // 找到自己的家
          let myHome = null;
          for (const obj of world.objects.values()) {
            if (obj.owner === this.id) {
              myHome = obj;
              break;
            }
          }

          if (myHome) {
            const distance = Math.abs(myHome.position.x - this.position.x) + Math.abs(myHome.position.y - this.position.y);

            if (distance <= 1) {
              // 已经在家附近，使用睡觉服务
              console.log(`[${this.name}] 已经到家，开始睡觉`);
              const sleepService = myHome.services.find(s => s.name === '睡觉');
              if (sleepService) {
                await this.interactWithObject(myHome, sleepService);
              } else {
                this.status = 'sleeping';
              }
            } else {
              // 不在家，先移动回家
              console.log(`[${this.name}] 距离家还有${distance}格，先移动回家`);
              await this.memory.addMemory(
                `夜深了，准备回家睡觉`,
                this.MemoryType.THOUGHT,
                7
              );
              this.startMoving({ ...myHome.position });
            }
          } else {
            console.warn(`[${this.name}] 未找到家，原地睡觉`);
            this.status = 'sleeping';
          }
        } else {
          this.status = 'sleeping';
        }
        break;

      case this.ActionType.INTERACT:
        if (action.targetObject) {
          await this.interactWithObject(action.targetObject, action.service);
        }
        break;

      case this.ActionType.WORK:
        this.status = 'working';
        break;

      case this.ActionType.BUY:
        console.log(`[${this.name}] 执行BUY行动，寻找附近食物...`);
        // 寻找附近有可购买服务的建筑
        if (world && world.objects) {
          let bestBuilding = null;
          let bestService = null;
          let minDistance = Infinity;

          for (const obj of world.objects.values()) {
            if (!obj.services) continue;

            const distance = Math.abs(obj.position.x - this.position.x) + Math.abs(obj.position.y - this.position.y);
            if (distance <= 5 && distance < minDistance) {
              // 找食物服务
              const foodServices = obj.services.filter(s => s.fullness > 0 && this.greenPoints >= s.cost);
              if (foodServices.length > 0) {
                // 如果指定了服务名，找匹配的
                if (action.serviceName) {
                  const matchedService = foodServices.find(s => s.name === action.serviceName);
                  if (matchedService) {
                    bestBuilding = obj;
                    bestService = matchedService;
                    minDistance = distance;
                  }
                } else {
                  // 否则找性价比最高的
                  bestBuilding = obj;
                  bestService = foodServices.sort((a, b) => (b.fullness / b.cost) - (a.fullness / a.cost))[0];
                  minDistance = distance;
                }
              }
            }
          }

          if (bestBuilding && bestService) {
            console.log(`[${this.name}] 找到食物: ${bestService.name} at ${bestBuilding.name}，价格${bestService.cost}，恢复${bestService.fullness}饱腹`);
            await this.interactWithObject(bestBuilding, bestService);
            // 购买完成后重置状态
            this.status = 'idle';
            this.currentAction = null;
          } else {
            // 分析失败原因
            const cheapestFood = 5;
            if (this.greenPoints < cheapestFood) {
              console.log(`[${this.name}] 积分不足(${this.greenPoints})，买不起食物，需要去工作赚钱`);
              await this.memory.addMemory(
                `很饿但是只有${this.greenPoints}积分，买不起食物，必须先工作赚钱`,
                this.MemoryType.OBSERVATION,
                8
              );
              // 如果饥饿且没钱，自动转为工作状态
              if (this.fullness < 40) {
                console.log(`[${this.name}] 饥饿且没钱，自动切换到WORK状态`);
                this.status = 'working';
                this.currentAction = {
                  type: this.ActionType.WORK,
                  description: '工作赚钱买食物',
                  hourlyRate: 15,
                  timestamp: new Date()
                };
                return; // 提前返回，不重置为idle
              }
            } else {
              console.log(`[${this.name}] 附近没有卖食物的地方`);
              await this.memory.addMemory(
                '附近没有卖食物的地方，需要去找咖啡馆或便利店',
                this.MemoryType.OBSERVATION,
                6
              );
            }
            // 购买失败也重置状态
            this.status = 'idle';
            this.currentAction = null;
          }
        } else {
          console.warn(`[${this.name}] BUY行动失败：world或world.objects未定义`);
          this.status = 'idle';
          this.currentAction = null;
        }
        break;
    }

    return action;
  }

  /**
   * 开始移动（启动独立定时器，每 0.2 秒走一格）
   */
  startMoving(targetPosition) {
    if (this.moveInterval) {
      clearInterval(this.moveInterval);
    }

    this.moveTarget = targetPosition;
    this.status = 'moving';

    console.log(`[${this.name}] 开始移动，目标: (${targetPosition.x},${targetPosition.y})，速度: 每 ${this.moveSpeed}ms 一格`);

    // 启动移动循环，每 0.2 秒走一格
    this.moveInterval = setInterval(() => {
      const stillMoving = this.moveOneStep();

      // 通知监听者位置更新（用于渲染）
      this.notifyMoveListeners();

      if (!stillMoving) {
        // 到达目标，停止移动定时器
        this.stopMoving();
      }
    }, this.moveSpeed);

    return true;
  }

  /**
   * 停止移动
   */
  stopMoving() {
    if (this.moveInterval) {
      clearInterval(this.moveInterval);
      this.moveInterval = null;
    }
    this.moveTarget = null;
    this.status = 'idle';
  }

  /**
   * 添加移动监听（用于 UI 渲染）
   */
  onMove(callback) {
    this.moveListeners.push(callback);
  }

  /**
   * 通知移动监听
   */
  notifyMoveListeners() {
    for (const listener of this.moveListeners) {
      listener(this.position);
    }
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
    this.movesSinceLastDecision++; // 增加移动计数

    const distance = Math.abs(dx) + Math.abs(dy);
    console.log(`[${this.name}] 移动: (${oldPos.x},${oldPos.y}) -> (${this.position.x},${this.position.y})，剩余距离: ${distance - 1}，已走${this.movesSinceLastDecision}格`);

    // 记录移动记忆
    this.memory.addMemory(
      `我移动到了位置(${this.position.x}, ${this.position.y})`,
      this.MemoryType.ACTION,
      5
    );

    // 检查是否到达目标
    if (this.position.x === this.moveTarget.x && this.position.y === this.moveTarget.y) {
      console.log(`[${this.name}] 已到达目标位置 (${this.moveTarget.x},${this.moveTarget.y})，已走${this.movesSinceLastDecision}格`);
      this.moveTarget = null;
      this.status = 'idle';
      return false;
    }

    // 还有剩余移动
    this.status = 'moving';
    return true;
  }

  /**
   * 检查是否应该做新决策
   * 条件：走了50格，或到达目标，或没有移动目标
   */
  shouldMakeNewDecision() {
    // 没有目标，需要做决策
    if (!this.moveTarget) return true;

    // 已经走了50格，需要做新决策
    if (this.movesSinceLastDecision >= this.decisionInterval) {
      console.log(`[${this.name}] 已走${this.movesSinceLastDecision}格，触发新决策`);
      return true;
    }

    return false;
  }

  /**
   * 重置决策计数器（在做出新决策后调用）
   */
  resetDecisionCounter() {
    this.movesSinceLastDecision = 0;
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
      health: this.health,
      greenPoints: this.greenPoints,
      fullness: this.fullness,
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
    if (data.health) {
      agent.health = data.health;
    }
    if (data.greenPoints !== undefined) {
      agent.greenPoints = data.greenPoints;
    }
    if (data.fullness !== undefined) {
      agent.fullness = data.fullness;
    }
    if (data.lastSurvivalUpdate) {
      agent.lastSurvivalUpdate = data.lastSurvivalUpdate;
    }
    if (data.memory) {
      agent.memory.importData(data.memory);
    }
    return agent;
  }

  /**
   * 更新生存属性（随时间自动消耗）
   * @param {number} gameMinutes - 游戏时间经过的分钟数
   * @param {boolean} isMoving - 是否在移动中
   * @param {boolean} isWorking - 是否在工作
   * @param {boolean} isSleeping - 是否在睡觉
   */
  updateSurvivalAttributes(gameMinutes, isMoving = false, isWorking = false, isSleeping = false) {
    const now = Date.now();
    const elapsedHours = gameMinutes / 60;

    // 饱腹值消耗
    let fullnessConsumed = elapsedHours * 3; // 每小时消耗3点

    if (isMoving) {
      fullnessConsumed += elapsedHours * 2; // 移动额外消耗
    }
    if (isWorking) {
      fullnessConsumed += elapsedHours * 2; // 工作额外消耗
    }
    if (isSleeping) {
      fullnessConsumed = elapsedHours * 1; // 睡觉消耗减半
    }

    this.fullness = Math.max(0, this.fullness - fullnessConsumed);

    // 健康值变化
    if (this.fullness === 0) {
      // 极度饥饿，健康快速下降
      const healthLost = elapsedHours * 5;
      this.health.current = Math.max(0, this.health.current - healthLost);
    } else if (this.fullness < 20) {
      // 饥饿状态，健康缓慢下降
      const healthLost = elapsedHours * 2;
      this.health.current = Math.max(0, this.health.current - healthLost);
    } else if (isSleeping) {
      // 睡觉恢复健康
      const healthGain = elapsedHours * 10;
      this.health.current = Math.min(this.health.max, this.health.current + healthGain);
      // 重置上次睡觉时间
      this.lastSleepTime = now;
      this.consecutiveNoSleepDays = 0;
    } else if (this.fullness >= 80 && !isMoving && !isWorking) {
      // 饱腹且休息时，健康缓慢恢复
      const healthGain = elapsedHours * 1;
      this.health.current = Math.min(this.health.max, this.health.current + healthGain);
    }

    // 不睡觉惩罚机制
    const hoursSinceLastSleep = (now - this.lastSleepTime) / (1000 * 60 * 60); // 现实小时
    const gameDaysSinceLastSleep = (hoursSinceLastSleep * (gameMinutes / 60)) / 24; // 游戏天

    if (gameDaysSinceLastSleep >= 1 && !isSleeping) {
      // 计算连续不睡觉天数（取整）
      const noSleepDays = Math.floor(gameDaysSinceLastSleep);

      if (noSleepDays !== this.consecutiveNoSleepDays) {
        this.consecutiveNoSleepDays = noSleepDays;

        let sleepPenalty = 0;
        if (noSleepDays >= 3) {
          // 连续3天不睡觉，健康归零
          sleepPenalty = this.health.current;
          console.log(`[${this.name}] 连续${noSleepDays}天没有睡觉，健康值归零！`);
        } else if (noSleepDays >= 2) {
          // 连续2天不睡觉，扣50健康
          sleepPenalty = 50;
          console.log(`[${this.name}] 连续${noSleepDays}天没有睡觉，健康值-50`);
        } else if (noSleepDays >= 1) {
          // 1天不睡觉，扣10健康
          sleepPenalty = 10;
          console.log(`[${this.name}] ${noSleepDays}天没有睡觉，健康值-10`);
        }

        if (sleepPenalty > 0) {
          this.health.current = Math.max(0, this.health.current - sleepPenalty);
          // 记录到记忆
          this.memory.addMemory(
            `已经连续${noSleepDays}天没有睡觉了，感觉非常疲惫，健康受损`,
            this.MemoryType.OBSERVATION,
            9
          );
        }
      }
    }

    // 健康=0时进入昏迷状态
    if (this.health.current === 0) {
      this.status = 'unconscious';
    }

    this.lastSurvivalUpdate = now;
  }

  /**
   * 恢复饱腹值
   * @param {number} amount - 恢复量
   */
  eat(amount) {
    this.fullness = Math.min(100, this.fullness + amount);
  }

  /**
   * 恢复健康值
   * @param {number} amount - 恢复量
   */
  heal(amount) {
    this.health.current = Math.min(this.health.max, this.health.current + amount);
  }

  /**
   * 与建筑/物体交互
   * @param {Object} object - 建筑/物体
   * @param {Object} service - 服务项目
   */
  async interactWithObject(object, service) {
    if (!service) {
      // 如果没有指定服务，使用第一个可用服务
      service = object.services?.[0];
    }

    if (!service) {
      console.log(`[${this.name}] ${object.name} 没有可用的服务`);
      return;
    }

    // 检查积分
    if (service.cost > 0 && this.greenPoints < service.cost) {
      console.log(`[${this.name}] 积分不足，无法使用 ${service.name}`);
      await this.memory.addMemory(
        `想去${object.name}消费但积分不够`,
        this.MemoryType.OBSERVATION,
        5
      );
      return;
    }

    // 扣除积分
    if (service.cost > 0) {
      this.spendPoints(service.cost);
    }

    // 应用效果
    if (service.fullness) {
      this.eat(service.fullness);
    }
    if (service.health) {
      this.heal(service.health);
    }

    // 记录到记忆
    const actionDesc = service.description || `${service.name}(${object.name})`;
    await this.memory.addMemory(
      `在${object.name}${actionDesc}，消耗${service.cost}积分`,
      this.MemoryType.ACTION,
      6
    );

    console.log(`[${this.name}] 在${object.name}使用了${service.name}，剩余积分:${this.greenPoints}，饱腹:${this.fullness}，健康:${this.health.current}`);

    // 如果是睡觉，改变状态
    if (service.name === '睡觉') {
      this.status = 'sleeping';
    }
  }

  /**
   * 消耗积分
   * @param {number} amount - 消耗量
   * @returns {boolean} - 是否成功
   */
  spendPoints(amount) {
    if (this.greenPoints >= amount) {
      this.greenPoints -= amount;
      return true;
    }
    return false;
  }

  /**
   * 增加积分
   * @param {number} amount - 增加量
   */
  earnPoints(amount) {
    this.greenPoints += amount;
  }
}

export default Agent;
