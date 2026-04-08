/**
 * AI 生态小镇前端主应用 - 增强版
 * 支持图片精灵渲染和加载界面
 */
import WorldSimulator from './simulator.js';
import LLMClient from './llm-client.js';
import imageLoader from './image-loader.js';
import { getCharacterSprite, getCharacterPortrait, getBuildingSprite, getCharacterDisplaySize, getBuildingDisplaySize } from './asset-config.js';

// ========== 配置 ==========
const CONFIG = {
  MAP_CELL_SIZE: 16,
  MAP_GRID_COLOR: '#1e3a5f',
  AGENT_COLOR: '#e94560',
  BUILDING_COLOR: '#4a90d9',
  AREA_COLOR: '#28a745',
  REFRESH_RATE: 1000 / 30,
  TICK_INTERVAL: 5000,
  WORLD_WIDTH: 50,
  WORLD_HEIGHT: 50,
  TIME_SCALE: 5, // 1秒现实时间 = 5分钟游戏时间
  SHOW_GRID: false,
  SPRITE_SCALE: 1.0
};

// ========== Agent 模板 ==========
const agentTemplates = {
  xiaoming: {
    id: 'xiaoming',
    name: '小明',
    age: 25,
    traits: '开朗活泼，喜欢社交，热爱咖啡和音乐',
    background: '一名软件工程师，在一家互联网公司工作。喜欢尝试新事物，周末经常和朋友聚会。',
    goals: ['学习新技能', '结交新朋友', '保持健康生活方式'],
    healthMax: 100,
    greenPoints: 10,
    fullness: 80
  },
  xiaohong: {
    id: 'xiaohong',
    name: '小红',
    age: 24,
    traits: '温柔细腻，喜欢阅读，安静内敛',
    background: '一名图书管理员，热爱文学和艺术。喜欢在咖啡馆看书，享受独处时光。',
    goals: ['读完 100 本书', '学习绘画', '开一家咖啡馆'],
    healthMax: 85,
    greenPoints: 10,
    fullness: 75
  },
  xiaomi: {
    id: 'xiaomi',
    name: '小米',
    age: 22,
    traits: '活泼可爱，喜欢美食，乐观向上',
    background: '一名美食博主，喜欢探索各种美食。性格开朗，总是能给身边的人带来快乐。',
    goals: ['成为顶级美食博主', '开一家餐厅', '环游世界品尝美食'],
    healthMax: 90,
    greenPoints: 10,
    fullness: 70
  },
  xiaodong: {
    id: 'xiaodong',
    name: '小东',
    age: 26,
    traits: '沉稳内敛，喜欢运动，注重健康',
    background: '一名健身教练，热爱各种运动。生活规律，是朋友们的健康顾问。',
    goals: ['帮助更多人健康生活', '参加马拉松比赛', '开一家健身房'],
    healthMax: 100,
    greenPoints: 10,
    fullness: 90
  }
};

// ========== 全局状态 ==========
const state = {
  world: null,
  llm: null,
  simulationRunning: false,
  selectedAgent: null,
  canvas: null,
  ctx: null,
  animationId: null,
  hoveredElement: null,
  // 编辑模式状态
  isEditMode: false,
  editorTool: 'select', // select, ground, path, building, eraser
  editorTerrain: 'grass', // grass, path, water
  editorSelectedBuilding: null,
  editorBuildings: [], // 编辑中的建筑列表
  mapData: null // 地图数据 (地面类型)
};

// ========== DOM 元素缓存 ==========
let elements = {};

// 编辑模式状态
let isDragging = false;
let isPainting = false;
let dragBuilding = null;
let dragOffset = { x: 0, y: 0 };
let lastPaintedCell = null;

// 撤销/重做历史
const editHistory = {
  stack: [],
  index: -1,
  maxSize: 50
};

// 对话气泡管理
const dialogueBubbles = new Map();

function showDialogueBubble(agentId, message) {
  dialogueBubbles.set(agentId, {
    message,
    timestamp: Date.now()
  });

  // 3秒后自动消失
  setTimeout(() => {
    dialogueBubbles.delete(agentId);
  }, 3000);
}

// ========== 初始化 ==========
async function init() {
  console.log('🎮 AI 生态小镇前端初始化中...');

  // 显示加载界面
  showLoadingScreen();

  // 预加载所有图片
  console.log('📸 正在加载图片素材...');
  await imageLoader.preloadAll((progress) => {
    updateLoadingProgress(progress);
  });

  // 初始化 LLM 客户端
  state.llm = new LLMClient();

  // 初始化世界模拟器
  state.world = new WorldSimulator(
    CONFIG.WORLD_WIDTH,
    CONFIG.WORLD_HEIGHT,
    CONFIG.TIME_SCALE,
    state.llm
  );

  // 设置事件监听
  setupWorldListeners();
  setupUIListeners();

  // 初始化画布
  initCanvas();

  // 隐藏加载界面
  hideLoadingScreen();

  // 开始渲染循环
  startRenderLoop();

  // 添加默认 Agent
  await addDefaultAgents();

  // 初始化编辑模式（在 world 数据准备好后）
  initEditor();

  // 更新 UI
  updateUI();

  console.log('✅ AI 生态小镇初始化完成');
}

// ========== 加载界面 ==========
function showLoadingScreen() {
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loading-screen';
  loadingDiv.className = 'loading-screen';
  loadingDiv.innerHTML = `
    <div class="loading-content">
      <h2>🏘️ AI 生态小镇</h2>
      <p>正在加载世界...</p>
      <div class="loading-bar">
        <div class="loading-progress" id="loading-progress"></div>
      </div>
      <p id="loading-text">0%</p>
    </div>
  `;
  document.body.appendChild(loadingDiv);
  elements.loadingScreen = loadingDiv;
  elements.loadingProgress = document.getElementById('loading-progress');
  elements.loadingText = document.getElementById('loading-text');
}

function updateLoadingProgress(progress) {
  if (elements.loadingProgress) {
    elements.loadingProgress.style.width = `${progress}%`;
  }
  if (elements.loadingText) {
    elements.loadingText.textContent = `${Math.round(progress)}%`;
  }
}

function hideLoadingScreen() {
  if (elements.loadingScreen) {
    elements.loadingScreen.classList.add('hidden');
    setTimeout(() => {
      elements.loadingScreen.remove();
    }, 500);
  }
}

// ========== 世界事件监听 ==========
function setupWorldListeners() {
  state.world.addEventListener('tick', (e) => {
    const { time, tickCount, townHealth } = e.detail;
    updateGameTime(time);
    updateTickCount(tickCount);
    updateTownHealth(townHealth);
    renderAgentList();
  });

  // 实时时间更新（每秒触发）
  state.world.addEventListener('timeUpdate', (e) => {
    updateGameTime(e.detail.time);
    updateTownHealth(e.detail.townHealth);
  });

  state.world.addEventListener('agentJoined', (e) => {
    addEvent({
      type: 'system',
      description: `Agent ${e.detail.name} 加入了世界`,
      timestamp: new Date()
    });
    renderAgentList();
  });

  state.world.addEventListener('agentLeft', (e) => {
    renderAgentList();
  });

  state.world.addEventListener('event', (e) => {
    addEvent(e.detail);
  });

  state.world.addEventListener('started', () => {
    state.simulationRunning = true;
    updateSimulationStatus();
  });

  state.world.addEventListener('dialogue', (e) => {
    showDialogueBubble(e.detail.agentId, e.detail.message);
  });
}

