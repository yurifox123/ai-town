/**
 * AI 生态小镇前端主应用 - 增强版
 * 支持图片精灵渲染和加载界面
 */
import WorldSimulator from "../core/simulator.js";
import LLMClient from "./llm-client.js";
import imageLoader from "../assets/image-loader.js";
import {
  getCharacterSprite,
  getCharacterPortrait,
  getBuildingSprite,
  getCharacterDisplaySize,
  getBuildingDisplaySize,
  getCharacterAnimation,
  getCharacterKey,
  ASSET_CONFIG,
} from "../assets/asset-config.js";

// ========== 拖拽平移状态 ==========
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panOffsetX = 0;
let panOffsetY = 0;

// 画布平移偏移（CSS transform）
let canvasPanX = 0;
let canvasPanY = 0;

// ========== 动画状态管理 ==========
// 每个 agent 的动画状态：{ frameIndex, lastFrameTime, direction, action, lastAction }
const agentAnimState = new Map();

// ========== 配置 ==========
const CONFIG = {
  MAP_CELL_SIZE: 42,
  MAP_IMAGE_WIDTH: 1536,
  MAP_IMAGE_HEIGHT: 1024,
  MAP_TOP_OFFSET: 28, // 地图顶部裁剪像素
  AGENT_COLOR: "#e94560",
  BUILDING_COLOR: "#4a90d9",
  AREA_COLOR: "#28a745",
  REFRESH_RATE: 1000 / 30,
  TICK_INTERVAL: 5000,
  TIME_SCALE: 5,
  SPRITE_SCALE: 1.0,
  // 缩放状态
  zoom: 1.0,
};

// ========== Agent 模板 ==========
const agentTemplates = {
  xiaoming: {
    id: "xiaoming",
    name: "小明",
    age: 25,
    traits: "开朗活泼，喜欢社交，热爱咖啡和音乐",
    background:
      "一名软件工程师，在一家互联网公司工作。喜欢尝试新事物，周末经常和朋友聚会。",
    goals: ["学习新技能", "结交新朋友", "保持健康生活方式"],
    healthMax: 100,
    greenPoints: 10,
    fullness: 80,
  },
  xiaohong: {
    id: "xiaohong",
    name: "小红",
    age: 24,
    traits: "温柔细腻，喜欢阅读，安静内敛",
    background:
      "一名图书管理员，热爱文学和艺术。喜欢在咖啡馆看书，享受独处时光。",
    goals: ["读完 100 本书", "学习绘画", "开一家咖啡馆"],
    healthMax: 85,
    greenPoints: 10,
    fullness: 75,
  },
  xiaomi: {
    id: "xiaomi",
    name: "小米",
    age: 22,
    traits: "活泼可爱，喜欢美食，乐观向上",
    background:
      "一名美食博主，喜欢探索各种美食。性格开朗，总是能给身边的人带来快乐。",
    goals: ["成为顶级美食博主", "开一家餐厅", "环游世界品尝美食"],
    healthMax: 90,
    greenPoints: 10,
    fullness: 70,
  },
  xiaodong: {
    id: "xiaodong",
    name: "小东",
    age: 26,
    traits: "沉稳内敛，喜欢运动，注重健康",
    background: "一名健身教练，热爱各种运动。生活规律，是朋友们的健康顾问。",
    goals: ["帮助更多人健康生活", "参加马拉松比赛", "开一家健身房"],
    healthMax: 100,
    greenPoints: 10,
    fullness: 90,
  },
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
  editorTool: "select", // select, area, eraser
  paintMode: "blocked", // blocked=红色不可通行, passable=蓝色可通行
  // 区域编辑状态
  areas: [],
  editorSelectedArea: null,
  selectedAreas: [],
  paintingArea: null, // area being created during brush drag
  paintedCells: new Set(), // "x,y" cells painted in current gesture
  affectedCells: new Set(), // cells touched in current gesture (for toggle)
  paintGestureMode: "paint", // "paint" or "erase"
  isFreehand: false,
  freehandPath: [],
};

// ========== DOM 元素缓存 ==========
let elements = {};

// 编辑模式状态
let isDragging = false;
let isPainting = false;
let lastPaintedCell = null;

// 对话气泡管理
const dialogueBubbles = new Map();

function showDialogueBubble(agentId, message) {
  dialogueBubbles.set(agentId, {
    message,
    timestamp: Date.now(),
  });

  // 3秒后自动消失
  setTimeout(() => {
    dialogueBubbles.delete(agentId);
  }, 3000);
}

// ========== 初始化 ==========
async function init() {
  console.log("🎮 AI 生态小镇前端初始化中...");

  // 显示加载界面
  showLoadingScreen();

  // 预加载所有图片
  console.log("📸 正在加载图片素材...");
  await imageLoader.preloadAll((progress) => {
    updateLoadingProgress(progress * 0.3); // 图片占30%进度
  });

  // 初始化 LLM 客户端
  state.llm = new LLMClient();

  // 初始化世界模拟器
  state.world = new WorldSimulator(
    CONFIG.MAP_CELL_SIZE,
    CONFIG.MAP_IMAGE_WIDTH,
    CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET,
    CONFIG.TIME_SCALE,
    state.llm,
  );

  // 设置事件监听
  setupWorldListeners();
  setupUIListeners();

  // 初始化画布
  initCanvas();

  // 开始渲染循环（但先不显示，等agent完成）
  startRenderLoop();

  // 添加默认 Agent 并等待完成
  updateLoadingText("正在初始化 Agent...");
  await addDefaultAgents();

  // 初始化编辑模式
  initEditor();

  // 加载默认地图数据
  fetch("/assets/default-map.json")
    .then((r) => r.json())
    .then((data) => {
      if (data.tileSize) {
        CONFIG.MAP_CELL_SIZE = data.tileSize;
        const tileInput = document.getElementById("tile-size-input");
        if (tileInput) tileInput.value = data.tileSize;
      }
      if (data.areas && data.areas.length > 0) {
        state.areas = data.areas.map((a) => {
          if (a.cells) return a;
          if (a.w != null && a.h != null) {
            return {
              id: a.id,
              name: a.name || "",
              cells: rectToCells(a.x, a.y, a.w, a.h),
              isBlocked: a.isBlocked,
            };
          }
          return a;
        });
        state.world.setAreas(state.areas);
        state.world.updateGridSize(CONFIG.MAP_CELL_SIZE);
        saveAreaHistory();
      }
    })
    .catch(() => {});

  // 更新 UI
  updateUI();

  console.log("✅ AI 生态小镇初始化完成");
}

// ========== 加载界面 ==========
function showLoadingScreen() {
  const loadingDiv = document.createElement("div");
  loadingDiv.id = "loading-screen";
  loadingDiv.className = "loading-screen";
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
  elements.loadingProgress = document.getElementById("loading-progress");
  elements.loadingText = document.getElementById("loading-text");
}

function updateLoadingProgress(progress) {
  if (elements.loadingProgress) {
    elements.loadingProgress.style.width = `${progress}%`;
  }
  if (elements.loadingText) {
    elements.loadingText.textContent = `${Math.round(progress)}%`;
  }
}

function updateLoadingText(text) {
  if (elements.loadingText) {
    elements.loadingText.textContent = text;
  }
}

function hideLoadingScreen() {
  if (elements.loadingScreen) {
    elements.loadingScreen.classList.add("hidden");
    setTimeout(() => {
      elements.loadingScreen.remove();
    }, 500);
  }
}

// ========== 世界事件监听 ==========
function setupWorldListeners() {
  state.world.addEventListener("tick", (e) => {
    const { time, tickCount, townHealth } = e.detail;
    updateGameTime(time);
    updateTickCount(tickCount);
    updateTownHealth(townHealth);
    renderAgentList();
  });

  // 实时时间更新（每秒触发）
  state.world.addEventListener("timeUpdate", (e) => {
    updateGameTime(e.detail.time);
    updateTownHealth(e.detail.townHealth);
  });

  state.world.addEventListener("agentJoined", (e) => {
    addEvent({
      type: "system",
      description: `Agent ${e.detail.name} 加入了世界`,
      timestamp: new Date(),
    });
    renderAgentList();
  });

  state.world.addEventListener("agentLeft", (e) => {
    renderAgentList();
  });

  state.world.addEventListener("event", (e) => {
    addEvent(e.detail);
  });

  state.world.addEventListener("started", () => {
    state.simulationRunning = true;
    updateSimulationStatus();
  });

  state.world.addEventListener("dialogue", (e) => {
    showDialogueBubble(e.detail.agentId, e.detail.message);
  });
}

