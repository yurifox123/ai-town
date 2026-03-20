# AI小镇 🤖

基于斯坦福大学 Generative Agents 论文的多智能体模拟系统。

## 核心特性

- 🤖 **自主Agent**：每个Agent有自己的性格、记忆和目标
- 🧠 **记忆系统**：记忆流 + 反思 + 规划三层架构
- 🗺️ **虚拟世界**：2D网格环境，Agent可以移动和交互
- 💬 **自然对话**：Agent之间可以进行有意义的对话
- 🔄 **实时模拟**：游戏时间加速运行，观察Agent日常

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入你的 OpenAI API Key
```

### 3. 运行程序

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm start
```

## 项目结构

```
ai-town/
├── src/
│   ├── agent/              # Agent核心逻辑
│   │   └── agent.ts        # Agent类（感知、决策、行动）
│   ├── memory/             # 记忆系统
│   │   └── memory-system.ts # 记忆管理、检索、反思
│   ├── world/              # 世界模拟
│   │   └── simulator.ts    # 世界模拟器、时间管理
│   ├── llm/                # LLM客户端
│   │   └── client.ts       # 支持OpenAI/Claude/Ollama
│   ├── config/             # 配置管理
│   │   └── index.ts        # 应用配置、环境变量
│   ├── data/               # 数据模板
│   │   └── agent-templates.ts # 预定义Agent模板
│   ├── types/              # 类型定义
│   │   └── index.ts        # TypeScript接口
│   └── index.ts            # 程序入口
├── .env.example            # 环境变量模板
├── package.json
└── tsconfig.json
```

## 核心概念

### Agent架构

每个Agent包含：
- **记忆流**：所有感知和行动的原始记录
- **反思**：周期性总结形成的高层次洞察
- **规划**：基于反思制定的行动计划

### 记忆检索

使用相关性 + 时效性 + 重要性三维度加权检索：

```typescript
score = similarity(query, memory) × recency(memory) × importance(memory)
```

### 行为循环

```
感知环境 → 检索记忆 → 生成反思 → 制定计划 → 执行行动
```

## 自定义Agent

在 `src/index.ts` 中修改Agent配置：

```typescript
import { agentTemplates } from './data/agent-templates';

// 使用预定义模板
await world.addAgent(agentTemplates.xiaoming, { x: 5, y: 5 });

// 或自定义配置
await world.addAgent({
  id: 'agent_custom',
  name: '自定义Agent',
  age: 25,
  traits: '描述性格特点',
  background: '背景故事',
  goals: ['目标1', '目标2']
}, { x: 10, y: 10 });
```

## 环境变量配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | OpenAI API密钥 | - |
| `OPENAI_MODEL` | OpenAI模型 | gpt-4o-mini |
| `ANTHROPIC_API_KEY` | Claude API密钥 | - |
| `OLLAMA_URL` | 本地Ollama地址 | http://localhost:11434 |
| `TICK_INTERVAL_MS` | 模拟tick间隔(毫秒) | 5000 |
| `WORLD_WIDTH` | 世界宽度 | 50 |
| `WORLD_HEIGHT` | 世界高度 | 50 |
| `MAX_AGENTS` | 最大Agent数量 | 10 |

## LLM支持

支持三种LLM提供商：

1. **OpenAI**（推荐）：GPT-4o, GPT-4o-mini
2. **Anthropic Claude**：Claude 3 Haiku/Sonnet
3. **Ollama**（本地）：Llama2, Mistral等

切换LLM提供商只需修改 `.env`：
```
LLM_PROVIDER=openai  # 或 anthropic / ollama
```

## 成本优化

默认使用 GPT-4o-mini，成本约 $0.15/1M tokens。

如需降低成本：
1. 增加 `TICK_INTERVAL_MS`（降低模拟频率）
2. 使用本地模型（Ollama）
3. 使用更小的模型（如 gpt-3.5-turbo）

## 技术栈

- **TypeScript**：类型安全的JavaScript
- **Node.js**：运行时环境
- **tsx**：TypeScript执行器
- **OpenAI API**：LLM服务
- **EventEmitter**：事件驱动架构

## 参考

- [Generative Agents Paper](https://arxiv.org/abs/2304.03442)
- [官方实现](https://github.com/joonspk-research/generative_agents)
- [a16z/ai-town](https://github.com/a16z-infra/ai-town)

## License

MIT