// ========== UI 事件监听 ==========
function setupUIListeners() {
  // 控制按钮
  document.getElementById('btn-start').addEventListener('click', () => {
    state.world.start();
  });
  document.getElementById('btn-stop').addEventListener('click', () => {
    state.world.stop();
  });
  document.getElementById('btn-reset').addEventListener('click', () => {
    state.world.reset();
  });
  document.getElementById('btn-step').addEventListener('click', async () => {
    await state.world.step();
  });

  // 快捷操作
  document.getElementById('btn-add-agent').addEventListener('click', () => {
    showModal('add-agent-modal');
  });
  document.getElementById('btn-trigger-event').addEventListener('click', () => {
    showModal('event-modal');
  });
  document.getElementById('btn-clear-log').addEventListener('click', () => {
    document.getElementById('event-log').innerHTML = '<div class="empty-state">暂无事件</div>';
  });

  // 停止服务器
  document.getElementById('btn-stop-server').addEventListener('click', async () => {
    if (confirm('确定要停止服务器吗？')) {
      try {
        await fetch('/api/stop', { method: 'POST' });
      } catch (e) {
        console.log('服务器已停止');
      }
    }
  });

  // 模态框关闭
  document.getElementById('btn-close-modal').addEventListener('click', () => {
    hideModal('agent-modal');
  });
  document.getElementById('btn-close-add-modal').addEventListener('click', () => {
    hideModal('add-agent-modal');
  });
  document.getElementById('btn-close-event-modal').addEventListener('click', () => {
    hideModal('event-modal');
  });

  // 表单提交
  document.getElementById('add-agent-form').addEventListener('submit', handleAddAgent);
  document.getElementById('event-form').addEventListener('submit', handleTriggerEvent);

  // Tab 切换
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById(`tab-${tabName}`).classList.add('active');
    });
  });

  // 角色属性卡片事件
  setupAgentCardListeners();
}

// ========== 画布初始化 ==========
function initCanvas() {
  state.canvas = document.getElementById('world-map');
  state.ctx = state.canvas.getContext('2d');

  const container = state.canvas.parentElement;
  const maxWidth = container.clientWidth - 40;
  const maxHeight = container.clientHeight - 40;

  const cellSize = CONFIG.MAP_CELL_SIZE;
  const width = CONFIG.WORLD_WIDTH * cellSize;
  const height = CONFIG.WORLD_HEIGHT * cellSize;

  const scale = Math.min(maxWidth / width, maxHeight / height, 1);

  state.canvas.width = width;
  state.canvas.height = height;
  state.canvas.style.width = `${width * scale}px`;
  state.canvas.style.height = `${height * scale}px`;

  // 画布交互
  state.canvas.addEventListener('mousemove', handleMouseMove);
  state.canvas.addEventListener('click', handleCanvasClick);
  state.canvas.addEventListener('mousedown', handleCanvasMouseDown);
  state.canvas.addEventListener('mouseup', handleCanvasMouseUp);
  state.canvas.addEventListener('mouseleave', () => {
    hideTooltip();
    state.hoveredElement = null;
    isPainting = false;
    isDragging = false;
    dragBuilding = null;
  });

  // 键盘事件（撤销/重做）
  document.addEventListener('keydown', handleEditorKeyDown);
}

// ========== 渲染循环 ==========
function startRenderLoop() {
  function render() {
    drawMap();
    state.animationId = requestAnimationFrame(render);
  }
  render();
}

// ========== 地图绘制 ==========
function drawMap() {
  if (!state.ctx) return;

  const ctx = state.ctx;
  const cellSize = CONFIG.MAP_CELL_SIZE;
  const width = CONFIG.WORLD_WIDTH;
  const height = CONFIG.WORLD_HEIGHT;

  // 编辑模式下使用 mapData 绘制地面
  if (state.isEditMode && state.mapData) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const terrain = state.mapData[y]?.[x] || 'grass';
        drawTerrain(ctx, x, y, terrain, cellSize);
      }
    }
  } else {
    // 正常模式使用草地纹理
    const grassImage = imageLoader.getImage('/assets/tiles/grass.png');
    if (grassImage) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          ctx.drawImage(grassImage, x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    } else {
      ctx.fillStyle = '#0d1b2a';
      ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
    }
  }

  // 绘制网格
  if (CONFIG.SHOW_GRID || state.isEditMode) {
    ctx.strokeStyle = state.isEditMode ? 'rgba(255, 255, 255, 0.2)' : CONFIG.MAP_GRID_COLOR;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; x <= width; x++) {
      ctx.moveTo(x * cellSize, 0);
      ctx.lineTo(x * cellSize, height * cellSize);
    }
    for (let y = 0; y <= height; y++) {
      ctx.moveTo(0, y * cellSize);
      ctx.lineTo(width * cellSize, y * cellSize);
    }
    ctx.stroke();
  }

  // 编辑模式下绘制编辑中的建筑
  if (state.isEditMode) {
    for (const building of state.editorBuildings) {
      drawEditorBuilding(ctx, building, cellSize);
    }
  } else {
    // 正常模式绘制世界中的物体
    const worldState = state.world.getWorldState();

    // 绘制路径
    drawPaths(ctx, cellSize);

    // 绘制建筑
    for (const obj of worldState.objects.values()) {
      drawObject(ctx, obj, cellSize);
    }

    // 绘制 Agent
    for (const agentState of worldState.agents.values()) {
      drawAgent(ctx, agentState, cellSize);
    }
  }
}

function drawTerrain(ctx, x, y, terrain, cellSize) {
  const px = x * cellSize;
  const py = y * cellSize;

  switch (terrain) {
    case 'grass':
      ctx.fillStyle = '#1a2f3d';
      ctx.fillRect(px, py, cellSize, cellSize);
      // 添加一些纹理
      if ((x + y) % 4 === 0) {
        ctx.fillStyle = '#1e3545';
        ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
      }
      break;
    case 'path':
      ctx.fillStyle = '#c9b896';
      ctx.fillRect(px, py, cellSize, cellSize);
      ctx.strokeStyle = '#b8a685';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px, py, cellSize, cellSize);
      break;
    case 'water':
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(px, py, cellSize, cellSize);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(px, py + cellSize / 2, cellSize, cellSize / 2);
      break;
    default:
      ctx.fillStyle = '#1a2f3d';
      ctx.fillRect(px, py, cellSize, cellSize);
  }
}

function drawEditorBuilding(ctx, building, cellSize) {
  const x = building.x * cellSize;
  const y = building.y * cellSize;
  const w = building.width * cellSize;
  const h = building.height * cellSize;

  // 绘制建筑图片或占位符
  if (building.image) {
    const img = new Image();
    img.src = building.image;
    if (img.complete) {
      ctx.drawImage(img, x, y, w, h);
    } else {
      drawBuildingPlaceholder(ctx, x, y, w, h, building);
    }
  } else {
    drawBuildingPlaceholder(ctx, x, y, w, h, building);
  }

  // 选中高亮
  if (state.editorSelectedBuilding?.id === building.id) {
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
  }

  // 名称标签
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  const nameWidth = ctx.measureText(building.name).width + 10;
  ctx.fillRect(x + (w - nameWidth) / 2, y - 18, nameWidth, 16);
  ctx.fillStyle = '#fff';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(building.name, x + w / 2, y - 6);
}

function drawBuildingPlaceholder(ctx, x, y, w, h, building) {
  // 背景
  ctx.fillStyle = building.obstacle ? 'rgba(231, 76, 60, 0.3)' : 'rgba(46, 204, 113, 0.3)';
  ctx.fillRect(x, y, w, h);

  // 边框
  ctx.strokeStyle = building.obstacle ? '#e74c3c' : '#2ecc71';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  // ID文字
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(building.id, x + w / 2, y + h / 2);
}

// ========== 路径绘制 ==========
function drawPaths(ctx, cellSize) {
  const pathImage = imageLoader.getImage('/assets/tiles/path.png');

  // 笔直的道路网格 - 主街道
  const roadWidth = 2; // 道路宽度2格

  // 水平主干道 (y = 10, 25)
  for (let x = 0; x < CONFIG.WORLD_WIDTH; x++) {
    for (let w = 0; w < roadWidth; w++) {
      // 主干道1
      drawRoadTile(ctx, x, 10 + w, cellSize, pathImage);
      // 主干道2
      drawRoadTile(ctx, x, 25 + w, cellSize, pathImage);
    }
  }

  // 垂直主干道 (x = 10, 25, 40)
  for (let y = 0; y < CONFIG.WORLD_HEIGHT; y++) {
    for (let w = 0; w < roadWidth; w++) {
      // 主街道1
      drawRoadTile(ctx, 10 + w, y, cellSize, pathImage);
      // 主街道2
      drawRoadTile(ctx, 25 + w, y, cellSize, pathImage);
      // 主街道3
      drawRoadTile(ctx, 40 + w, y, cellSize, pathImage);
    }
  }
}