// ========== UI 事件监听 ==========
function setupUIListeners() {
  // 控制按钮
  document.getElementById("btn-start").addEventListener("click", () => {
    state.world.start();
  });
  document.getElementById("btn-stop").addEventListener("click", () => {
    state.world.stop();
  });
  document.getElementById("btn-reset").addEventListener("click", () => {
    state.world.reset();
  });
  document.getElementById("btn-step").addEventListener("click", async () => {
    await state.world.step();
  });

  // 快捷操作
  document.getElementById("btn-add-agent").addEventListener("click", () => {
    showModal("add-agent-modal");
  });
  document.getElementById("btn-trigger-event").addEventListener("click", () => {
    showModal("event-modal");
  });
  document.getElementById("btn-clear-log").addEventListener("click", () => {
    document.getElementById("event-log").innerHTML =
      '<div class="empty-state">暂无事件</div>';
  });

  // 停止服务器
  document
    .getElementById("btn-stop-server")
    .addEventListener("click", async () => {
      if (confirm("确定要停止服务器吗？")) {
        try {
          await fetch("/api/stop", { method: "POST" });
        } catch (e) {
          console.log("服务器已停止");
        }
      }
    });

  // 模态框关闭
  document.getElementById("btn-close-modal").addEventListener("click", () => {
    hideModal("agent-modal");
  });
  document
    .getElementById("btn-close-add-modal")
    .addEventListener("click", () => {
      hideModal("add-agent-modal");
    });
  document
    .getElementById("btn-close-event-modal")
    .addEventListener("click", () => {
      hideModal("event-modal");
    });

  // 表单提交
  document
    .getElementById("add-agent-form")
    .addEventListener("submit", handleAddAgent);
  document
    .getElementById("event-form")
    .addEventListener("submit", handleTriggerEvent);

  // Tab 切换
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const tabName = e.target.dataset.tab;
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-pane")
        .forEach((p) => p.classList.remove("active"));
      e.target.classList.add("active");
      document.getElementById(`tab-${tabName}`).classList.add("active");
    });
  });

  // 角色属性卡片事件
  setupAgentCardListeners();
}

// ========== 画布初始化 ==========
function initCanvas() {
  state.canvas = document.getElementById("world-map");
  state.ctx = state.canvas.getContext("2d");

  // Canvas尺寸 = 地图图片尺寸（减去顶部裁剪）
  const effectiveH = CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET;
  state.canvas.width = CONFIG.MAP_IMAGE_WIDTH;
  state.canvas.height = effectiveH;

  // 适配容器
  const container = state.canvas.parentElement;
  container.style.cursor = "grab";
  const maxWidth = container.clientWidth - 40;
  const maxHeight = container.clientHeight - 40;
  const scale = Math.min(
    maxWidth / CONFIG.MAP_IMAGE_WIDTH,
    maxHeight / effectiveH,
    2.5,
  );
  CONFIG.zoom = scale;

  state.canvas.style.width = `${CONFIG.MAP_IMAGE_WIDTH * scale}px`;
  state.canvas.style.height = `${effectiveH * scale}px`;

  // 初始居中
  applyCanvasTransform();

  // 创建缩略图
  createMinimap();

  // 画布交互
  state.canvas.addEventListener("mousemove", handleMouseMove);
  state.canvas.addEventListener("click", handleCanvasClick);
  state.canvas.addEventListener("mousedown", handleCanvasMouseDown);
  state.canvas.addEventListener("mouseup", handleCanvasMouseUp);
  state.canvas.addEventListener("mouseleave", () => {
    hideTooltip();
    state.hoveredElement = null;
    // Finalize area brush if mouse leaves canvas
    if (state.paintingArea) {
      if (state.paintingArea.cells.length > 0) saveAreaHistory();
      else {
        const idx = state.areas.indexOf(state.paintingArea);
        if (idx >= 0) state.areas.splice(idx, 1);
        state.world.setAreas(state.areas);
        renderAreaListInEditor();
      }
      state.paintingArea = null;
      state.paintedCells = new Set();
      state.affectedCells = new Set();
    }
    isPainting = false;
    isDragging = false;
    dragBuilding = null;
    if (isPanning) {
      isPanning = false;
      state.canvas.parentElement.style.cursor = "grab";
    }
  });
  state.canvas.addEventListener("wheel", handleCanvasWheel, { passive: false });

  // 键盘事件
  document.addEventListener("keydown", handleEditorKeyDown);
}

// ========== 渲染循环 ==========
function startRenderLoop() {
  function render() {
    drawMap();
    state.animationId = requestAnimationFrame(render);
  }
  render();
}

// ========== 缩略图 ==========
function createMinimap() {
  const container = state.canvas.parentElement;

  const wrapper = document.createElement("div");
  wrapper.className = "minimap-container";

  const minimapCanvas = document.createElement("canvas");
  minimapCanvas.id = "minimap";
  minimapCanvas.width = 200;
  minimapCanvas.height = Math.round(
    200 *
      ((CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET) /
        CONFIG.MAP_IMAGE_WIDTH),
  );

  wrapper.appendChild(minimapCanvas);
  container.appendChild(wrapper);

  state.minimapCanvas = minimapCanvas;
  state.minimapCtx = minimapCanvas.getContext("2d");

  drawMinimapBackground();

  minimapCanvas.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    handleMinimapClick(e);
  });
  minimapCanvas.addEventListener("mousemove", (e) => {
    if (e.buttons === 1) {
      e.stopPropagation();
      handleMinimapClick(e);
    }
  });
}

function drawMinimapBackground() {
  const ctx = state.minimapCtx;
  const w = state.minimapCanvas.width;
  const h = state.minimapCanvas.height;
  const mapImage = imageLoader.getImage("/assets/map.png");
  if (mapImage) {
    ctx.drawImage(mapImage, 0, 0, w, h);
  } else {
    ctx.fillStyle = "#2b1f3e";
    ctx.fillRect(0, 0, w, h);
  }
}

