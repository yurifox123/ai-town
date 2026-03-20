/**
 * 记忆类型枚举
 */
export enum MemoryType {
  OBSERVATION = 'observation',  // 环境观察
  THOUGHT = 'thought',          // 内心想法
  ACTION = 'action',            // 执行动作
  REFLECTION = 'reflection',    // 反思总结
  DIALOGUE = 'dialogue',        // 对话记录
}

/**
 * 记忆对象
 */
export interface Memory {
  id: string;
  agentId: string;
  content: string;              // 自然语言描述
  timestamp: Date;
  importance: number;           // 1-10 重要性评分
  type: MemoryType;
  embedding?: number[];         // 向量嵌入

  // 访问统计（用于检索排序）
  lastAccessed: Date;
  accessCount: number;

  // 关联记忆（用于反思）
  relatedMemoryIds?: string[];

  // 元数据
  metadata?: {
    location?: string;
    participants?: string[];
    emotion?: string;
  };
}

/**
 * 反思对象
 */
export interface Reflection {
  id: string;
  agentId: string;
  content: string;              // 高维洞察
  timestamp: Date;
  importance: number;
  sourceMemoryIds: string[];    // 来源记忆
  reflectionDepth: number;      // 反思层级（1-3）
}

/**
 * 计划类型
 */
export enum PlanType {
  LONG_TERM = 'long_term',      // 长期目标（周/月）
  DAILY = 'daily',              // 日计划
  HOURLY = 'hourly',            // 小时计划
  IMMEDIATE = 'immediate',      // 即时行动
}

/**
 * 计划对象
 */
export interface Plan {
  id: string;
  agentId: string;
  type: PlanType;
  description: string;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  parentPlanId?: string;        // 父计划ID（层级结构）
  subPlans?: string[];          // 子计划
}

/**
 * 位置坐标
 */
export interface Position {
  x: number;
  y: number;
  area?: string;                // 区域名称（如"咖啡馆"）
}

/**
 * 动作类型
 */
export enum ActionType {
  MOVE = 'move',                // 移动
  INTERACT = 'interact',        // 交互
  TALK = 'talk',                // 对话
  THINK = 'think',              // 思考
  WAIT = 'wait',                // 等待
  SLEEP = 'sleep',              // 睡眠
}

/**
 * 动作对象
 */
export interface Action {
  id: string;
  agentId: string;
  type: ActionType;
  description: string;
  targetPosition?: Position;
  targetAgentId?: string;
  targetObjectId?: string;
  duration: number;             // 持续时间（分钟）
  startTime?: Date;
}

/**
 * 观察对象
 */
export interface Observation {
  id: string;
  timestamp: Date;
  content: string;
  source: 'environment' | 'agent' | 'object';
  sourceId?: string;
  location: Position;
}

/**
 * Agent配置
 */
export interface AgentConfig {
  id: string;
  name: string;
  age: number;
  traits: string;               // 性格描述
  background: string;           // 背景故事
  goals: string[];              // 目标清单
  relationships?: Map<string, string>; // 与其他Agent的关系描述
}

/**
 * 世界状态
 */
export interface WorldState {
  time: GameTime;
  agents: Map<string, AgentState>;
  objects: Map<string, WorldObject>;
  weather: string;
  events: WorldEvent[];
}

/**
 * 游戏时间
 */
export interface GameTime {
  realTime: Date;
  gameTime: Date;
  timeScale: number;            // 时间缩放倍数（如60=现实1秒=游戏1分钟）
}

/**
 * Agent状态（用于世界同步）
 */
export interface AgentState {
  agentId: string;
  position: Position;
  currentAction?: Action;
  status: 'idle' | 'busy' | 'sleeping';
  lastUpdate: Date;
}

/**
 * 世界物体
 */
export interface WorldObject {
  id: string;
  name: string;
  type: string;
  position: Position;
  interactable: boolean;
  description: string;
  state?: Record<string, any>;  // 动态状态
}

/**
 * 世界事件
 */
export interface WorldEvent {
  id: string;
  type: string;
  description: string;
  timestamp: Date;
  location?: Position;
  affectedAgents: string[];
}

/**
 * LLM配置
 */
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'custom';
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  baseUrl?: string;
  /**
   * 自定义请求配置
   * 用于自定义供应商
   */
  custom?: {
    endpoint: string;           // API端点，如 https://api.example.com/v1/chat
    headers?: Record<string, string>;  // 自定义请求头
    responsePath?: string;      // 响应字段路径，如 'choices[0].message.content'
    embeddingEndpoint?: string; // Embedding API端点
    embeddingResponsePath?: string; // Embedding响应字段路径
  };
}

/**
 * 检索结果
 */
export interface RetrievalResult {
  memory: Memory;
  score: number;                // 综合得分
  relevance: number;            // 相关性得分
  recency: number;              // 时效性得分
  importance: number;           // 重要性得分
}