function drawRoadTile(ctx, x, y, cellSize, pathImage) {
  if (x >= CONFIG.WORLD_WIDTH || y >= CONFIG.WORLD_HEIGHT) return;

  const px = x * cellSize;
  const py = y * cellSize;

  if (pathImage) {
    ctx.drawImage(pathImage, px, py, cellSize, cellSize);
  } else {
    // 道路底色
    ctx.fillStyle = '#c9b896';
    ctx.fillRect(px, py, cellSize, cellSize);
    // 道路边缘线
    ctx.strokeStyle = '#b8a685';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(px, py, cellSize, cellSize);
  }
}

// ========== 建筑绘制 ==========
function drawObject(ctx, obj, cellSize) {
  const x = obj.position.x * cellSize;
  const y = obj.position.y * cellSize;

  // 尝试获取建筑图片
  const spritePath = getBuildingSprite(obj.id);
  const sprite = spritePath ? imageLoader.getImage(spritePath) : null;
  const displaySize = getBuildingDisplaySize(obj.id);

  if (sprite) {
    const drawWidth = displaySize[0] * CONFIG.SPRITE_SCALE;
    const drawHeight = displaySize[1] * CONFIG.SPRITE_SCALE;

    // 绘制建筑
    ctx.drawImage(sprite, x - drawWidth / 2, y - drawHeight / 2, drawWidth, drawHeight);
  } else {
    // 回退到原始矩形
    const size = cellSize * 3;
    switch (obj.type) {
      case 'building':
        ctx.fillStyle = CONFIG.BUILDING_COLOR;
        break;
      case 'area':
        ctx.fillStyle = CONFIG.AREA_COLOR;
        break;
      default:
        ctx.fillStyle = '#6c757d';
    }
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
  }

  // 名称标签
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  const textMeasure = ctx.measureText(obj.name);
  const nameWidth = textMeasure.width + 10;
  const labelY = y + (sprite ? displaySize[1] : cellSize * 3) / 2 + 6;
  ctx.fillRect(x - nameWidth / 2, labelY - 12, nameWidth, 18);
  
  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(obj.name, x, labelY + 2);
}

// ========== Agent 绘制 ==========
function drawAgent(ctx, agent, cellSize) {
  const x = agent.position.x * cellSize;
  const y = agent.position.y * cellSize;

  // 获取角色图片
  const spritePath = getCharacterSprite(agent.agentId);
  const sprite = spritePath ? imageLoader.getImage(spritePath) : null;
  const displaySize = getCharacterDisplaySize(agent.agentId);

  if (sprite) {
    const drawWidth = displaySize[0] * CONFIG.SPRITE_SCALE;
    const drawHeight = displaySize[1] * CONFIG.SPRITE_SCALE;
    
    // 绘制阴影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + drawHeight / 2 - 2, drawWidth / 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制角色
    ctx.drawImage(sprite, x - drawWidth / 2, y - drawHeight / 2, drawWidth, drawHeight);
  } else {
    // 回退到圆形
    const radius = cellSize * 0.8;
    ctx.beginPath();
    ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
    switch (agent.status) {
      case 'busy': ctx.fillStyle = '#ffc107'; break;
      case 'sleeping': ctx.fillStyle = '#6c757d'; break;
      default: ctx.fillStyle = '#28a745';
    }
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.AGENT_COLOR;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 状态指示点
  const statusColors = { idle: '#28a745', busy: '#ffc107', sleeping: '#6c757d', moving: '#17a2b8' };
  const statusColor = statusColors[agent.status] || '#28a745';
  const offsetX = sprite ? displaySize[0] / 2 : cellSize / 2;
  const offsetY = sprite ? displaySize[1] / 2 : cellSize / 2;
  
  ctx.beginPath();
  ctx.arc(x + offsetX - 10, y + offsetY - 10, 5, 0, Math.PI * 2);
  ctx.fillStyle = statusColor;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 名字标签
  const nameY = y - (sprite ? displaySize[1] : cellSize) / 2 - 8;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  const nameWidth = ctx.measureText(agent.name).width + 10;
  ctx.fillRect(x - nameWidth / 2, nameY - 12, nameWidth, 16);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(agent.name, x, nameY);

  // 计算需要显示的气泡
  const hasAction = agent.currentAction && (typeof agent.currentAction === 'object' ? agent.currentAction.description : agent.currentAction);
  const hasDialogue = dialogueBubbles.has(agent.agentId);

  // 基础Y位置（名字上方）
  const baseY = nameY - 15;
  let currentBubbleY = baseY;

  // 绘制对话气泡（在下面）
  if (hasDialogue) {
    const bubble = dialogueBubbles.get(agent.agentId);
    const paddingY = 6;
    const fixedWidth = 120;
    const lineHeight = 14;
    const fontSize = 10;
    const maxCharsPerLine = 18;

    // 处理文字换行
    const lines = [];
    for (let i = 0; i < bubble.message.length; i += maxCharsPerLine) {
      lines.push(bubble.message.substring(i, i + maxCharsPerLine));
    }

    const bubbleWidth = fixedWidth;
    const bubbleHeight = paddingY * 2 + lines.length * lineHeight;
    const bubbleBottomY = currentBubbleY;
    const bubbleTopY = bubbleBottomY - bubbleHeight;

    // 绘制气泡背景（对话气泡用蓝色系区分）
    ctx.fillStyle = 'rgba(200, 230, 255, 0.95)';
    ctx.strokeStyle = '#4a90d9';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - bubbleWidth / 2, bubbleTopY, bubbleWidth, bubbleHeight, 8);
    ctx.fill();
    ctx.stroke();

    // 绘制小三角
    ctx.beginPath();
    ctx.moveTo(x - 6, bubbleBottomY);
    ctx.lineTo(x, bubbleBottomY + 6);
    ctx.lineTo(x + 6, bubbleBottomY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 绘制文字
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.font = fontSize + 'px sans-serif';
    // 垂直居中：起始位置 = 顶部 + 内边距 + 字体基线偏移
    const startY = bubbleTopY + paddingY + fontSize;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, startY + i * lineHeight);
    }

    // 下一个气泡位置向上堆叠
    currentBubbleY = bubbleTopY - 4;
  }

  // 绘制动作气泡（在上面）
  if (hasAction) {
    const desc = typeof agent.currentAction === 'object' ? agent.currentAction.description : agent.currentAction;
    const paddingY = 6;
    const maxCharsPerLine = 8;
    const lineHeight = 14;
    const fontSize = 10;

    // 处理文字换行
    const lines = [];
    for (let i = 0; i < desc.length; i += maxCharsPerLine) {
      lines.push(desc.substring(i, i + maxCharsPerLine));
    }

    const bubbleWidth = 110;
    const bubbleHeight = paddingY * 2 + lines.length * lineHeight;
    const bubbleBottomY = currentBubbleY;
    const bubbleTopY = bubbleBottomY - bubbleHeight;

    // 绘制气泡背景（动作气泡用黄色系）
    ctx.fillStyle = 'rgba(255, 250, 220, 0.95)';
    ctx.strokeStyle = '#e6a23c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - bubbleWidth / 2, bubbleTopY, bubbleWidth, bubbleHeight, 6);
    ctx.fill();
    ctx.stroke();

    // 绘制小三角
    ctx.beginPath();
    ctx.moveTo(x - 6, bubbleBottomY);
    ctx.lineTo(x, bubbleBottomY + 6);
    ctx.lineTo(x + 6, bubbleBottomY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 绘制文字
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.font = fontSize + 'px sans-serif';
    // 垂直居中：起始位置 = 顶部 + 内边距 + 字体基线偏移
    const startY = bubbleTopY + paddingY + fontSize;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, startY + i * lineHeight);
    }

    // 如果没有对话气泡，三角形指向下方的名字；如果有，三角形指向下方气泡
    // 这里已经通过 bubbleBottomY 位置自动实现了
  }

  // 睡眠效果
  if (agent.status === 'sleeping') {
    const sleepImage = imageLoader.getImage('/assets/ui/sleep-zzz.png');
    // 计算睡眠效果位置（在最上方气泡的上面）
    let sleepY = currentBubbleY - 25;
    if (!hasAction && !hasDialogue) {
      sleepY = baseY - 10;
    }
    if (sleepImage) {
      const oscillation = Math.sin(Date.now() / 500) * 3;
      ctx.drawImage(sleepImage, x + 15, sleepY + oscillation, 20, 20);
    } else {
      ctx.fillStyle = '#6495ed';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Zzz...', x + 15, sleepY + 10);
    }
  }
}