function updateMinimapViewport() {
  if (!state.minimapCtx) return;
  const ctx = state.minimapCtx;
  const container = state.canvas.parentElement;
  const mw = state.minimapCanvas.width;
  const mh = state.minimapCanvas.height;

  drawMinimapBackground();

  const scaleX = mw / CONFIG.MAP_IMAGE_WIDTH;
  const scaleY = mh / (CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET);

  // 视口在画布像素坐标中的位置
  const viewLeftPx = -canvasPanX / CONFIG.zoom;
  const viewTopPx = -canvasPanY / CONFIG.zoom;
  const viewWidthPx = container.clientWidth / CONFIG.zoom;
  const viewHeightPx = container.clientHeight / CONFIG.zoom;

  // 转换到缩略图坐标
  const viewLeft = viewLeftPx * scaleX;
  const viewTop = viewTopPx * scaleY;
  const viewWidth = viewWidthPx * scaleX;
  const viewHeight = viewHeightPx * scaleY;

  // 半透明遮罩
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fillRect(0, 0, mw, mh);

  // 清除视口区域（露出地图）
  ctx.clearRect(viewLeft, viewTop, viewWidth, viewHeight);

  // 视口边框
  ctx.strokeStyle = "#e94560";
  ctx.lineWidth = 2;
  ctx.strokeRect(viewLeft, viewTop, viewWidth, viewHeight);

  // 绘制 agent 位置点
  if (state.world) {
    const worldState = state.world.getWorldState();
    for (const agent of worldState.agents.values()) {
      const ax = agent.position.x * CONFIG.MAP_CELL_SIZE * scaleX;
      const ay = agent.position.y * CONFIG.MAP_CELL_SIZE * scaleY;
      ctx.fillStyle = "#28a745";
      ctx.beginPath();
      ctx.arc(ax, ay, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function handleMinimapClick(e) {
  const rect = state.minimapCanvas.getBoundingClientRect();
  const clickX = (e.clientX - rect.left) / rect.width;
  const clickY = (e.clientY - rect.top) / rect.height;

  const container = state.canvas.parentElement;
  const canvasDisplayW = CONFIG.MAP_IMAGE_WIDTH * CONFIG.zoom;
  const canvasDisplayH = CONFIG.MAP_IMAGE_HEIGHT * CONFIG.zoom;

  // 点击位置对应的画布像素 → 居中
  canvasPanX = container.clientWidth / 2 - clickX * canvasDisplayW;
  canvasPanY = container.clientHeight / 2 - clickY * canvasDisplayH;

  updateCanvasTransform();
  updateMinimapViewport();
}

// ========== 地图绘制 ==========
function drawMap() {
  if (!state.ctx) return;

  const ctx = state.ctx;
  const cellSize = CONFIG.MAP_CELL_SIZE;

  // 1. 绘制地图背景图片（去掉顶部28像素）
  const mapImage = imageLoader.getImage("/assets/map.png");
  const effectiveH = CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET;
  if (mapImage) {
    ctx.drawImage(
      mapImage,
      0,
      CONFIG.MAP_TOP_OFFSET,
      CONFIG.MAP_IMAGE_WIDTH,
      effectiveH,
      0,
      0,
      CONFIG.MAP_IMAGE_WIDTH,
      effectiveH,
    );
  } else {
    ctx.fillStyle = "#2b1f3e";
    ctx.fillRect(0, 0, CONFIG.MAP_IMAGE_WIDTH, effectiveH);
  }

  // 2. 编辑模式：绘制网格线
  if (state.isEditMode) {
    drawGridOverlay(ctx);
  }

  // 3. 绘制区域覆盖层（红=不可通行, 蓝=可通行）- 仅编辑模式
  if (state.isEditMode) {
    drawAreaOverlays(ctx);
  }

  // 4. 绘制建筑/对象
  const worldState = state.world.getWorldState();
  for (const obj of worldState.objects.values()) {
    drawObject(ctx, obj, cellSize);
  }

  // 5. 绘制 Agent
  for (const agentState of worldState.agents.values()) {
    drawAgent(ctx, agentState, cellSize);
  }

  // 6. 更新缩略图视口
  updateMinimapViewport();
}

// ========== 网格覆盖层 ==========
function drawGridOverlay(ctx) {
  const ts = CONFIG.MAP_CELL_SIZE;
  const cols = Math.floor(CONFIG.MAP_IMAGE_WIDTH / ts);
  const effectiveH = CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET;
  const rows = Math.floor(effectiveH / ts);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let x = 0; x <= cols; x++) {
    ctx.moveTo(x * ts, 0);
    ctx.lineTo(x * ts, effectiveH);
  }
  for (let y = 0; y <= rows; y++) {
    ctx.moveTo(0, y * ts);
    ctx.lineTo(CONFIG.MAP_IMAGE_WIDTH, y * ts);
  }
  ctx.stroke();
}

// ========== 区域覆盖层 ==========
function drawAreaOverlays(ctx) {
  const ts = CONFIG.MAP_CELL_SIZE;
  const areas = state.world.getAreas();

  for (const area of areas) {
    const isMultiSelected = state.selectedAreas.some((sa) => sa.id === area.id);
    const fillColor = area.isBlocked
      ? "rgba(231, 76, 60, 0.25)"
      : "rgba(46, 204, 113, 0.15)";

    // 填充每个格子
    ctx.fillStyle = fillColor;
    for (const c of area.cells) {
      ctx.fillRect(c.x * ts, c.y * ts, ts, ts);
    }

    // 边框：只画外边缘格子的外边线
    const strokeColor = isMultiSelected
      ? "#f1c40f"
      : area.isBlocked
        ? "#e74c3c"
        : "#2ecc71";
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isMultiSelected ? 3 : 2;
    const cellSet = new Set(area.cells.map((c) => `${c.x},${c.y}`));
    for (const c of area.cells) {
      const px = c.x * ts;
      const py = c.y * ts;
      if (!cellSet.has(`${c.x},${c.y - 1}`)) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + ts, py);
        ctx.stroke();
      }
      if (!cellSet.has(`${c.x},${c.y + 1}`)) {
        ctx.beginPath();
        ctx.moveTo(px, py + ts);
        ctx.lineTo(px + ts, py + ts);
        ctx.stroke();
      }
      if (!cellSet.has(`${c.x - 1},${c.y}`)) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py + ts);
        ctx.stroke();
      }
      if (!cellSet.has(`${c.x + 1},${c.y}`)) {
        ctx.beginPath();
        ctx.moveTo(px + ts, py);
        ctx.lineTo(px + ts, py + ts);
        ctx.stroke();
      }
    }

    // 名称标签（放在包围盒中心）
    if (area.name) {
      const bbox = computeAreaBBox(area);
      const cx = (bbox.x + bbox.w / 2) * ts;
      const cy = (bbox.y + bbox.h / 2) * ts;
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      const nameWidth = ctx.measureText(area.name).width + 12;
      ctx.fillRect(cx - nameWidth / 2, cy - 9, nameWidth, 18);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(area.name, cx, cy + 4);
    }
  }

  // 编辑模式：绘制圈选路径
  if (state.isEditMode && state.isFreehand && state.freehandPath.length > 0) {
    const color = state.paintMode === "blocked" ? "#e74c3c" : "#2ecc71";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (const p of state.freehandPath) {
      ctx.strokeRect(p.x * ts + 1, p.y * ts + 1, ts - 2, ts - 2);
    }
  }
}

// ========== 坐标转换 ==========
function screenToGrid(e) {
  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  const pixelX = (e.clientX - rect.left) * scaleX;
  const pixelY = (e.clientY - rect.top) * scaleY;
  return {
    gridX: Math.floor(pixelX / CONFIG.MAP_CELL_SIZE),
    gridY: Math.floor(pixelY / CONFIG.MAP_CELL_SIZE),
    pixelX,
    pixelY,
  };
}

// ========== 画布变换 ==========
function applyCanvasTransform() {
  const container = state.canvas.parentElement;
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const dw = CONFIG.MAP_IMAGE_WIDTH * CONFIG.zoom;
  const dh = (CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET) * CONFIG.zoom;

  // 默认居中
  canvasPanX = (cw - dw) / 2;
  canvasPanY = (ch - dh) / 2;

  state.canvas.style.transform = `translate(${canvasPanX}px, ${canvasPanY}px)`;
}

function updateCanvasTransform() {
  state.canvas.style.transform = `translate(${canvasPanX}px, ${canvasPanY}px)`;
}

// ========== 缩放 ==========
function handleCanvasWheel(e) {
  e.preventDefault();
  const container = state.canvas.parentElement;
  const containerRect = container.getBoundingClientRect();

  // 光标在容器内的位置
  const cx = e.clientX - containerRect.left;
  const cy = e.clientY - containerRect.top;

  // 光标下的画布像素坐标
  const canvasPixelX = cx - canvasPanX;
  const canvasPixelY = cy - canvasPanY;

  const oldZoom = CONFIG.zoom;
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  CONFIG.zoom = Math.max(0.3, Math.min(2.5, CONFIG.zoom + delta));

  state.canvas.style.width = `${CONFIG.MAP_IMAGE_WIDTH * CONFIG.zoom}px`;
  state.canvas.style.height = `${(CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET) * CONFIG.zoom}px`;

  // 调整 pan 使光标下的画布像素保持不动
  canvasPanX = cx - canvasPixelX * (CONFIG.zoom / oldZoom);
  canvasPanY = cy - canvasPixelY * (CONFIG.zoom / oldZoom);

  updateCanvasTransform();
  updateMinimapViewport();
}

// ========== 区域辅助函数 ==========
function computeAreaBBox(area) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const c of area.cells) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function rectToCells(rx, ry, rw, rh) {
  const cells = [];
  for (let dy = 0; dy < rh; dy++) {
    for (let dx = 0; dx < rw; dx++) {
      cells.push({ x: rx + dx, y: ry + dy });
    }
  }
  return cells;
}

// ========== 区域编辑器函数 ==========
let _areaIdCounter = 0;
function addArea(cells, name, isBlocked, skipHistory) {
  const area = {
    id: "area_" + Date.now() + "_" + ++_areaIdCounter,
    name: name || "",
    cells: cells,
    isBlocked,
  };
  state.areas.push(area);
  state.world.setAreas(state.areas);
  renderAreaListInEditor();
  if (!skipHistory) saveAreaHistory();
}

function selectAreaAt(gridX, gridY) {
  for (let i = state.areas.length - 1; i >= 0; i--) {
    const a = state.areas[i];
    if (a.cells.some((c) => c.x === gridX && c.y === gridY)) {
      state.editorSelectedArea = a;
      renderAreaProperties(a);
      return;
    }
  }
  state.editorSelectedArea = null;
  renderAreaProperties(null);
}

function eraseAreaAt(gridX, gridY) {
  for (let i = state.areas.length - 1; i >= 0; i--) {
    const a = state.areas[i];
    const cellIdx = a.cells.findIndex((c) => c.x === gridX && c.y === gridY);
    if (cellIdx >= 0) {
      a.cells.splice(cellIdx, 1);
      if (a.cells.length === 0) {
        state.areas.splice(i, 1);
      }
      state.world.setAreas(state.areas);
      state.editorSelectedArea = null;
      renderAreaListInEditor();
      renderAreaProperties(null);
      saveAreaHistory();
      return;
    }
  }
}

