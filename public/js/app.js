/**
 * AI小镇前端主应用
 * 完整的单页应用，包含所有模拟逻辑
 */
import WorldSimulator from './simulator.js';
import LLMClient from './llm-client.js';

// ========== 配置 ==========
const CONFIG = {
  MAP_CELL_SIZE: 12,
  MAP_GRID_COLOR: '#1e3a5f',
  AGENT_COLOR: '#e94560',
  BUILDING_COLOR: '#4a90d9',
  AREA_COLOR: '#28a745',
  REFRESH_RATE: 1000 / 30,
  TICK_INTERVAL: 5000,
  WORLD_WIDTH: 50,
  WORLD_HEIGHT: 50,
  TIME_SCALE: 60
};

// ========== Agent模板 ==========
const agentTemplates = {
  xiaoming: {
    id: 'xiaoming',
    name: '小明',
    age: 25,
    traits: '开朗活泼，喜欢社交，热爱咖啡和音乐',
    background: '一名软件工程师，在一家互联网公司工作。喜欢尝试新事物，周末经常和朋友聚会。',
    goals: ['学习新技能', '结交新朋友', '保持健康生活方式']
  },
  xiaohong: {
    id: 'xiaohong',
    name: '小红',
    age: 24,
    traits: '温柔细腻，喜欢阅读，安静内敛',
    background: '一名图书管理员，热爱文学和艺术。喜欢在咖啡馆看书，享受独处时光。',
    goals: ['读完100本书', '学习绘画', '开一家咖啡馆']
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
  animationId: null
};

// ========== DOM元素缓存 ==========
let elements = {};

// ========== 初始化 ==========
async function init() {
  console.log('🎮 AI小镇前端初始化中...');

  // 初始化LLM客户端
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

  // 开始渲染循环
  startRenderLoop();

  // 添加默认Agent
  await addDefaultAgents();

  // 更新UI
  updateUI();

  console.log('✅ AI小镇初始化完成');
}

// ========== 世界事件监听 ==========
function setupWorldListeners() {
  state.world.addEventListener('tick', (e) => {
    updateGameTime(e.detail.time);
    updateTickCount(e.detail.tickCount);
    renderAgentList();
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

  state.world.addEventListener('stopped', () => {
    state.simulationRunning = false;
    updateSimulationStatus();
  });
}

// ========== UI事件监听 ==========
function setupUIListeners() {
  // 模拟控制
  elements.btnStart = document.getElementById('btn-start');
  elements.btnStop = document.getElementById('btn-stop');
  elements.btnReset = document.getElementById('btn-reset');

  elements.btnStart?.addEventListener('click', startSimulation);
  elements.btnStop?.addEventListener('click', stopSimulation);
  elements.btnReset?.addEventListener('click', resetWorld);

  // Agent操作
  elements.btnAddAgent = document.getElementById('btn-add-agent');
  elements.btnTriggerEvent = document.getElementById('btn-trigger-event');
  elements.btnClearLog = document.getElementById('btn-clear-log');
  elements.btnStopServer = document.getElementById('btn-stop-server');

  elements.btnAddAgent?.addEventListener('click', () => showModal('add-agent-modal'));
  elements.btnTriggerEvent?.addEventListener('click', () => showModal('event-modal'));
  elements.btnClearLog?.addEventListener('click', clearEventLog);
  elements.btnStopServer?.addEventListener('click', stopServer);

  // 弹窗关闭
  document.getElementById('btn-close-modal')?.addEventListener('click', () => hideModal('agent-modal'));
  document.getElementById('btn-close-add-modal')?.addEventListener('click', () => hideModal('add-agent-modal'));
  document.getElementById('btn-cancel-add')?.addEventListener('click', () => hideModal('add-agent-modal'));
  document.getElementById('btn-close-event-modal')?.addEventListener('click', () => hideModal('event-modal'));
  document.getElementById('btn-cancel-event')?.addEventListener('click', () => hideModal('event-modal'));

  // 表单提交
  document.getElementById('add-agent-form')?.addEventListener('submit', handleAddAgent);
  document.getElementById('event-form')?.addEventListener('submit', handleTriggerEvent);

  // 画布交互
  elements.canvas = document.getElementById('world-map');
  elements.canvas?.addEventListener('mousemove', handleMouseMove);
  elements.canvas?.addEventListener('mouseleave', () => hideTooltip());
  elements.canvas?.addEventListener('click', handleCanvasClick);

  // 标签页
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // 点击外部关闭弹窗
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.add('hidden');
    }
  });
}

// ========== 模拟控制 ==========
function startSimulation() {
  state.world.start(CONFIG.TICK_INTERVAL);
}

