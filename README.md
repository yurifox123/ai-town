# AI生态小镇 🤖

基于斯坦福大学 Generative Agents 论文的多智能体模拟系统。

![AI Eco Town](https://img.shields.io/badge/AI%20Eco%20Town-Live%20Simulation-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## 在线演示

🌐 **访问地址**: http://localhost:3061 (本地运行)

## 核心特性

- 🤖 **自主Agent**：每个Agent有自己的性格、记忆和目标
- 🧠 **记忆系统**：记忆流 + 反思 + 规划三层架构
- 🗺️ **虚拟世界**：2D网格环境，Agent可以移动和交互
- 💬 **自然对话**：Agent之间可以进行有意义的对话
- 🎮 **存档系统**：支持保存/加载游戏进度
- 🔄 **实时模拟**：游戏时间加速运行，观察Agent日常
- 🌐 **Web可视化**：实时2D地图展示Agent位置和行动
- 📊 **实时监控**：通过浏览器查看Agent记忆、反思和状态
- ❤️ **生存属性**：健康值、饱腹值、绿色积分系统
- 🏘️ **小镇生态**：小镇拥有生态健康度血量系统

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入你的 API Key
```

### 3. 运行程序

```bash
# 启动 Web 可视化界面（默认）
npm start

# 然后打开浏览器访问 http://localhost:3061
```

#### CLI 命令行模式（已弃用）

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm run start:cli
```

#### Web 前端开发模式

```bash
# 带热重载的 Web 开发
npm run dev:web
```

## 项目结构

```
ai-town/
├── src/                        # TypeScript 源码
│   ├── server/                 # HTTP 服务器 + LLM 代理
│   │   └── simple-server.ts
│   ├── types/                  # 类型定义
│   ├── data/                   # 数据模板
│   └── ...                     # 其他源码
│
├── public/                     # 前端静态文件（主模拟器）
│   ├── index.html              # 主页面
│   ├── styles.css              # 游戏风格样式
│   └── js/
│       ├── app.js              # 主应用逻辑
│       ├── agent.js            # Agent 类（感知、决策、行动）
│       ├── simulator.js        # 世界模拟器
│       ├── memory.js           # 记忆系统
│       ├── renderer.js         # 画布渲染
│       └── asset-config.js     # 素材配置
│
└── public/assets/              # 游戏素材
    ├── characters/             # 角色精灵图
    ├── portraits/              # 角色头像
    ├── buildings/              # 建筑贴图
    └── tiles/                  # 地面贴图
```

## 游戏界面

### 主界面
- **顶部状态栏**：游戏时间、Tick 计数、小镇生态健康度
- **中央地图**：2D 网格世界，显示角色位置和建筑
- **右侧面板**：居民列表、事件日志、快捷操作

### 角色交互
- **点击地图角色**：弹出属性卡片（头像、健康/饱腹条、积分、当前动作）
- **点击居民列表**：查看角色详情弹窗
- **详情弹窗**：记忆、反思、背景故事、生存属性条形图

### 地图编辑
- 切换编辑模式可修改地图
- 添加/删除建筑
- 绘制地面（草地、土路、水域）

## 核心概念

### Agent 架构
每个Agent包含：
- **记忆流**：所有感知和行动的原始记录
- **反思**：周期性总结形成的高层次洞察
- **规划**：基于反思制定的行动计划

### 记忆检索
使用相关性 + 时效性 + 重要性三维度加权检索：

```
综合得分 = 相似度(query, memory) × 0.6 + 时效性 × 0.2 + 重要性 × 0.2
```

### 行为循环
```
感知环境 → 检索记忆 → 生成反思 → 制定计划 → 执行行动
```

### 生存属性
- **健康值** (0-100)：角色生命值，影响行动能力
- **饱腹值** (0-100)：饥饿程度，需要定期进食
- **绿色积分**：小镇货币系统
- **小镇生态健康度**：整个小镇的环境状态

## 当前角色

| 角色 | 年龄 | 性格 | 职业 | 健康上限 | 饱腹初始 |
|------|------|------|------|---------|---------|
| 小明 | 25 | 开朗活泼 | 软件工程师 | 100 | 80 |
| 小红 | 24 | 温柔细腻 | 图书管理员 | 85 | 75 |
| 小米 | 22 | 活泼可爱 | 美食博主 | 90 | 70 |
| 小东 | 26 | 沉稳内敛 | 健身教练 | 100 | 90 |

## 环境变量配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_PROVIDER` | LLM 供应商 (openai/anthropic/ollama/custom) | custom |
| `CUSTOM_API_KEY` | API 密钥 | - |
| `CUSTOM_ENDPOINT` | 自定义 API 端点 | - |
| `TICK_INTERVAL_MS` | 模拟 tick 间隔(毫秒) | 5000 |
| `WORLD_WIDTH` | 世界宽度 | 50 |
| `WORLD_HEIGHT` | 世界高度 | 50 |
| `MAX_AGENTS` | 最大 Agent 数量 | 10 |

## LLM 支持

支持多种 LLM 提供商：

1. **OpenAI**：GPT-4o, GPT-4o-mini
2. **Anthropic Claude**：Claude 3 Haiku/Sonnet
3. **Ollama**（本地）：Llama2, Mistral 等
4. **自定义 API**：通过环境变量配置

当前默认使用 **Kimi K2.5**  via 阿里云 DashScope。

## 技术栈

- **前端**：原生 JavaScript (ES6+), Canvas API
- **后端**：Node.js, TypeScript
- **架构**：Web-First，浏览器运行模拟，服务器仅提供 LLM 代理
- **通信**：EventTarget 事件驱动

## 参考

- [Generative Agents Paper](https://arxiv.org/abs/2304.03442)
- [官方实现](https://github.com/joonspk-research/generative_agents)
- [a16z/ai-town](https://github.com/a16z-infra/ai-town)

## License

MIT