function mergeSelectedAreas() {
  if (state.selectedAreas.length < 2) {
    showHint("请先 Ctrl/Shift 多选至少2个区域");
    return;
  }

  // 布尔并集：合并所有选中区域的格子
  const mergedCells = new Map();
  const firstArea = state.selectedAreas[0];

  for (const a of state.selectedAreas) {
    for (const c of a.cells) {
      mergedCells.set(`${c.x},${c.y}`, c);
    }
  }

  const cells = [...mergedCells.values()];

  // 移除被合并的区域
  const mergeIds = new Set(state.selectedAreas.map((a) => a.id));
  state.areas = state.areas.filter((a) => !mergeIds.has(a.id));

  // 添加合并后的区域
  addArea(cells, firstArea.name, firstArea.isBlocked);

  state.selectedAreas = [];
  state.editorSelectedArea = null;
  renderAreaListInEditor();
  renderAreaProperties(null);
  showHint(`已合并 ${cells.length} 个格子`);
}

function paintAtGrid(gridX, gridY) {
  const isBlocked = state.paintMode === "blocked";
  addArea([{ x: gridX, y: gridY }], "", isBlocked);
}

// 撤销/重做
const editHistory = {
  stack: [],
  index: -1,
  maxSize: 50,
};

function saveAreaHistory() {
  const snapshot = JSON.parse(JSON.stringify(state.areas));
  editHistory.stack = editHistory.stack.slice(0, editHistory.index + 1);
  editHistory.stack.push(snapshot);
  if (editHistory.stack.length > editHistory.maxSize) {
    editHistory.stack.shift();
  }
  editHistory.index = editHistory.stack.length - 1;
}

function undo() {
  if (editHistory.index > 0) {
    editHistory.index--;
    state.areas = JSON.parse(
      JSON.stringify(editHistory.stack[editHistory.index]),
    );
    state.world.setAreas(state.areas);
    renderAreaListInEditor();
  }
}

function redo() {
  if (editHistory.index < editHistory.stack.length - 1) {
    editHistory.index++;
    state.areas = JSON.parse(
      JSON.stringify(editHistory.stack[editHistory.index]),
    );
    state.world.setAreas(state.areas);
    renderAreaListInEditor();
  }
}

// ========== 编辑器UI渲染 ==========
function renderAreaListInEditor() {
  const container = document.getElementById("editor-area-content");
  if (!container) return;

  if (state.areas.length === 0) {
    container.innerHTML = '<div class="empty-state">在地图上拖拽创建区域</div>';
    return;
  }

  container.innerHTML = state.areas
    .map((a, i) => {
      const bbox = computeAreaBBox(a);
      return `
    <div class="area-item ${state.editorSelectedArea?.id === a.id ? "selected" : ""} ${state.selectedAreas.some((sa) => sa.id === a.id) ? "selected-multi" : ""}"
         data-area-index="${i}" data-area-id="${a.id}">
      <span class="area-color" style="background:${a.isBlocked ? "#e74c3c" : "#2ecc71"}"></span>
      <span class="area-name">${a.name || "未命名区域"}</span>
      <span class="area-pos">${a.cells.length}格 (${bbox.w}x${bbox.h})</span>
    </div>
  `;
    })
    .join("");

  // 绑定点击事件
  if (state._lastAreaClickIndex === undefined) state._lastAreaClickIndex = -1;
  container.querySelectorAll(".area-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      const idx = parseInt(el.dataset.areaIndex);
      if (e.shiftKey && state._lastAreaClickIndex >= 0) {
        // Shift+click: 范围选择
        const start = Math.min(state._lastAreaClickIndex, idx);
        const end = Math.max(state._lastAreaClickIndex, idx);
        for (let i = start; i <= end; i++) {
          if (!state.selectedAreas.some((sa) => sa.id === state.areas[i].id)) {
            state.selectedAreas.push(state.areas[i]);
          }
        }
        renderAreaListInEditor();
      } else if (e.ctrlKey || e.metaKey) {
        const areaId = el.dataset.areaId;
        const existing = state.selectedAreas.findIndex(
          (sa) => sa.id === areaId,
        );
        if (existing >= 0) {
          state.selectedAreas.splice(existing, 1);
        } else {
          state.selectedAreas.push(state.areas[idx]);
        }
        renderAreaListInEditor();
      } else {
        state.selectedAreas = [];
        state.editorSelectedArea = state.areas[idx];
        renderAreaProperties(state.areas[idx]);
        renderAreaListInEditor();
      }
      state._lastAreaClickIndex = idx;
    });
  });

  // 更新计数
  const countEl = document.getElementById("area-count");
  if (countEl) countEl.textContent = state.areas.length;
}

function renderAreaProperties(area) {
  const panel = document.getElementById("editor-area-properties");
  if (!panel) return;

  if (!area) {
    panel.innerHTML = '<div class="empty-state">点击区域查看属性</div>';
    return;
  }

  const bbox = computeAreaBBox(area);
  panel.innerHTML = `
    <div class="form-group">
      <label>名称</label>
      <input type="text" id="area-name-input" value="${area.name || ""}" placeholder="区域名称">
    </div>
    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" id="area-blocked-input" ${area.isBlocked ? "checked" : ""}>
        <span>不可通行</span>
      </label>
    </div>
    <div class="form-group">
      <span class="area-info">格子: ${area.cells.length}  包围盒: (${bbox.x}, ${bbox.y}) ${bbox.w}x${bbox.h}</span>
    </div>
    <div class="form-actions">
      <button class="btn btn-small btn-danger" id="btn-delete-area">删除</button>
    </div>
  `;

  // 绑定事件
  document.getElementById("area-name-input")?.addEventListener("input", (e) => {
    area.name = e.target.value;
    state.world.setAreas(state.areas);
    renderAreaListInEditor();
  });

  document
    .getElementById("area-blocked-input")
    ?.addEventListener("change", (e) => {
      area.isBlocked = e.target.checked;
      state.world.setAreas(state.areas);
      renderAreaListInEditor();
    });

  document.getElementById("btn-delete-area")?.addEventListener("click", () => {
    const idx = state.areas.indexOf(area);
    if (idx >= 0) {
      state.areas.splice(idx, 1);
      state.world.setAreas(state.areas);
      state.editorSelectedArea = null;
      renderAreaListInEditor();
      renderAreaProperties(null);
    }
  });
}

function updateEditorInfo() {
  const gridInfo = document.getElementById("map-dimensions");
  if (gridInfo) {
    const cols = Math.floor(CONFIG.MAP_IMAGE_WIDTH / CONFIG.MAP_CELL_SIZE);
    const rows = Math.floor(
      (CONFIG.MAP_IMAGE_HEIGHT - CONFIG.MAP_TOP_OFFSET) / CONFIG.MAP_CELL_SIZE,
    );
    gridInfo.textContent = `${cols} x ${rows}`;
  }
}

function updateAgentPositionsForNewCellSize(oldSize, newSize) {
  if (!state.world) return;
  const ratio = oldSize / newSize;
  for (const agent of state.world.agents.values()) {
    const pos = agent.getPosition();
    agent.setPosition({
      x: Math.round(pos.x * ratio),
      y: Math.round(pos.y * ratio),
    });
  }
}

// ========== 保存/加载 ==========
function saveMapData() {
  const data = {
    version: "2.0",
    tileSize: CONFIG.MAP_CELL_SIZE,
    areas: state.areas,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "map-data.json";
  a.click();
  URL.revokeObjectURL(url);
}

function loadMapData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (data.tileSize) {
        CONFIG.MAP_CELL_SIZE = data.tileSize;
        updateEditorInfo();
      }
      if (data.areas) {
        // 兼容旧格式：把 {x,y,w,h} 转换为 {cells}
        state.areas = data.areas.map((a) => {
          if (a.cells) return a;
          if (a.w != null && a.h != null) {
            return {
              id: a.id,
              name: a.name || "",
              cells: rectToCells(a.x, a.y, a.w, a.h),
              isBlocked: a.isBlocked,
            };
          }
          return a;
        });
        state.world.setAreas(state.areas);
        renderAreaListInEditor();
      }
    } catch (err) {
      console.error("加载地图数据失败:", err);
    }
  };
  reader.readAsText(file);
}

function clearMap() {
  state.areas = [];
  state.world.setAreas(state.areas);
  state.editorSelectedArea = null;
  renderAreaListInEditor();
  renderAreaProperties(null);
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
    ctx.drawImage(
      sprite,
      x - drawWidth / 2,
      y - drawHeight / 2,
      drawWidth,
      drawHeight,
    );
  } else {
    // 回退到原始矩形
    const size = cellSize * 3;
    switch (obj.type) {
      case "building":
        ctx.fillStyle = CONFIG.BUILDING_COLOR;
        break;
      case "area":
        ctx.fillStyle = CONFIG.AREA_COLOR;
        break;
      default:
        ctx.fillStyle = "#6c757d";
    }
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
  }

  // 名称标签
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  const textMeasure = ctx.measureText(obj.name);
  const nameWidth = textMeasure.width + 10;
  const labelY = y + (sprite ? displaySize[1] : cellSize * 3) / 2 + 6;
  ctx.fillRect(x - nameWidth / 2, labelY - 12, nameWidth, 18);

  ctx.fillStyle = "#fff";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(obj.name, x, labelY + 2);
}

