/**
 * 人格系统：Prompt 构建 + 行为权重计算
 * 统一所有 LLM prompt 的构建逻辑，集中管理人格表达
 */

/**
 * 将旧格式（只有 traits 字符串）补全为完整人格结构
 */
export function normalizeTemplate(t) {
  if (!t.personality) {
    t.personality = { social: 0.5, curiosity: 0.5, energy: 0.5, caution: 0.5 };
  }
  if (!t.rules || !Array.isArray(t.rules)) t.rules = [];
  if (!t.preferences) t.preferences = { places: [], activities: [] };
  if (!t.routine) t.routine = { wakeTime: 7, sleepTime: 23 };
  if (!t.occupation) t.occupation = "普通居民";
  // 从 traits 字符串反向生成 rules（如果只有旧格式）
  if (!t.rules.length && t.traits) {
    t.rules = [`你是一个${t.traits}的人`];
  }
  return t;
}

/**
 * 计算性格描述的文本版本
 */
function personalityDescription(p) {
  const parts = [];
  if (p.social > 0.7) parts.push("主动与人交流");
  else if (p.social < 0.3) parts.push("较少主动社交");
  if (p.curiosity > 0.7) parts.push("喜欢探索新地方");
  else if (p.curiosity < 0.3) parts.push("倾向于去熟悉的地方");
  if (p.energy > 0.7) parts.push("精力充沛");
  else if (p.energy < 0.3) parts.push("容易疲劳");
  if (p.caution > 0.7) parts.push("行事谨慎");
  else if (p.caution < 0.3) parts.push("敢于冒险");
  return parts.length > 0 ? parts.join("，") : "性格平和";
}

/**
 * 1. System prompt（决策时）— 替代 agent.js:337-339
 */
export function buildSystemPrompt(agent) {
  const p = agent.personality;
  return `你是${agent.name}，${agent.age}岁，${agent.occupation}。

# 性格特征
- 社交倾向: ${p.social}（${p.social > 0.7 ? "主动与人交流" : p.social < 0.3 ? "较少主动社交" : "适度社交"}）
- 好奇心: ${p.curiosity}（${p.curiosity > 0.7 ? "喜欢探索新地方" : p.curiosity < 0.3 ? "倾向于去熟悉的地方" : "探索适中"}）
- 精力: ${p.energy}
- 谨慎度: ${p.caution}

# 行为规则
${agent.rules.map((r, i) => `${i + 1}. ${r}`).join("\n") || "无特殊规则"}

# 偏好地点: ${agent.preferences.places.join(", ") || "无特殊偏好"}
# 偏好活动: ${agent.preferences.activities.join(", ") || "无特殊偏好"}

请根据你的性格、规则和当前情况做出自然的行为决定。只输出JSON，不要其他解释。`;
}

/**
 * 2. Decision prompt（用户消息）— 替代 agent.js:273-332
 */
export function buildDecisionPrompt(agent, context) {
  const {
    memoryContext,
    survivalContext,
    worldState,
    nearbyAgentsDesc,
    locations,
    nearbyBuildings,
    canBuyFood,
    isNight,
  } = context;

  const p = agent.personality;
  const rule = `# 行为规则
${agent.rules.map((r, i) => `${i + 1}. ${r}`).join("\n") || "无特殊规则"}`;

  const pref = `# 偏好
- 喜欢去: ${agent.preferences.places.join(", ") || "无"}
- 喜欢做: ${agent.preferences.activities.join(", ") || "无"}`;

  return `你是${agent.name}，${agent.age}岁，${agent.occupation}。
性格: ${personalityDescription(p)}

${rule}

${pref}

## 你的记忆:
${memoryContext}

## 当前生存状态:
- 健康: ${agent.health.current}/${agent.health.max}
- 饱腹: ${agent.fullness}/100
- 积分: ${agent.greenPoints}
${survivalContext}

## 当前情况:
- 位置: (${agent.position.x}, ${agent.position.y})
- 时间: ${worldState.time.toLocaleString()}
- 状态: ${agent.status}
- 附近: ${nearbyAgentsDesc || "无其他人"}

## 世界中的地点: ${locations.join(", ")}

## 附近建筑服务:
${nearbyBuildings || "无"}

## 输出格式
请决定你接下来要做什么。用JSON格式输出：
{
  "action": "MOVE|TALK|WAIT|SLEEP|WORK|BUY",
  "description": "行动描述",
  "targetX": 目标x坐标(如果是移动),
  "targetY": 目标y坐标(如果是移动),
  "hourlyRate": 时薪(如果是工作，可选15-25),
  "serviceName": "服务名称(如果是购买)"
}

## 行动说明:
- MOVE: 移动到目标位置
- TALK: 与附近的人交谈
- WAIT: 原地等待
- SLEEP: 回家睡觉(恢复健康和饱腹)
- WORK: 在工作地点工作赚取积分
- BUY: 在附近建筑购买食物或服务${canBuyFood ? "，你现在就在建筑附近可以购买" : ""}

## 决策优先级（严格遵循，从高到低）:
1. 连续2天+没睡觉: 必须立即回家睡觉（SLEEP）
2. 健康<30: 优先休息恢复
3. 深夜(22:00-6:00): 必须回家睡觉（SLEEP），除非正在工作
4. 饱腹<20且积分>=5: 必须立即购买食物
5. 饱腹<20但积分<5: 必须先去工作赚钱
6. 积分<5: 优先去工作赚钱
7. 饱腹<40且积分>=5: 前往有食物的地方购买
8. 积分<30: 考虑工作赚钱储备

## 重要提醒:
- 不睡觉惩罚：1天-10健康，2天-50健康，3天昏迷
${agent.consecutiveNoSleepDays >= 1 ? `【警告】你已经${agent.consecutiveNoSleepDays}天没睡觉了！` : ""}
${isNight ? "【深夜】现在是深夜，请回家休息！" : ""}
${canBuyFood ? "你在有食物的地点附近，可以直接BUY。" : ""}

如果没有特定目标，可以随机移动到附近位置。`;
}

/**
 * 3. Conversation prompt — 替代 agent.js:991
 */
export function buildConversationPrompt(agent, targetName) {
  const p = agent.personality;
  return `你是${agent.name}，${agent.occupation}。
性格: ${personalityDescription(p)}
你的规则: ${agent.rules.join("；") || "无特殊规则"}

你正在对${targetName}说话。请用符合你性格的语气和话题说一段话（2-3句）。`;
}

/**
 * 4. Daily plan prompt — 替代 agent.js:1017
 */
export function buildPlanPrompt(agent) {
  const p = agent.personality;
  return `你是${agent.name}，${agent.age}岁，${agent.occupation}。
性格: ${personalityDescription(p)}
偏好: 喜欢去${agent.preferences.places.join("、") || "各处"}，喜欢${agent.preferences.activities.join("、") || "各种活动"}。
规则: ${agent.rules.join("；") || "无特殊规则"}

作为${agent.name}，请规划今天的活动。列出3-5个主要活动，考虑你的性格偏好和作息（${agent.routine.wakeTime}点起床，${agent.routine.sleepTime}点睡觉）。输出JSON数组：[{"time":"上午/下午/晚上","activity":"描述"}]`;
}