function stopSimulation() {
  state.world.stop();
}

async function resetWorld() {
  if (confirm('确定要重置世界吗？所有Agent将被清除。')) {
    state.world.stop();
    await state.world.reset(true);
    await addDefaultAgents();
    updateUI();
  }
}

async function addDefaultAgents() {
  await state.world.addAgent(agentTemplates.xiaoming, { x: 10, y: 10 });
  await state.world.addAgent(agentTemplates.xiaohong, { x: 30, y: 20 });
}

// ========== Agent操作 ==========
async function handleAddAgent(e) {
  e.preventDefault();

  const name = document.getElementById('new-agent-name').value;
  const age = parseInt(document.getElementById('new-agent-age').value);
  const traits = document.getElementById('new-agent-traits').value;
  const background = document.getElementById('new-agent-background').value;

  const config = {
    id: 'agent_' + Date.now(),
    name,
    age,
    traits,
    background,
    goals: ['探索世界', '认识新朋友']
  };

  await state.world.addAgent(config);
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

// ========== 画布渲染 ==========
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
}

function startRenderLoop() {
  function render() {
    drawMap();
    state.animationId = requestAnimationFrame(render);
  }
  render();
}

function drawMap() {
  if (!state.ctx) return;

  const ctx = state.ctx;
  const cellSize = CONFIG.MAP_CELL_SIZE;
  const width = CONFIG.WORLD_WIDTH;
  const height = CONFIG.WORLD_HEIGHT;

  // 清空画布
  ctx.fillStyle = '#0d1b2a';
  ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);

  // 绘制网格
  ctx.strokeStyle = CONFIG.MAP_GRID_COLOR;
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

  // 获取世界状态
  const worldState = state.world.getWorldState();

  // 绘制物体
  for (const obj of worldState.objects.values()) {
    drawObject(ctx, obj, cellSize);
  }

  // 绘制Agent
  for (const agentState of worldState.agents.values()) {
    drawAgent(ctx, agentState, cellSize);
  }
}

function drawObject(ctx, obj, cellSize) {
  const x = obj.position.x * cellSize;
  const y = obj.position.y * cellSize;
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

  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(obj.name, x, y + size / 2 + 12);
}

function drawAgent(ctx, agent, cellSize) {
  const x = agent.position.x * cellSize;
  const y = agent.position.y * cellSize;
  const radius = cellSize * 0.8;

  // 绘制状态圈
  ctx.beginPath();
  ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
  switch (agent.status) {
    case 'busy':
      ctx.fillStyle = '#ffc107';
      break;
    case 'sleeping':
      ctx.fillStyle = '#6c757d';
      break;
    default:
      ctx.fillStyle = '#28a745';
  }
  ctx.fill();

  // 绘制Agent主体
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = CONFIG.AGENT_COLOR;
  ctx.fill();

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 绘制名字
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(agent.name, x, y - radius - 4);

  // 绘制当前动作
  if (agent.currentAction) {
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '9px sans-serif';
    const desc = typeof agent.currentAction === 'object'
      ? agent.currentAction.description
      : agent.currentAction;
    ctx.fillText((desc || '').substring(0, 15), x, y + radius + 12);
  }
}

// ========== 交互处理 ==========
function handleMouseMove(e) {
  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const cellSize = CONFIG.MAP_CELL_SIZE;

  const worldState = state.world.getWorldState();
  let hovered = null;

  // 检查Agent
  for (const agent of worldState.agents.values()) {
    const ax = agent.position.x * cellSize;
    const ay = agent.position.y * cellSize;
    const dist = Math.sqrt((x - ax) ** 2 + (y - ay) ** 2);
    if (dist < cellSize) {
      hovered = { type: 'agent', data: agent };
      break;
    }
  }

  // 检查建筑物
  if (!hovered) {
    for (const obj of worldState.objects.values()) {
      const ox = obj.position.x * cellSize;
      const oy = obj.position.y * cellSize;
      const size = cellSize * 1.5;
      if (x >= ox - size && x <= ox + size && y >= oy - size && y <= oy + size) {
        hovered = { type: 'object', data: obj };
        break;
      }
    }
  }

  if (hovered) {
    showTooltip(e.clientX, e.clientY, hovered);
  } else {
    hideTooltip();
  }
}

function handleCanvasClick(e) {
  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const cellSize = CONFIG.MAP_CELL_SIZE;

  const worldState = state.world.getWorldState();

  for (const agent of worldState.agents.values()) {
    const ax = agent.position.x * cellSize;
    const ay = agent.position.y * cellSize;
    const dist = Math.sqrt((x - ax) ** 2 + (y - ay) ** 2);
    if (dist < cellSize) {
      showAgentDetails(agent.agentId);
      return;
    }
  }
}