// ========== Agent 绘制 ==========
function drawAgent(ctx, agent, cellSize) {
  const x = agent.position.x * cellSize;
  const y = agent.position.y * cellSize;

  const animConfig = getCharacterAnimation(agent.agentId);
  const displaySize = getCharacterDisplaySize(agent.agentId);

  if (animConfig) {
    // 动画模式：从独立帧文件绘制
    let direction = agent.facingDirection || "down";
    const action = agent.status === "moving" ? "walk" : "idle";
    const frameCount =
      action === "walk" ? animConfig.walkFrames : animConfig.idleFrames;
    const flipH = direction === "right"; // 右方向 = 左方向水平翻转
    if (flipH) direction = "left"; // 加载左方向的图片

    // 初始化或更新动画状态
    let state = agentAnimState.get(agent.agentId);
    if (!state) {
      state = { frameIndex: 0, lastFrameTime: 0, lastAction: action };
      agentAnimState.set(agent.agentId, state);
    }

    // 动作变化时重置帧
    if (action !== state.lastAction) {
      state.frameIndex = 0;
      state.lastAction = action;
      state.lastFrameTime = performance.now();
    }

    // 走路动画帧循环（4fps = 250ms 每帧）
    if (action === "walk" && frameCount > 1) {
      const now = performance.now();
      if (now - state.lastFrameTime > 250) {
        state.frameIndex = (state.frameIndex + 1) % frameCount;
        state.lastFrameTime = now;
      }
    }

    // 构建帧文件路径（带角色名前缀，与导出工具命名一致）
    const charKey = getCharacterKey(agent.agentId);
    const framePath = `${ASSET_CONFIG.basePath}/${animConfig.basePath}${charKey}-${direction}-${action}-${state.frameIndex}.png`;
    const sprite = imageLoader.getImage(framePath);

    const drawWidth = 38;
    const drawHeight = sprite
      ? Math.round((drawWidth * sprite.naturalHeight) / sprite.naturalWidth)
      : Math.round((drawWidth * 174) / 113);

    // 绘制阴影
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y + drawHeight / 2 - 2, drawWidth / 3, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (sprite) {
      if (flipH) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(-1, 1);
        ctx.drawImage(
          sprite,
          -drawWidth / 2,
          -drawHeight / 2,
          drawWidth,
          drawHeight,
        );
        ctx.restore();
      } else {
        ctx.drawImage(
          sprite,
          x - drawWidth / 2,
          y - drawHeight / 2,
          drawWidth,
          drawHeight,
        );
      }
    } else {
      ctx.fillStyle = "#e94560";
      ctx.fillRect(
        x - drawWidth / 2,
        y - drawHeight / 2,
        drawWidth,
        drawHeight,
      );
    }
  } else {
    // 静态模式：使用单张精灵图
    const spritePath = getCharacterSprite(agent.agentId);
    const sprite = spritePath ? imageLoader.getImage(spritePath) : null;

    if (sprite) {
      const drawWidth = 38;
      const drawHeight = sprite
        ? Math.round((drawWidth * sprite.naturalHeight) / sprite.naturalWidth)
        : Math.round((drawWidth * 174) / 113);

      // 绘制阴影
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.beginPath();
      ctx.ellipse(
        x,
        y + drawHeight / 2 - 2,
        drawWidth / 3,
        6,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // 绘制角色
      ctx.drawImage(
        sprite,
        x - drawWidth / 2,
        y - drawHeight / 2,
        drawWidth,
        drawHeight,
      );
    } else {
      // 回退到圆形
      const radius = cellSize * 0.8;
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
      switch (agent.status) {
        case "busy":
          ctx.fillStyle = "#ffc107";
          break;
        case "sleeping":
          ctx.fillStyle = "#6c757d";
          break;
        default:
          ctx.fillStyle = "#28a745";
      }
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = CONFIG.AGENT_COLOR;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // 状态指示点
  const statusColors = {
    idle: "#28a745",
    busy: "#ffc107",
    sleeping: "#6c757d",
    moving: "#17a2b8",
  };
  const statusColor = statusColors[agent.status] || "#28a745";
  const useAnimSize = !!animConfig;
  const offsetX = useAnimSize ? displaySize[0] / 2 : cellSize / 2;
  const offsetY = useAnimSize ? displaySize[1] / 2 : cellSize / 2;

  ctx.beginPath();
  ctx.arc(x + offsetX - 10, y + offsetY - 10, 5, 0, Math.PI * 2);
  ctx.fillStyle = statusColor;
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.stroke();

  // 名字标签
  const nameY = y - (useAnimSize ? displaySize[1] : cellSize) / 2 - 8;
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  const nameWidth = ctx.measureText(agent.name).width + 10;
  ctx.fillRect(x - nameWidth / 2, nameY - 12, nameWidth, 16);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(agent.name, x, nameY);

  // 计算需要显示的气泡
  const hasAction =
    agent.currentAction &&
    (typeof agent.currentAction === "object"
      ? agent.currentAction.description
      : agent.currentAction);
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
    ctx.fillStyle = "rgba(200, 230, 255, 0.95)";
    ctx.strokeStyle = "#4a90d9";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(
      x - bubbleWidth / 2,
      bubbleTopY,
      bubbleWidth,
      bubbleHeight,
      8,
    );
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
    ctx.fillStyle = "#333";
    ctx.textAlign = "center";
    ctx.font = fontSize + "px sans-serif";
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
    const desc =
      typeof agent.currentAction === "object"
        ? agent.currentAction.description
        : agent.currentAction;
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
    ctx.fillStyle = "rgba(255, 250, 220, 0.95)";
    ctx.strokeStyle = "#e6a23c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(
      x - bubbleWidth / 2,
      bubbleTopY,
      bubbleWidth,
      bubbleHeight,
      6,
    );
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
    ctx.fillStyle = "#666";
    ctx.textAlign = "center";
    ctx.font = fontSize + "px sans-serif";
    // 垂直居中：起始位置 = 顶部 + 内边距 + 字体基线偏移
    const startY = bubbleTopY + paddingY + fontSize;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, startY + i * lineHeight);
    }

    // 如果没有对话气泡，三角形指向下方的名字；如果有，三角形指向下方气泡
    // 这里已经通过 bubbleBottomY 位置自动实现了
  }

  // 睡眠效果
  if (agent.status === "sleeping") {
    const sleepImage = imageLoader.getImage("/assets/ui/sleep-zzz.png");
    // 计算睡眠效果位置（在最上方气泡的上面）
    let sleepY = currentBubbleY - 25;
    if (!hasAction && !hasDialogue) {
      sleepY = baseY - 10;
    }
    if (sleepImage) {
      const oscillation = Math.sin(Date.now() / 500) * 3;
      ctx.drawImage(sleepImage, x + 15, sleepY + oscillation, 20, 20);
    } else {
      ctx.fillStyle = "#6495ed";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Zzz...", x + 15, sleepY + 10);
    }
  }
}