// ========== 交互处理 ==========
function handleMouseMove(e) {
  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  const mouseX = (e.clientX - rect.left) * scaleX;
  const mouseY = (e.clientY - rect.top) * scaleY;
  const cellSize = CONFIG.MAP_CELL_SIZE;

  // 编辑模式下的拖拽和绘制
  if (state.isEditMode) {
    if (isDragging && dragBuilding) {
      // 拖拽建筑
      const gridX = Math.floor(mouseX / cellSize) - dragOffset.x;
      const gridY = Math.floor(mouseY / cellSize) - dragOffset.y;

      // 边界检查
      dragBuilding.x = Math.max(0, Math.min(gridX, CONFIG.WORLD_WIDTH - dragBuilding.width));
      dragBuilding.y = Math.max(0, Math.min(gridY, CONFIG.WORLD_HEIGHT - dragBuilding.height));
      return;
    }

    if (isPainting && state.editorTool !== 'select') {
      // 连续绘制地形
      const gridX = Math.floor(mouseX / cellSize);
      const gridY = Math.floor(mouseY / cellSize);

      // 避免重复绘制同一格
      if (lastPaintedCell?.x !== gridX || lastPaintedCell?.y !== gridY) {
        lastPaintedCell = { x: gridX, y: gridY };

        if (gridX >= 0 && gridX < CONFIG.WORLD_WIDTH && gridY >= 0 && gridY < CONFIG.WORLD_HEIGHT) {
          if (state.editorTool === 'ground' || state.editorTool === 'path') {
            paintTerrain(gridX, gridY, state.editorTerrain);
          } else if (state.editorTool === 'eraser') {
            eraseAt(gridX, gridY);
          }
        }
      }
      return;
    }
  }

  const worldState = state.world.getWorldState();
  let hovered = null;

  // 检查 Agent
  for (const agent of worldState.agents.values()) {
    const displaySize = getCharacterDisplaySize(agent.agentId);
    const drawWidth = displaySize[0] * CONFIG.SPRITE_SCALE;
    const drawHeight = displaySize[1] * CONFIG.SPRITE_SCALE;
    const ax = agent.position.x * cellSize;
    const ay = agent.position.y * cellSize;

    if (mouseX >= ax - drawWidth / 2 && mouseX <= ax + drawWidth / 2 &&
        mouseY >= ay - drawHeight / 2 && mouseY <= ay + drawHeight / 2) {
      hovered = { type: 'agent', data: agent };
      break;
    }
  }

  // 检查建筑
  if (!hovered) {
    for (const obj of worldState.objects.values()) {
      const displaySize = getBuildingDisplaySize(obj.id);
      const drawWidth = displaySize[0] * CONFIG.SPRITE_SCALE;
      const drawHeight = displaySize[1] * CONFIG.SPRITE_SCALE;
      const ox = obj.position.x * cellSize;
      const oy = obj.position.y * cellSize;

      if (mouseX >= ox - drawWidth / 2 * 1.5 && mouseX <= ox + drawWidth / 2 * 1.5 &&
          mouseY >= oy - drawHeight / 2 * 1.5 && mouseY <= oy + drawHeight / 2 * 1.5) {
        hovered = { type: 'object', data: obj };
        break;
      }
    }
  }

  if (hovered) {
    showTooltip(e.clientX, e.clientY, hovered);
    state.hoveredElement = hovered;
  } else {
    hideTooltip();
    state.hoveredElement = null;
  }
}

function handleCanvasClick(e) {
  // 编辑模式下使用编辑器点击处理
  if (state.isEditMode) {
    handleCanvasClickForEditor(e);
    return;
  }

  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  const mouseX = (e.clientX - rect.left) * scaleX;
  const mouseY = (e.clientY - rect.top) * scaleY;
  const cellSize = CONFIG.MAP_CELL_SIZE;

  const worldState = state.world.getWorldState();

  for (const agent of worldState.agents.values()) {
    const displaySize = getCharacterDisplaySize(agent.agentId);
    const drawWidth = displaySize[0] * CONFIG.SPRITE_SCALE;
    const drawHeight = displaySize[1] * CONFIG.SPRITE_SCALE;
    const ax = agent.position.x * cellSize;
    const ay = agent.position.y * cellSize;

    if (mouseX >= ax - drawWidth / 2 && mouseX <= ax + drawWidth / 2 &&
        mouseY >= ay - drawHeight / 2 && mouseY <= ay + drawHeight / 2) {
      // 显示属性卡片
      showAgentCard(agent, e.clientX, e.clientY);
      return;
    }
  }

  // 点击空白处关闭卡片
  hideAgentCard();
}

// ========== 角色属性卡片 ==========

function showAgentCard(agent, clickX, clickY) {
  const card = document.getElementById('agent-card');
  if (!card) return;

  // 填充数据
  const portraitPath = getCharacterPortrait(agent.agentId);
  const portraitImg = document.getElementById('agent-card-portrait');
  if (portraitImg) {
    portraitImg.src = portraitPath || '';
    portraitImg.onerror = () => { portraitImg.style.display = 'none'; };
    portraitImg.onload = () => { portraitImg.style.display = 'block'; };
  }

  document.getElementById('agent-card-name').textContent = agent.name;
  document.getElementById('agent-card-status').textContent = agent.status;

  // 健康条
  const healthCurrent = agent.health?.current ?? 0;
  const healthMax = agent.health?.max ?? 100;
  const healthPercent = healthMax > 0 ? (healthCurrent / healthMax) * 100 : 0;
  document.getElementById('agent-card-health-bar').style.width = `${healthPercent}%`;
  document.getElementById('agent-card-health-text').textContent = `${healthCurrent}/${healthMax}`;

  // 饱腹条
  const fullnessValue = agent.fullness ?? 0;
  const fullnessPercent = Math.min(Math.max(fullnessValue, 0), 100);
  document.getElementById('agent-card-fullness-bar').style.width = `${fullnessPercent}%`;
  document.getElementById('agent-card-fullness-text').textContent = `${fullnessValue}/100`;

  // 积分
  document.getElementById('agent-card-points').textContent = (agent.greenPoints ?? 0).toLocaleString();

  // 当前动作
  const actionDesc = typeof agent.currentAction === 'object' ? agent.currentAction?.description : agent.currentAction;
  document.getElementById('agent-card-action').textContent = actionDesc || '空闲';

  // 定位卡片
  const container = document.querySelector('.map-container');
  const containerRect = container.getBoundingClientRect();
  const cardWidth = 240;
  const cardHeight = 180;

  let left = clickX - containerRect.left + 10;
  let top = clickY - containerRect.top + 10;

  // 边界检查
  if (left + cardWidth > containerRect.width) {
    left = clickX - containerRect.left - cardWidth - 10;
  }
  if (top + cardHeight > containerRect.height) {
    top = clickY - containerRect.top - cardHeight - 10;
  }

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.classList.remove('hidden');
}

function hideAgentCard() {
  const card = document.getElementById('agent-card');
  if (card) {
    card.classList.add('hidden');
  }
}