// ========== UI更新 ==========
function updateUI() {
  const worldState = state.world.getWorldState();
  updateGameTime(worldState.time);
  updateTickCount(worldState.tickCount);
  updateSimulationStatus();
  renderAgentList();
}

function updateGameTime(gameTime) {
  const date = new Date(gameTime);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  document.getElementById('game-time').textContent = `${hours}:${minutes}`;
}

function updateTickCount(count) {
  document.getElementById('tick-count').textContent = `Tick: ${count}`;
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
    container.innerHTML = '<div class="empty-state">暂无Agent</div>';
    return;
  }

  const html = Array.from(worldState.agents.values())
    .map(agent => {
      const actionDesc = typeof agent.currentAction === 'object'
        ? agent.currentAction?.description
        : agent.currentAction;
      return `
      <div class="agent-item" data-agent-id="${agent.agentId}">
        <div class="agent-avatar">🤖</div>
        <div class="agent-info">
          <div class="agent-name">${agent.name}</div>
          <div class="agent-status">${agent.status} · ${actionDesc || '空闲'}</div>
          <div class="agent-position">(${agent.position.x}, ${agent.position.y})</div>
        </div>
      </div>
    `}).join('');

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

  document.getElementById('modal-agent-name').textContent = agent.name;
  document.getElementById('modal-agent-id').textContent = agent.id;
  document.getElementById('modal-agent-age').textContent = `${agent.config.age}岁`;
  document.getElementById('modal-agent-traits').textContent = agent.config.traits;
  document.getElementById('modal-agent-position').textContent = `(${agent.position.x}, ${agent.position.y})`;
  document.getElementById('modal-agent-status').textContent = agent.status;
  const actionText = typeof agent.currentAction === 'object'
    ? agent.currentAction?.description
    : agent.currentAction;
  document.getElementById('modal-agent-action').textContent = actionText || '无';
  document.getElementById('modal-agent-background').textContent = agent.config.background;

  // 目标
  document.getElementById('modal-agent-goals').innerHTML =
    agent.config.goals.map(goal => `<li>${goal}</li>`).join('');

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

  // 移除空状态
  if (container.querySelector('.empty-state')) {
    container.innerHTML = '';
  }

  const eventEl = document.createElement('div');
  eventEl.className = 'event-item';
  const time = new Date(event.timestamp).toLocaleTimeString();
  eventEl.innerHTML = `
    <div>
      <span class="event-time">${time}</span>
      <span class="event-type">${event.type}</span>
    </div>
    <div class="event-content">${event.description}</div>
  `;

  container.insertBefore(eventEl, container.firstChild);

  while (container.children.length > 50) {
    container.removeChild(container.lastChild);
  }
}

function clearEventLog() {
  document.getElementById('event-log').innerHTML = '<div class="empty-state">暂无事件</div>';
}

// ========== UI工具函数 ==========
function showModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

function hideModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add('active');

  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
}

function showTooltip(x, y, hovered) {
  const tooltip = document.getElementById('map-tooltip');
  tooltip.classList.remove('hidden');
  tooltip.style.left = `${x + 10}px`;
  tooltip.style.top = `${y + 10}px`;

  if (hovered.type === 'agent') {
    tooltip.innerHTML = `
      <strong>${hovered.data.name}</strong><br>
      状态: ${hovered.data.status}<br>
      位置: (${hovered.data.position.x}, ${hovered.data.position.y})
    `;
  } else {
    tooltip.innerHTML = `
      <strong>${hovered.data.name}</strong><br>
      ${hovered.data.description}
    `;
  }
}

function hideTooltip() {
  document.getElementById('map-tooltip')?.classList.add('hidden');
}

// ========== 停止服务器 ==========
async function stopServer() {
  if (!confirm('确定要停止服务器吗？\n\n这将关闭AI小镇服务，需要重新启动才能再次使用。')) {
    return;
  }

  try {
    const response = await fetch('/api/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.ok) {
      alert('✅ 服务器已停止\n\n可以关闭此页面了。');
      // 禁用所有按钮
      document.querySelectorAll('button').forEach(btn => btn.disabled = true);
    } else {
      alert('❌ 停止服务器失败');
    }
  } catch (e) {
    // 如果请求失败，说明服务器可能已经停止
    alert('✅ 服务器已停止\n\n可以关闭此页面了。');
    document.querySelectorAll('button').forEach(btn => btn.disabled = true);
  }
}

// ========== 启动 ==========
init().catch(console.error);