// ========== 交互处理 ==========
function handleMouseMove(e) {
  // 拖拽平移
  if (isPanning) {
    canvasPanX = panOffsetX + (e.clientX - panStartX);
    canvasPanY = panOffsetY + (e.clientY - panStartY);
    updateCanvasTransform();
    updateMinimapViewport();
    return;
  }

  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  const mouseX = (e.clientX - rect.left) * scaleX;
  const mouseY = (e.clientY - rect.top) * scaleY;
  const cellSize = CONFIG.MAP_CELL_SIZE;

  // 编辑模式下画笔拖拽：根据手势模式添加或移除格子
  if (state.isEditMode && state.paintingArea) {
    const { gridX, gridY } = screenToGrid(e);
    const key = `${gridX},${gridY}`;
    if (!state.affectedCells.has(key)) {
      state.affectedCells.add(key);
      if (state.paintGestureMode === "paint") {
        state.paintingArea.cells.push({ x: gridX, y: gridY });
      } else {
        state.paintingArea.cells = state.paintingArea.cells.filter(
          (c) => !(c.x === gridX && c.y === gridY),
        );
        if (state.paintingArea.cells.length === 0) {
          const idx = state.areas.indexOf(state.paintingArea);
          if (idx >= 0) state.areas.splice(idx, 1);
          state.paintingArea = null;
        }
      }
      state.world.setAreas(state.areas);
    }
    return;
  }

  // 编辑模式下更新圈选路径
  if (state.isEditMode && state.isFreehand) {
    const { gridX, gridY } = screenToGrid(e);
    const last = state.freehandPath[state.freehandPath.length - 1];
    if (!last || last.x !== gridX || last.y !== gridY) {
      state.freehandPath.push({ x: gridX, y: gridY });
    }
    return;
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

    if (
      mouseX >= ax - drawWidth / 2 &&
      mouseX <= ax + drawWidth / 2 &&
      mouseY >= ay - drawHeight / 2 &&
      mouseY <= ay + drawHeight / 2
    ) {
      hovered = { type: "agent", data: agent };
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

      if (
        mouseX >= ox - (drawWidth / 2) * 1.5 &&
        mouseX <= ox + (drawWidth / 2) * 1.5 &&
        mouseY >= oy - (drawHeight / 2) * 1.5 &&
        mouseY <= oy + (drawHeight / 2) * 1.5
      ) {
        hovered = { type: "object", data: obj };
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
  // 编辑模式下由 mousedown/mouseup 处理
  if (state.isEditMode) {
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

    if (
      mouseX >= ax - drawWidth / 2 &&
      mouseX <= ax + drawWidth / 2 &&
      mouseY >= ay - drawHeight / 2 &&
      mouseY <= ay + drawHeight / 2
    ) {
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
  const card = document.getElementById("agent-card");
  if (!card) return;

  // 填充数据
  const portraitPath = getCharacterPortrait(agent.agentId);
  const portraitImg = document.getElementById("agent-card-portrait");
  if (portraitImg) {
    portraitImg.src = portraitPath || "";
    portraitImg.onerror = () => {
      portraitImg.style.display = "none";
    };
    portraitImg.onload = () => {
      portraitImg.style.display = "block";
    };
  }

  document.getElementById("agent-card-name").textContent = agent.name;
  document.getElementById("agent-card-status").textContent = agent.status;

  // 健康条（保留1位小数）
  const healthCurrent = Math.round((agent.health?.current ?? 0) * 10) / 10;
  const healthMax = Math.round((agent.health?.max ?? 100) * 10) / 10;
  const healthPercent = healthMax > 0 ? (healthCurrent / healthMax) * 100 : 0;
  document.getElementById("agent-card-health-bar").style.width =
    `${healthPercent}%`;
  document.getElementById("agent-card-health-text").textContent =
    `${healthCurrent}/${healthMax}`;

  // 饱腹条
  const fullnessValue = Math.round((agent.fullness ?? 0) * 10) / 10;
  const fullnessPercent = Math.min(Math.max(fullnessValue, 0), 100);
  document.getElementById("agent-card-fullness-bar").style.width =
    `${fullnessPercent}%`;
  document.getElementById("agent-card-fullness-text").textContent =
    `${fullnessValue}/100`;

  // 积分
  document.getElementById("agent-card-points").textContent =
    Math.round((agent.greenPoints ?? 0) * 10) / 10;

  // 当前动作
  const actionDesc =
    typeof agent.currentAction === "object"
      ? agent.currentAction?.description
      : agent.currentAction;
  document.getElementById("agent-card-action").textContent =
    actionDesc || "空闲";

  // 定位卡片
  const container = document.querySelector(".map-container");
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
  card.classList.remove("hidden");
}

function hideAgentCard() {
  const card = document.getElementById("agent-card");
  if (card) {
    card.classList.add("hidden");
  }
}

function setupAgentCardListeners() {
  // 关闭按钮
  document
    .getElementById("agent-card-close")
    ?.addEventListener("click", hideAgentCard);

  // 点击卡片外部关闭（通过阻止事件冒泡实现）
  document.getElementById("agent-card")?.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

// ========== 鼠标事件 ==========
function handleCanvasMouseDown(e) {
  if (state.isEditMode) {
    const { gridX, gridY } = screenToGrid(e);

    if (state.editorTool === "area") {
      const key = `${gridX},${gridY}`;
      // Check if clicking on an existing painted cell → erase mode
      let targetArea = null;
      for (let i = state.areas.length - 1; i >= 0; i--) {
        if (state.areas[i].cells.some((c) => `${c.x},${c.y}` === key)) {
          targetArea = state.areas[i];
          break;
        }
      }

      state.paintedCells = new Set([key]);
      state.affectedCells = new Set([key]);

      if (targetArea) {
        // Erase mode: remove the clicked cell
        state.paintGestureMode = "erase";
        state.paintingArea = targetArea;
        targetArea.cells = targetArea.cells.filter(
          (c) => !(c.x === gridX && c.y === gridY),
        );
        if (targetArea.cells.length === 0) {
          const idx = state.areas.indexOf(targetArea);
          if (idx >= 0) state.areas.splice(idx, 1);
          state.paintingArea = null;
        }
      } else {
        // Paint mode: create new area
        state.paintGestureMode = "paint";
        const isBlocked = state.paintMode === "blocked";
        const area = {
          id: "area_" + Date.now() + "_" + ++_areaIdCounter,
          name: "",
          cells: [{ x: gridX, y: gridY }],
          isBlocked,
        };
        state.areas.push(area);
        state.paintingArea = area;
      }
      state.world.setAreas(state.areas);
      renderAreaListInEditor();
    } else if (state.editorTool === "freehand") {
      state.isFreehand = true;
      state.freehandPath = [{ x: gridX, y: gridY }];
    } else if (state.editorTool === "select") {
      selectAreaAt(gridX, gridY);
    } else if (state.editorTool === "eraser") {
      eraseAreaAt(gridX, gridY);
    } else if (state.editorTool === "pan") {
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panOffsetX = canvasPanX;
      panOffsetY = canvasPanY;
      state.canvas.parentElement.style.cursor = "grabbing";
      e.preventDefault();
    }
    return;
  }

  // 非编辑模式：左键拖拽平移
  if (e.button === 0) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOffsetX = canvasPanX;
    panOffsetY = canvasPanY;
    state.canvas.parentElement.style.cursor = "grabbing";
    e.preventDefault();
  }
}

function handleCanvasMouseUp(e) {
  if (isPanning) {
    isPanning = false;
    state.canvas.parentElement.style.cursor = "grab";
  }

  if (state.isEditMode) {
    if (state.paintingArea) {
      if (state.paintingArea.cells.length > 0) {
        saveAreaHistory();
      } else {
        // No cells painted, remove the empty area
        const idx = state.areas.indexOf(state.paintingArea);
        if (idx >= 0) state.areas.splice(idx, 1);
        state.world.setAreas(state.areas);
        renderAreaListInEditor();
      }
      state.paintingArea = null;
      state.paintedCells = new Set();
      state.affectedCells = new Set();
    }

    if (state.isFreehand && state.freehandPath.length > 0) {
      const pathCells = new Set();
      for (const p of state.freehandPath) {
        pathCells.add(`${p.x},${p.y}`);
      }

      // 1) 直接相交：路径穿过区域格子
      for (const area of state.areas) {
        for (const c of area.cells) {
          if (pathCells.has(`${c.x},${c.y}`)) {
            if (!state.selectedAreas.some((sa) => sa.id === area.id)) {
              state.selectedAreas.push(area);
            }
            break;
          }
        }
      }

      // 2) 洪水填充：检测路径围住的区域
      if (state.areas.length > state.selectedAreas.length) {
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const p of state.freehandPath) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        const blocked = new Set(pathCells);
        const visited = new Set();
        const queue = [];
        // 从边界格子开始洪水填充
        for (let x = minX; x <= maxX; x++) {
          if (!blocked.has(`${x},${minY}`)) queue.push({ x, y: minY });
          if (!blocked.has(`${x},${maxY}`)) queue.push({ x, y: maxY });
        }
        for (let y = minY; y <= maxY; y++) {
          if (!blocked.has(`${minX},${y}`)) queue.push({ x: minX, y: y });
          if (!blocked.has(`${maxX},${y}`)) queue.push({ x: maxX, y: y });
        }
        while (queue.length > 0) {
          const { x, y } = queue.pop();
          const key = `${x},${y}`;
          if (visited.has(key) || blocked.has(key)) continue;
          if (x < minX || x > maxX || y < minY || y > maxY) continue;
          visited.add(key);
          queue.push(
            { x: x - 1, y },
            { x: x + 1, y },
            { x, y: y - 1 },
            { x, y: y + 1 },
          );
        }
        // 包围盒内未被洪水到达的格子 = 被围住的区域
        const enclosedCells = new Set();
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const key = `${x},${y}`;
            if (!visited.has(key) && !blocked.has(key)) {
              enclosedCells.add(key);
            }
          }
        }
        for (const area of state.areas) {
          if (state.selectedAreas.some((sa) => sa.id === area.id)) continue;
          for (const c of area.cells) {
            if (enclosedCells.has(`${c.x},${c.y}`)) {
              state.selectedAreas.push(area);
              break;
            }
          }
        }
      }

      state.isFreehand = false;
      state.freehandPath = [];
      renderAreaListInEditor();
      showHint(`圈选了 ${state.selectedAreas.length} 个区域`);
    }
  }
}

function handleEditorKeyDown(e) {
  if (!state.isEditMode) return;

  // Ctrl+Z 撤销, Ctrl+Y/Ctrl+Shift+Z 重做
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  }

  // Delete 键删除选中区域
  if (e.key === "Delete" && state.editorSelectedArea) {
    const idx = state.areas.indexOf(state.editorSelectedArea);
    if (idx >= 0) {
      state.areas.splice(idx, 1);
      state.world.setAreas(state.areas);
      state.editorSelectedArea = null;
      renderAreaListInEditor();
      renderAreaProperties(null);
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
  const hours = time.getHours().toString().padStart(2, "0");
  const minutes = time.getMinutes().toString().padStart(2, "0");
  const period = hours >= 12 ? "下午" : "上午";
  const displayHours = hours % 12 || 12;
  document.getElementById("game-time").textContent =
    `${period} ${displayHours}:${minutes}`;
}

function updateTickCount(count) {
  const tickCount = typeof count === "number" ? count : 0;
  document.getElementById("tick-count").textContent = `Tick: ${tickCount}`;
}

function updateTownHealth(health) {
  const healthFill = document.getElementById("town-health-fill");
  const healthText = document.getElementById("town-health-text");
  if (healthFill && health) {
    healthFill.style.width = `${(health.current / health.max) * 100}%`;
  }
  if (healthText && health) {
    const current = Math.round(health.current * 10) / 10;
    const max = Math.round(health.max * 10) / 10;
    healthText.textContent = `${current}/${max}`;
  }
}

function updateSimulationStatus() {
  const statusEl = document.getElementById("simulation-status");
  const btnStart = document.getElementById("btn-start");
  const btnStop = document.getElementById("btn-stop");

  if (state.simulationRunning) {
    statusEl.textContent = "运行中";
    statusEl.className = "status running";
    btnStart.disabled = true;
    btnStop.disabled = false;
  } else {
    statusEl.textContent = "已停止";
    statusEl.className = "status stopped";
    btnStart.disabled = false;
    btnStop.disabled = true;
  }
}

function renderAgentList() {
  const container = document.getElementById("agent-list");
  const worldState = state.world.getWorldState();

  if (worldState.agents.size === 0) {
    container.innerHTML = '<div class="empty-state">暂无 Agent</div>';
    return;
  }

  const html = Array.from(worldState.agents.values())
    .map((agent) => {
      const actionDesc =
        typeof agent.currentAction === "object"
          ? agent.currentAction?.description
          : agent.currentAction;
      const portraitPath = getCharacterPortrait(agent.agentId);
      const portrait = portraitPath ? imageLoader.getImage(portraitPath) : null;

      // 计算警告图标
      const healthPercent = agent.health
        ? agent.health.current / agent.health.max
        : 1;
      const fullnessPercent = (agent.fullness ?? 100) / 100;
      let warningIcons = "";
      if (healthPercent < 0.3) {
        warningIcons +=
          '<span class="warning-icon health-critical" title="健康危急">❤️</span>';
      } else if (healthPercent < 0.5) {
        warningIcons +=
          '<span class="warning-icon health-low" title="健康较低">💔</span>';
      }
      if (fullnessPercent < 0.2) {
        warningIcons +=
          '<span class="warning-icon fullness-critical" title="极度饥饿">🍖</span>';
      } else if (fullnessPercent < 0.4) {
        warningIcons +=
          '<span class="warning-icon fullness-low" title="饥饿">🍗</span>';
      }

      // 保留1位小数
      const healthCurrent = Math.round((agent.health?.current ?? 0) * 10) / 10;
      const healthMax = Math.round((agent.health?.max ?? 100) * 10) / 10;
      const fullnessValue = Math.round((agent.fullness ?? 0) * 10) / 10;
      const greenPoints = Math.round((agent.greenPoints ?? 0) * 10) / 10;

      return `
      <div class="agent-item ${healthPercent < 0.3 ? "agent-critical" : ""}" data-agent-id="${agent.agentId}">
        <div class="agent-avatar">
          ${portrait ? `<img src="${portraitPath}" alt="${agent.name}" onerror="this.style.display='none';this.parentElement.textContent='🤖'">` : "🤖"}
          <span class="status-dot ${agent.status}"></span>
        </div>
        <div class="agent-info">
          <div class="agent-name">${agent.name} ${warningIcons}</div>
          <div class="agent-status">${agent.status} · ${actionDesc || "空闲"}</div>
          <div class="agent-position">(${agent.position.x}, ${agent.position.y})</div>
          <div class="agent-stats">
            <span class="stat ${healthPercent < 0.3 ? "stat-critical" : healthPercent < 0.5 ? "stat-warning" : ""}" title="健康">❤️ ${healthCurrent}/${healthMax}</span>
            <span class="stat" title="绿色积分">🌿 ${greenPoints}</span>
            <span class="stat ${fullnessPercent < 0.2 ? "stat-critical" : fullnessPercent < 0.4 ? "stat-warning" : ""}" title="饱腹">🍖 ${fullnessValue}/100</span>
          </div>
        </div>
      </div>
    `;
    })
    .join("");

  container.innerHTML = html;

  container.querySelectorAll(".agent-item").forEach((item) => {
    item.addEventListener("click", () => {
      showAgentDetails(item.dataset.agentId);
    });
  });
}

function showAgentDetails(agentId) {
  const agent = state.world.agents.get(agentId);
  if (!agent) return;

  const memoryData = agent.memory.exportData();
  const portraitPath = getCharacterPortrait(agent.agentId);

  document.getElementById("modal-agent-name").textContent = agent.name;
  document.getElementById("modal-agent-id").textContent = agent.id;
  document.getElementById("modal-agent-age").textContent =
    `${agent.config.age}岁`;
  document.getElementById("modal-agent-traits").textContent =
    agent.config.traits;
  document.getElementById("modal-agent-position").textContent =
    `(${agent.position.x}, ${agent.position.y})`;
  document.getElementById("modal-agent-status").textContent = agent.status;

  // 显示生存属性 - 条形图（保留1位小数）
  const healthCurrent = Math.round((agent.health?.current ?? 0) * 10) / 10;
  const healthMax = Math.round((agent.health?.max ?? 100) * 10) / 10;
  const healthEl = document.getElementById("modal-agent-health");
  const healthBar = document.getElementById("modal-agent-health-bar");
  if (healthEl) healthEl.textContent = `${healthCurrent}/${healthMax}`;
  if (healthBar) {
    const healthPercent = healthMax > 0 ? (healthCurrent / healthMax) * 100 : 0;
    healthBar.style.width = `${healthPercent}%`;
  }

  const greenPointsEl = document.getElementById("modal-agent-greenpoints");
  if (greenPointsEl)
    greenPointsEl.textContent = Math.round((agent.greenPoints ?? 0) * 10) / 10;

  const fullnessValue = Math.round((agent.fullness ?? 0) * 10) / 10;
  const fullnessEl = document.getElementById("modal-agent-fullness");
  const fullnessBar = document.getElementById("modal-agent-fullness-bar");
  if (fullnessEl) fullnessEl.textContent = `${fullnessValue}/100`;
  if (fullnessBar) {
    const fullnessPercent = Math.min(Math.max(fullnessValue, 0), 100);
    fullnessBar.style.width = `${fullnessPercent}%`;
  }
  const actionText =
    typeof agent.currentAction === "object"
      ? agent.currentAction?.description
      : agent.currentAction;
  document.getElementById("modal-agent-action").textContent =
    actionText || "无";
  document.getElementById("modal-agent-background").textContent =
    agent.config.background;

  // 添加头像
  const modalBody = document.querySelector("#agent-modal .modal-body");
  const existingPortrait = modalBody.querySelector(".modal-portrait");
  if (existingPortrait) existingPortrait.remove();

  if (portraitPath) {
    const portraitImg = document.createElement("img");
    portraitImg.src = portraitPath;
    portraitImg.className = "modal-portrait";
    portraitImg.style.width = "80px";
    portraitImg.style.height = "80px";
    portraitImg.style.borderRadius = "50%";
    portraitImg.style.marginBottom = "15px";
    portraitImg.onerror = () => (portraitImg.style.display = "none");
    modalBody.insertBefore(portraitImg, modalBody.firstChild);
  }

  document.getElementById("modal-agent-goals").innerHTML = agent.config.goals
    .map((goal) => `<li>${goal}</li>`)
    .join("");

  // 记忆
  const memoriesDiv = document.getElementById("modal-memories");
  if (memoryData.memories.length > 0) {
    memoriesDiv.innerHTML = memoryData.memories
      .slice(-20)
      .reverse()
      .map(
        (m) => `
      <div class="memory-item">
        <div class="memory-time">${new Date(m.timestamp).toLocaleString()}</div>
        <div class="memory-content">${m.content}</div>
      </div>
    `,
      )
      .join("");
  } else {
    memoriesDiv.innerHTML = '<div class="empty-state">暂无记忆</div>';
  }

  // 反思
  const reflectionsDiv = document.getElementById("modal-reflections");
  if (memoryData.reflections.length > 0) {
    reflectionsDiv.innerHTML = memoryData.reflections
      .slice(-10)
      .reverse()
      .map(
        (r) => `
      <div class="memory-item reflection">
        <div class="memory-time">${new Date(r.timestamp).toLocaleString()}</div>
        <div class="memory-content">${r.content}</div>
      </div>
    `,
      )
      .join("");
  } else {
    reflectionsDiv.innerHTML = '<div class="empty-state">暂无反思</div>';
  }

  showModal("agent-modal");
}

// ========== 事件日志 ==========
function addEvent(event) {
  const container = document.getElementById("event-log");
  const emptyState = container.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  const eventDiv = document.createElement("div");
  eventDiv.className = `event-item ${event.type === "world" ? "world-event" : ""} ${event.type === "dialogue" ? "dialogue" : ""}`;

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
    { name: "xiaoming", x: 5, y: 5 },
    { name: "xiaohong", x: 6, y: 5 },
    { name: "xiaomi", x: 7, y: 5 },
    { name: "xiaodong", x: 8, y: 5 },
  ];

  const total = positions.length;
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const template = agentTemplates[pos.name];
    if (template) {
      const name = template.name || pos.name;
      updateLoadingText(`正在初始化 ${name}... (${i + 1}/${total})`);
      updateLoadingProgress(30 + ((i / total) * 60));
      try {
        await state.world.addAgent(template, { x: pos.x, y: pos.y });
      } catch (err) {
        console.error(`添加 Agent ${name} 失败:`, err);
      }
    }
  }
  updateLoadingText("全部就绪！");
  updateLoadingProgress(100);

  // 隐藏加载界面
  hideLoadingScreen();
}

async function handleAddAgent(e) {
  e.preventDefault();
  const name = document.getElementById("new-agent-name").value;
  const age = parseInt(document.getElementById("new-agent-age").value);
  const traits = document.getElementById("new-agent-traits").value;
  const background = document.getElementById("new-agent-background").value;

  const template = {
    id: `agent_${Date.now()}`,
    name,
    age,
    traits,
    background,
    goals: ["探索世界", "结交朋友"],
  };

  await state.world.addAgent(template);
  hideModal("add-agent-modal");
  e.target.reset();
}

function handleTriggerEvent(e) {
  e.preventDefault();
  const type = document.getElementById("event-type").value;
  const description = document.getElementById("event-description").value;
  state.world.triggerEvent(type, description);
  hideModal("event-modal");
  e.target.reset();
}

// ========== 工具函数 ==========
function showTooltip(x, y, data) {
  const tooltip = document.getElementById("map-tooltip");
  if (!tooltip) return;

  let content = "";
  if (data.type === "agent") {
    content = `<strong>${data.data.name}</strong><br>状态：${data.data.status}<br>位置：(${data.data.position.x}, ${data.data.position.y})`;
  } else if (data.type === "object") {
    content = `<strong>${data.data.name}</strong><br>类型：${data.data.type}<br>${data.data.description}`;
  }

  tooltip.innerHTML = content;
  tooltip.style.left = `${x + 15}px`;
  tooltip.style.top = `${y + 15}px`;
  tooltip.classList.remove("hidden");
}

function hideTooltip() {
  const tooltip = document.getElementById("map-tooltip");
  if (tooltip) tooltip.classList.add("hidden");
}

function showModal(modalId) {
  document.getElementById(modalId).classList.remove("hidden");
}

function hideModal(modalId) {
  document.getElementById(modalId).classList.add("hidden");
}

// ========== 编辑模式功能 ==========
function initEditor() {
  // 设置编辑模式事件监听
  setupEditorListeners();

  // 保存初始历史状态
  saveAreaHistory();
}

function setupEditorListeners() {
  // 模式切换按钮
  const modeToggle = document.getElementById("btn-mode-toggle");
  modeToggle?.addEventListener("click", toggleEditMode);

  // 工具按钮（select, area, eraser）
  document.querySelectorAll(".toolbar-btn[data-tool]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".toolbar-btn[data-tool]")
        .forEach((b) => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
      state.editorTool = e.currentTarget.dataset.tool;
      // 更新光标
      const container = state.canvas?.parentElement;
      if (container) {
        container.style.cursor =
          state.editorTool === "pan" ? "grab" : "crosshair";
      }
    });
  });

  // Paint模式按钮（blocked/passable）
  document.querySelectorAll(".toolbar-btn[data-paint]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".toolbar-btn[data-paint]")
        .forEach((b) => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
      state.paintMode = e.currentTarget.dataset.paint;
    });
  });

  // 地块大小选择
  // 地块大小快捷按钮
  document.querySelectorAll("[data-tile]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const val = parseInt(e.currentTarget.dataset.tile);
      const oldVal = CONFIG.MAP_CELL_SIZE;
      document.getElementById("tile-size-input").value = val;
      CONFIG.MAP_CELL_SIZE = val;
      updateAgentPositionsForNewCellSize(oldVal, val);
      updateEditorInfo();
    });
  });

  // 地块大小手动输入
  document
    .getElementById("tile-size-input")
    ?.addEventListener("change", (e) => {
      const val = parseInt(e.target.value);
      if (val >= 8 && val <= 256) {
        const oldVal = CONFIG.MAP_CELL_SIZE;
        CONFIG.MAP_CELL_SIZE = val;
        updateAgentPositionsForNewCellSize(oldVal, val);
        updateEditorInfo();
      }
    });

  // 合并按钮
  document
    .getElementById("btn-merge-areas")
    ?.addEventListener("click", mergeSelectedAreas);

  // 保存/加载/清空
  document
    .getElementById("btn-save-map")
    ?.addEventListener("click", saveMapData);
  document.getElementById("btn-load-map")?.addEventListener("click", () => {
    document.getElementById("map-file-input")?.click();
  });
  document
    .getElementById("map-file-input")
    ?.addEventListener("change", loadMapData);
  document.getElementById("btn-clear-map")?.addEventListener("click", clearMap);
}