function setupAgentCardListeners() {
  // 关闭按钮
  document.getElementById('agent-card-close')?.addEventListener('click', hideAgentCard);

  // 点击卡片外部关闭（通过阻止事件冒泡实现）
  document.getElementById('agent-card')?.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

// ========== 编辑模式鼠标事件 ==========
function handleCanvasMouseDown(e) {
  if (!state.isEditMode) return;

  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  const mouseX = (e.clientX - rect.left) * scaleX;
  const mouseY = (e.clientY - rect.top) * scaleY;
  const cellSize = CONFIG.MAP_CELL_SIZE;

  const gridX = Math.floor(mouseX / cellSize);
  const gridY = Math.floor(mouseY / cellSize);

  if (state.editorTool === 'select') {
    // 尝试选中并拖拽建筑
    const building = state.editorBuildings?.find(b =>
      gridX >= b.x && gridX < b.x + b.width &&
      gridY >= b.y && gridY < b.y + b.height
    );

    if (building) {
      isDragging = true;
      dragBuilding = building;
      dragOffset = { x: gridX - building.x, y: gridY - building.y };
      state.editorSelectedBuilding = building;
      renderBuildingListInEditor();
      renderEditorBuildingProperties();
    }
  } else if (state.editorTool === 'ground' || state.editorTool === 'path' || state.editorTool === 'eraser') {
    // 开始连续绘制
    isPainting = true;
    lastPaintedCell = { x: gridX, y: gridY };

    // 保存历史记录
    saveEditHistory();

    if (state.editorTool === 'eraser') {
      eraseAt(gridX, gridY);
    } else {
      paintTerrain(gridX, gridY, state.editorTerrain);
    }
  }
}

function handleCanvasMouseUp(e) {
  if (!state.isEditMode) return;

  if (isDragging && dragBuilding) {
    // 拖拽结束，保存位置变更
    console.log(`建筑 ${dragBuilding.name} 移动到 (${dragBuilding.x}, ${dragBuilding.y})`);
    saveEditHistory();
  }

  isDragging = false;
  isPainting = false;
  dragBuilding = null;
  lastPaintedCell = null;
}

// ========== 撤销/重做功能 ==========
function saveEditHistory() {
  // 如果不在历史末尾，删除后面的历史
  if (editHistory.index < editHistory.stack.length - 1) {
    editHistory.stack = editHistory.stack.slice(0, editHistory.index + 1);
  }

  // 保存当前状态
  const snapshot = {
    mapData: state.mapData?.map(row => [...row]),
    buildings: state.editorBuildings?.map(b => ({ ...b }))
  };

  editHistory.stack.push(snapshot);

  // 限制历史记录大小
  if (editHistory.stack.length > editHistory.maxSize) {
    editHistory.stack.shift();
  } else {
    editHistory.index++;
  }
}

function undo() {
  if (editHistory.index > 0) {
    editHistory.index--;
    restoreFromHistory(editHistory.stack[editHistory.index]);
    showHint('已撤销');
  }
}

function redo() {
  if (editHistory.index < editHistory.stack.length - 1) {
    editHistory.index++;
    restoreFromHistory(editHistory.stack[editHistory.index]);
    showHint('已重做');
  }
}

function restoreFromHistory(snapshot) {
  if (snapshot.mapData) {
    state.mapData = snapshot.mapData.map(row => [...row]);
  }
  if (snapshot.buildings) {
    state.editorBuildings = snapshot.buildings.map(b => ({ ...b }));
  }
  renderBuildingListInEditor();
  updateEditorInfo();
}

function handleEditorKeyDown(e) {
  if (!state.isEditMode) return;

  // Ctrl+Z 撤销, Ctrl+Y/Ctrl+Shift+Z 重做
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  }

  // Delete 键删除选中建筑
  if (e.key === 'Delete' && state.editorSelectedBuilding) {
    const index = state.editorBuildings.findIndex(b => b.id === state.editorSelectedBuilding.id);
    if (index !== -1) {
      saveEditHistory();
      state.editorBuildings.splice(index, 1);
      state.editorSelectedBuilding = null;
      renderBuildingListInEditor();
      renderEditorBuildingProperties();
      updateEditorInfo();
      showHint('建筑已删除');
    }
  }
}

// ========== UI 更新 ==========
function updateUI() {
  const worldState = state.world.getWorldState();
  updateGameTime(worldState.time);
  updateTickCount(worldState.tickCount);
  updateTownHealth(worldState.townHealth);
  updateSimulationStatus();
  renderAgentList();
}

function updateGameTime(time) {
  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const period = hours >= 12 ? '下午' : '上午';
  const displayHours = hours % 12 || 12;
  document.getElementById('game-time').textContent = `${period} ${displayHours}:${minutes}`;
}

function updateTickCount(count) {
  const tickCount = typeof count === 'number' ? count : 0;
  document.getElementById('tick-count').textContent = `Tick: ${tickCount}`;
}

function updateTownHealth(health) {
  const healthFill = document.getElementById('town-health-fill');
  const healthText = document.getElementById('town-health-text');
  if (healthFill && health) {
    healthFill.style.width = `${(health.current / health.max) * 100}%`;
  }
  if (healthText && health) {
    healthText.textContent = `${health.current}/${health.max}`;
  }
}

function updateSimulationStatus() {
  const statusEl = document.getElementById('simulation-status');
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  
  if (state.simulationRunning) {
    statusEl.textContent = '运行中';
    statusEl.className = 'status running';
    btnStart.disabled = true;
    btnStop.disabled = false;
  } else {
    statusEl.textContent = '已停止';
    statusEl.className = 'status stopped';
    btnStart.disabled = false;
    btnStop.disabled = true;
  }
}