function toggleEditMode() {
  state.isEditMode = !state.isEditMode;

  const modeToggle = document.getElementById("btn-mode-toggle");
  const editorToolbar = document.getElementById("editor-toolbar");
  const simSidebar = document.getElementById("simulation-sidebar");
  const editorSidebar = document.getElementById("editor-sidebar");

  if (state.isEditMode) {
    if (modeToggle) modeToggle.textContent = "编辑模式";
    if (modeToggle) modeToggle.classList.add("active");
    if (editorToolbar) editorToolbar.classList.remove("hidden");
    if (simSidebar) simSidebar.classList.add("hidden");
    if (editorSidebar) editorSidebar.classList.remove("hidden");

    if (state.world) state.world.stop();

    updateEditorInfo();
    renderAreaListInEditor();
    renderAreaProperties(state.editorSelectedArea);
  } else {
    if (modeToggle) modeToggle.textContent = "模拟模式";
    if (modeToggle) modeToggle.classList.remove("active");
    if (editorToolbar) editorToolbar.classList.add("hidden");
    if (simSidebar) simSidebar.classList.remove("hidden");
    if (editorSidebar) editorSidebar.classList.add("hidden");

    // 同步区域到world
    state.world.setAreas(state.areas);
  }
}

function showHint(message) {
  const oldHint = document.querySelector(".editor-hint");
  if (oldHint) oldHint.remove();

  const hint = document.createElement("div");
  hint.className = "editor-hint";
  hint.textContent = message;
  document.body.appendChild(hint);

  setTimeout(() => {
    hint.style.opacity = "0";
    hint.style.transition = "opacity 0.3s";
    setTimeout(() => hint.remove(), 300);
  }, 3000);
}

// ========== 启动 ==========
// 暴露编辑器函数供测试使用
window._editorTest = {
  get state() {
    return state;
  },
  eraseAreaAt,
  mergeSelectedAreas,
  addArea,
  renderAreaListInEditor,
};

window.addEventListener("DOMContentLoaded", init);