function renderAgentList() {
  const container = document.getElementById('agent-list');
  const worldState = state.world.getWorldState();

  if (worldState.agents.size === 0) {
    container.innerHTML = '<div class="empty-state">暂无 Agent</div>';
    return;
  }

  const html = Array.from(worldState.agents.values()).map(agent => {
    const actionDesc = typeof agent.currentAction === 'object' ? agent.currentAction?.description : agent.currentAction;
    const portraitPath = getCharacterPortrait(agent.agentId);
    const portrait = portraitPath ? imageLoader.getImage(portraitPath) : null;

    return `
      <div class="agent-item" data-agent-id="${agent.agentId}">
        <div class="agent-avatar">
          ${portrait ? `<img src="${portraitPath}" alt="${agent.name}" onerror="this.style.display='none';this.parentElement.textContent='🤖'">` : '🤖'}
          <span class="status-dot ${agent.status}"></span>
        </div>
        <div class="agent-info">
          <div class="agent-name">${agent.name}</div>
          <div class="agent-status">${agent.status} · ${actionDesc || '空闲'}</div>
          <div class="agent-position">(${agent.position.x}, ${agent.position.y})</div>
          <div class="agent-stats">
            <span class="stat" title="健康">❤️ ${agent.health?.current ?? '-'}/${agent.health?.max ?? '-'}</span>
            <span class="stat" title="绿色积分">🌿 ${(agent.greenPoints ?? 0).toLocaleString()}</span>
            <span class="stat" title="饱腹">🍖 ${agent.fullness ?? '-'}/100</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;

  container.querySelectorAll('.agent-item').forEach(item => {
    item.addEventListener('click', () => {
      showAgentDetails(item.dataset.agentId);
    });
  });
}

function showAgentDetails(agentId) {
  const agent = state.world.agents.get(agentId);
  if (!agent) return;

  const memoryData = agent.memory.exportData();
  const portraitPath = getCharacterPortrait(agent.agentId);

  document.getElementById('modal-agent-name').textContent = agent.name;
  document.getElementById('modal-agent-id').textContent = agent.id;
  document.getElementById('modal-agent-age').textContent = `${agent.config.age}岁`;
  document.getElementById('modal-agent-traits').textContent = agent.config.traits;
  document.getElementById('modal-agent-position').textContent = `(${agent.position.x}, ${agent.position.y})`;
  document.getElementById('modal-agent-status').textContent = agent.status;

  // 显示生存属性 - 条形图
  const healthCurrent = agent.health?.current ?? 0;
  const healthMax = agent.health?.max ?? 100;
  const healthEl = document.getElementById('modal-agent-health');
  const healthBar = document.getElementById('modal-agent-health-bar');
  if (healthEl) healthEl.textContent = `${healthCurrent}/${healthMax}`;
  if (healthBar) {
    const healthPercent = healthMax > 0 ? (healthCurrent / healthMax) * 100 : 0;
    healthBar.style.width = `${healthPercent}%`;
  }

  const greenPointsEl = document.getElementById('modal-agent-greenpoints');
  if (greenPointsEl) greenPointsEl.textContent = (agent.greenPoints ?? 0).toLocaleString();

  const fullnessValue = agent.fullness ?? 0;
  const fullnessEl = document.getElementById('modal-agent-fullness');
  const fullnessBar = document.getElementById('modal-agent-fullness-bar');
  if (fullnessEl) fullnessEl.textContent = `${fullnessValue}/100`;
  if (fullnessBar) {
    const fullnessPercent = Math.min(Math.max(fullnessValue, 0), 100);
    fullnessBar.style.width = `${fullnessPercent}%`;
  }
  const actionText = typeof agent.currentAction === 'object' ? agent.currentAction?.description : agent.currentAction;
  document.getElementById('modal-agent-action').textContent = actionText || '无';
  document.getElementById('modal-agent-background').textContent = agent.config.background;

  // 添加头像
  const modalBody = document.querySelector('#agent-modal .modal-body');
  const existingPortrait = modalBody.querySelector('.modal-portrait');
  if (existingPortrait) existingPortrait.remove();
  
  if (portraitPath) {
    const portraitImg = document.createElement('img');
    portraitImg.src = portraitPath;
    portraitImg.className = 'modal-portrait';
    portraitImg.style.width = '80px';
    portraitImg.style.height = '80px';
    portraitImg.style.borderRadius = '50%';
    portraitImg.style.marginBottom = '15px';
    portraitImg.onerror = () => portraitImg.style.display = 'none';
    modalBody.insertBefore(portraitImg, modalBody.firstChild);
  }

  document.getElementById('modal-agent-goals').innerHTML = agent.config.goals.map(goal => `<li>${goal}</li>`).join('');

  // 记忆
  const memoriesDiv = document.getElementById('modal-memories');
  if (memoryData.memories.length > 0) {
    memoriesDiv.innerHTML = memoryData.memories.slice(-20).reverse().map(m => `
      <div class="memory-item">
        <div class="memory-time">${new Date(m.timestamp).toLocaleString()}</div>
        <div class="memory-content">${m.content}</div>
      </div>
    `).join('');
  } else {
    memoriesDiv.innerHTML = '<div class="empty-state">暂无记忆</div>';
  }

  // 反思
  const reflectionsDiv = document.getElementById('modal-reflections');
  if (memoryData.reflections.length > 0) {
    reflectionsDiv.innerHTML = memoryData.reflections.slice(-10).reverse().map(r => `
      <div class="memory-item reflection">
        <div class="memory-time">${new Date(r.timestamp).toLocaleString()}</div>
        <div class="memory-content">${r.content}</div>
      </div>
    `).join('');
  } else {
    reflectionsDiv.innerHTML = '<div class="empty-state">暂无反思</div>';
  }

  showModal('agent-modal');
}

// ========== 事件日志 ==========
function addEvent(event) {
  const container = document.getElementById('event-log');
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const eventDiv = document.createElement('div');
  eventDiv.className = `event-item ${event.type === 'world' ? 'world-event' : ''} ${event.type === 'dialogue' ? 'dialogue' : ''}`;

  let description = event.description;
  if (event.dialogue) {
    description += `<br><span style="color: #ff9a76;">💬 ${event.dialogue.speaker1}</span>`;
    description += `<br><span style="color: #a8d8ea;">💬 ${event.dialogue.speaker2}</span>`;
  }

  eventDiv.innerHTML = `
    <span class="event-time">${new Date(event.timestamp).toLocaleTimeString()}</span>
    <span class="event-type-badge">${event.type}</span>
    <span class="event-description">${description}</span>
  `;

  container.insertBefore(eventDiv, container.firstChild);

  // 限制最多 50 条
  while (container.children.length > 50) {
    container.removeChild(container.lastChild);
  }
}

// ========== Agent 管理 ==========
async function addDefaultAgents() {
  const positions = [
    { name: 'xiaoming', x: 5, y: 5 },
    { name: 'xiaohong', x: 45, y: 35 },
    { name: 'xiaomi', x: 5, y: 35 },
    { name: 'xiaodong', x: 45, y: 5 }
  ];

  for (const pos of positions) {
    const template = agentTemplates[pos.name];
    if (template) {
      await state.world.addAgent(template, { x: pos.x, y: pos.y });
    }
  }
}

async function handleAddAgent(e) {
  e.preventDefault();
  const name = document.getElementById('new-agent-name').value;
  const age = parseInt(document.getElementById('new-agent-age').value);
  const traits = document.getElementById('new-agent-traits').value;
  const background = document.getElementById('new-agent-background').value;

  const template = {
    id: `agent_${Date.now()}`,
    name,
    age,
    traits,
    background,
    goals: ['探索世界', '结交朋友']
  };

  await state.world.addAgent(template);
  hideModal('add-agent-modal');
  e.target.reset();
}

function handleTriggerEvent(e) {
  e.preventDefault();
  const type = document.getElementById('event-type').value;
  const description = document.getElementById('event-description').value;
  state.world.triggerEvent(type, description);
  hideModal('event-modal');
  e.target.reset();
}

// ========== 工具函数 ==========
function showTooltip(x, y, data) {
  const tooltip = document.getElementById('map-tooltip');
  if (!tooltip) return;

  let content = '';
  if (data.type === 'agent') {
    content = `<strong>${data.data.name}</strong><br>状态：${data.data.status}<br>位置：(${data.data.position.x}, ${data.data.position.y})`;
  } else if (data.type === 'object') {
    content = `<strong>${data.data.name}</strong><br>类型：${data.data.type}<br>${data.data.description}`;
  }

  tooltip.innerHTML = content;
  tooltip.style.left = `${x + 15}px`;
  tooltip.style.top = `${y + 15}px`;
  tooltip.classList.remove('hidden');
}

function hideTooltip() {
  const tooltip = document.getElementById('map-tooltip');
  if (tooltip) tooltip.classList.add('hidden');
}

function showModal(modalId) {
  document.getElementById(modalId).classList.remove('hidden');
}

function hideModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

// ========== 编辑模式功能 ==========
function initEditor() {
  // 初始化地图数据（默认全部草地）
  initMapData();

  // 从 world 中加载现有建筑
  loadBuildingsFromWorld();

  // 设置编辑模式事件监听
  setupEditorListeners();

  // 保存初始历史状态
  saveEditHistory();
}

function initMapData() {
  // 创建二维数组存储地图数据
  state.mapData = [];
  for (let y = 0; y < CONFIG.WORLD_HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < CONFIG.WORLD_WIDTH; x++) {
      // 默认草地，某些区域设为路径
      row.push('grass');
    }
    state.mapData.push(row);
  }

  // 设置一些默认路径
  const pathPoints = [
    { x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 10 },
    { x: 20, y: 5 }, { x: 20, y: 6 }, { x: 20, y: 7 }, { x: 20, y: 8 },
    { x: 20, y: 9 }, { x: 20, y: 10 }, { x: 20, y: 11 }, { x: 20, y: 12 },
  ];

  for (const p of pathPoints) {
    if (p.x < CONFIG.WORLD_WIDTH && p.y < CONFIG.WORLD_HEIGHT) {
      state.mapData[p.y][p.x] = 'path';
    }
  }
}

function loadBuildingsFromWorld() {
  // 从 world 中复制建筑数据
  state.editorBuildings = [];

  if (!state.world) {
    console.warn('World 未初始化，无法加载建筑');
    return;
  }

  try {
    const worldState = state.world.getWorldState();
    if (!worldState || !worldState.objects) {
      console.warn('World 数据为空');
      return;
    }

    for (const obj of worldState.objects.values()) {
      if (!obj) continue;
      state.editorBuildings.push({
        id: obj.id || 'unknown',
        name: obj.name || '未命名',
        type: obj.type || 'building',
        x: obj.position?.x || 0,
        y: obj.position?.y || 0,
        width: 3, // 默认3x3
        height: 3,
        obstacle: true,
        description: obj.description || '',
        image: null
      });
    }

    console.log(`从世界加载了 ${state.editorBuildings.length} 个建筑`);
  } catch (err) {
    console.error('加载建筑失败:', err);
  }
}

function setupEditorListeners() {
  // 模式切换按钮
  const modeToggle = document.getElementById('btn-mode-toggle');
  modeToggle?.addEventListener('click', toggleEditMode);

  // 工具按钮
  document.querySelectorAll('.toolbar-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.toolbar-btn[data-tool]').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.editorTool = e.target.dataset.tool;
    });
  });

  // 地形按钮
  document.querySelectorAll('.toolbar-btn[data-terrain]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.toolbar-btn[data-terrain]').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.editorTerrain = e.target.dataset.terrain;
    });
  });

  // 新建建筑按钮
  document.getElementById('btn-editor-add-building')?.addEventListener('click', showEditBuildingModalForNew);

  // 保存/加载/清空
  document.getElementById('btn-save-map')?.addEventListener('click', saveMapData);
  document.getElementById('btn-load-map')?.addEventListener('click', () => {
    document.getElementById('map-file-input')?.click();
  });
  document.getElementById('map-file-input')?.addEventListener('change', loadMapData);
  document.getElementById('btn-clear-map')?.addEventListener('click', clearMap);

  // 建筑编辑弹窗
  document.getElementById('btn-close-edit-building')?.addEventListener('click', () => hideModal('edit-building-modal'));
  document.getElementById('btn-cancel-edit-building')?.addEventListener('click', () => hideModal('edit-building-modal'));
  document.getElementById('edit-building-form')?.addEventListener('submit', handleSaveBuilding);
  document.getElementById('btn-delete-building')?.addEventListener('click', handleDeleteBuilding);

  // 图片上传
  const uploadArea = document.getElementById('edit-image-upload-area');
  uploadArea?.addEventListener('click', () => document.getElementById('edit-building-image')?.click());
  uploadArea?.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea?.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea?.addEventListener('drop', handleBuildingImageDrop);
  document.getElementById('edit-building-image')?.addEventListener('change', handleBuildingImageSelect);
}

function toggleEditMode() {
  state.isEditMode = !state.isEditMode;

  const modeToggle = document.getElementById('btn-mode-toggle');
  const editorToolbar = document.getElementById('editor-toolbar');
  const simSidebar = document.getElementById('simulation-sidebar');
  const editorSidebar = document.getElementById('editor-sidebar');

  console.log('切换模式:', state.isEditMode ? '编辑' : '模拟');

  if (state.isEditMode) {
    // 切换到编辑模式
    if (modeToggle) modeToggle.textContent = '🏗️ 编辑模式';
    if (modeToggle) modeToggle.classList.add('active');
    if (editorToolbar) editorToolbar.classList.remove('hidden');
    if (simSidebar) simSidebar.classList.add('hidden');
    if (editorSidebar) editorSidebar.classList.remove('hidden');

    // 暂停模拟
    if (state.world) state.world.stop();

    // 更新编辑器显示
    updateEditorInfo();
    renderBuildingListInEditor();

    showHint('已进入编辑模式，点击工具栏选择工具');
  } else {
    // 切换到模拟模式
    if (modeToggle) modeToggle.textContent = '🎮 模拟模式';
    if (modeToggle) modeToggle.classList.remove('active');
    if (editorToolbar) editorToolbar.classList.add('hidden');
    if (simSidebar) simSidebar.classList.remove('hidden');
    if (editorSidebar) editorSidebar.classList.add('hidden');

    // 应用更改到 world
    applyChangesToWorld();

    showHint('已返回模拟模式，更改已应用');
  }
}

function applyChangesToWorld() {
  // 将编辑的建筑同步回 world
  if (!state.world || !state.editorBuildings) {
    console.warn('World或建筑数据不存在，无法应用更改');
    return;
  }

  console.log('应用地图更改到世界...');

  // 清空现有 objects
  state.world.objects.clear();

  // 重新添加编辑后的建筑
  for (const b of state.editorBuildings) {
    const buildingObj = {
      id: b.id,
      name: b.name,
      type: b.type || 'building',
      position: { x: b.x, y: b.y, area: b.name },
      interactable: true,
      description: b.description || '',
      width: b.width || 3,
      height: b.height || 3,
      obstacle: b.obstacle !== false // 默认为true
    };
    state.world.objects.set(b.id, buildingObj);
    console.log(`  添加建筑: ${b.name} (${b.x}, ${b.y})`);
  }

  console.log(`已应用 ${state.editorBuildings.length} 个建筑到世界`);
  showHint(`已应用 ${state.editorBuildings.length} 个建筑`);
}

function handleCanvasClickForEditor(e) {
  if (!state.isEditMode) return;

  const rect = state.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const cellSize = CONFIG.MAP_CELL_SIZE;

  const gridX = Math.floor(x / cellSize);
  const gridY = Math.floor(y / cellSize);

  if (gridX < 0 || gridX >= CONFIG.WORLD_WIDTH || gridY < 0 || gridY >= CONFIG.WORLD_HEIGHT) {
    return;
  }

  switch (state.editorTool) {
    case 'select':
      selectBuildingAt(gridX, gridY);
      break;
    case 'ground':
    case 'path':
      paintTerrain(gridX, gridY, state.editorTerrain);
      break;
    case 'eraser':
      eraseAt(gridX, gridY);
      break;
  }

  updateEditorInfo();
}

function selectBuildingAt(x, y) {
  const buildings = state.editorBuildings || [];
  const building = buildings.find(b =>
    x >= b.x && x < b.x + b.width &&
    y >= b.y && y < b.y + b.height
  );

  state.editorSelectedBuilding = building || null;
  renderBuildingListInEditor();
  renderEditorBuildingProperties();
}

function paintTerrain(x, y, terrain) {
  if (!state.mapData || !state.mapData[y]) return;
  state.mapData[y][x] = terrain;
}

function eraseAt(x, y) {
  // 删除建筑
  const buildings = state.editorBuildings || [];
  const index = buildings.findIndex(b =>
    x >= b.x && x < b.x + b.width &&
    y >= b.y && y < b.y + b.height
  );

  if (index !== -1) {
    buildings.splice(index, 1);
    state.editorSelectedBuilding = null;
    renderBuildingListInEditor();
    renderEditorBuildingProperties();
  }
}

function showEditBuildingModalForNew() {
  state.editorSelectedBuilding = null;

  const form = document.getElementById('edit-building-form');
  const preview = document.getElementById('edit-image-preview');
  const placeholder = document.getElementById('edit-upload-placeholder');
  const originalIdInput = document.getElementById('edit-building-original-id');

  if (form) form.reset();
  if (preview) preview.classList.add('hidden');
  if (placeholder) placeholder.classList.remove('hidden');
  if (originalIdInput) originalIdInput.value = '';

  showModal('edit-building-modal');
}

function showEditBuildingModalForEdit(building) {
  state.editorSelectedBuilding = building;
  document.getElementById('edit-building-original-id').value = building.id;
  document.getElementById('edit-building-id').value = building.id;
  document.getElementById('edit-building-name').value = building.name;
  document.getElementById('edit-building-width').value = building.width;
  document.getElementById('edit-building-height').value = building.height;
  document.getElementById('edit-building-obstacle').checked = building.obstacle;
  document.getElementById('edit-building-description').value = building.description || '';

  if (building.image) {
    document.getElementById('edit-image-preview').src = building.image;
    document.getElementById('edit-image-preview').classList.remove('hidden');
    document.getElementById('edit-upload-placeholder').classList.add('hidden');
  } else {
    document.getElementById('edit-image-preview').classList.add('hidden');
    document.getElementById('edit-upload-placeholder').classList.remove('hidden');
  }

  showModal('edit-building-modal');
}

function handleSaveBuilding(e) {
  e.preventDefault();

  const idInput = document.getElementById('edit-building-id');
  const nameInput = document.getElementById('edit-building-name');
  const widthInput = document.getElementById('edit-building-width');
  const heightInput = document.getElementById('edit-building-height');
  const obstacleInput = document.getElementById('edit-building-obstacle');
  const descInput = document.getElementById('edit-building-description');
  const originalIdInput = document.getElementById('edit-building-original-id');

  if (!idInput || !nameInput) {
    console.error('表单元素未找到');
    return;
  }

  const id = idInput.value.trim();
  const name = nameInput.value.trim();
  const width = parseInt(widthInput?.value) || 3;
  const height = parseInt(heightInput?.value) || 3;
  const obstacle = obstacleInput?.checked ?? true;
  const description = descInput?.value.trim() || '';
  const originalId = originalIdInput?.value || '';

  if (!id || !name) {
    alert('请填写 ID 和名称');
    return;
  }

  // 确保数组存在
  if (!state.editorBuildings) state.editorBuildings = [];

  // 检查ID重复
  const exists = state.editorBuildings.some(b => b.id === id && b.id !== originalId);
  if (exists) {
    alert('建筑ID已存在');
    return;
  }

  const buildingData = {
    id,
    name,
    type: 'building',
    width,
    height,
    obstacle,
    description,
    image: state.editorSelectedBuilding?.image || null,
    x: state.editorSelectedBuilding?.x || 10,
    y: state.editorSelectedBuilding?.y || 10
  };

  if (originalId) {
    // 更新现有建筑
    const index = state.editorBuildings.findIndex(b => b.id === originalId);
    if (index !== -1) {
      state.editorBuildings[index] = { ...state.editorBuildings[index], ...buildingData };
    }
  } else {
    // 新建建筑 - 保存历史
    saveEditHistory();
    state.editorBuildings.push(buildingData);
  }

  hideModal('edit-building-modal');
  renderBuildingListInEditor();
  updateEditorInfo();
  showHint(`建筑 "${name}" 已保存`);
}

function handleDeleteBuilding() {
  const originalIdInput = document.getElementById('edit-building-original-id');
  const originalId = originalIdInput?.value;

  if (!originalId) {
    hideModal('edit-building-modal');
    return;
  }

  if (!state.editorBuildings) {
    hideModal('edit-building-modal');
    return;
  }

  if (confirm('确定要删除这个建筑吗？')) {
    const index = state.editorBuildings.findIndex(b => b.id === originalId);
    if (index !== -1) {
      state.editorBuildings.splice(index, 1);
      state.editorSelectedBuilding = null;
      hideModal('edit-building-modal');
      renderBuildingListInEditor();
      renderEditorBuildingProperties();
      updateEditorInfo();
      showHint('建筑已删除');
    }
  }
}

function handleBuildingImageDrop(e) {
  e.preventDefault();
  const uploadArea = document.getElementById('edit-image-upload-area');
  uploadArea.classList.remove('dragover');

  const file = e.dataTransfer.files[0];
  if (file) processBuildingImage(file);
}

function handleBuildingImageSelect(e) {
  const file = e.target.files[0];
  if (file) processBuildingImage(file);
}

function processBuildingImage(file) {
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById('edit-image-preview');
    img.src = e.target.result;
    img.classList.remove('hidden');
    document.getElementById('edit-upload-placeholder').classList.add('hidden');

    if (state.editorSelectedBuilding) {
      state.editorSelectedBuilding.image = e.target.result;
    } else {
      // 临时存储给新建的建筑
      if (!state.tempNewBuilding) state.tempNewBuilding = {};
      state.tempNewBuilding.image = e.target.result;
    }
  };
  reader.readAsDataURL(file);
}

function saveMapData() {
  const data = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    mapData: state.mapData,
    buildings: state.editorBuildings
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-town-map-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showHint('地图已导出');
}

function loadMapData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.mapData) {
        state.mapData = data.mapData;
      }
      if (data.buildings) {
        state.editorBuildings = data.buildings;
      }
      renderBuildingListInEditor();
      updateEditorInfo();
      showHint('地图已加载');
    } catch (err) {
      alert('加载失败：' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function clearMap() {
  if (!confirm('确定要清空所有建筑和地形吗？此操作不可恢复。')) return;

  saveEditHistory();
  initMapData();
  state.editorBuildings = [];
  state.editorSelectedBuilding = null;
  renderBuildingListInEditor();
  renderEditorBuildingProperties();
  updateEditorInfo();
  showHint('地图已清空');
}

function updateEditorInfo() {
  const dimensionsEl = document.getElementById('map-dimensions');
  const countEl = document.getElementById('building-count');

  if (dimensionsEl) dimensionsEl.textContent = `${CONFIG.WORLD_WIDTH}×${CONFIG.WORLD_HEIGHT}`;
  if (countEl) countEl.textContent = state.editorBuildings?.length || 0;
}

function renderBuildingListInEditor() {
  const container = document.getElementById('editor-building-content');
  if (!container) return;

  const buildings = state.editorBuildings || [];

  if (buildings.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无建筑，点击"新建建筑"添加</div>';
    return;
  }

  container.innerHTML = `
    <div class="editor-building-list">
      ${buildings.map(b => `
        <div class="editor-building-item ${state.editorSelectedBuilding?.id === b.id ? 'selected' : ''}"
             data-id="${b.id}">
          <div class="building-status-icon ${b.obstacle ? 'obstacle' : 'passable'}"></div>
          <div style="flex: 1;">
            <div style="font-weight: 500;">${b.name}</div>
            <div style="font-size: 11px; color: rgba(255,255,255,0.5);">${b.id} · ${b.width}×${b.height}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // 添加点击事件
  container.querySelectorAll('.editor-building-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const building = state.editorBuildings.find(b => b.id === id);
      if (building) {
        showEditBuildingModalForEdit(building);
      }
    });
  });
}

function renderEditorBuildingProperties() {
  const panel = document.getElementById('editor-building-content');
  if (!panel) return;

  if (!state.editorSelectedBuilding) {
    panel.innerHTML = '<div class="empty-state">点击建筑进行编辑</div>';
    return;
  }

  const b = state.editorSelectedBuilding;
  panel.innerHTML = `
    <div class="property-group">
      <label>ID</label>
      <div class="property-value">${b.id}</div>
    </div>
    <div class="property-group">
      <label>名称</label>
      <div class="property-value">${b.name}</div>
    </div>
    <div class="property-group">
      <label>位置</label>
      <div class="property-value">(${b.x}, ${b.y})</div>
    </div>
    <div class="property-group">
      <label>尺寸</label>
      <div class="property-value">${b.width} × ${b.height}</div>
    </div>
    <div class="property-group">
      <label>障碍物</label>
      <div class="property-value">
        <span class="color-indicator ${b.obstacle ? 'color-obstacle' : 'color-passable'}"></span>
        ${b.obstacle ? '是' : '否'}
      </div>
    </div>
    <button class="btn btn-block" onclick="showEditBuildingModalForEdit(state.editorSelectedBuilding)">
      ✏️ 编辑详情
    </button>
  `;
}

function showHint(message) {
  const oldHint = document.querySelector('.editor-hint');
  if (oldHint) oldHint.remove();

  const hint = document.createElement('div');
  hint.className = 'editor-hint';
  hint.textContent = message;
  document.body.appendChild(hint);

  setTimeout(() => {
    hint.style.opacity = '0';
    hint.style.transition = 'opacity 0.3s';
    setTimeout(() => hint.remove(), 300);
  }, 3000);
}

// 使函数全局可用（用于内联事件处理）
window.showEditBuildingModalForEdit = showEditBuildingModalForEdit;

// ========== 启动 ==========
window.addEventListener('DOMContentLoaded', init);
