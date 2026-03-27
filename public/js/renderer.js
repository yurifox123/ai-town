/**
 * 增强渲染器 - 支持图片精灵渲染
 * 替换原有的 drawMap/drawObject/drawAgent 函数
 */

import { imageLoader } from './image-loader.js';
import { getCharacterSprite, getBuildingSprite, getCharacterDisplaySize, getBuildingDisplaySize } from './asset-config.js';

/**
 * 绘制地图（增强版）
 */
export function drawMap(ctx, state, CONFIG) {
  if (!ctx) return;

  const cellSize = CONFIG.MAP_CELL_SIZE;
  const width = CONFIG.WORLD_WIDTH;
  const height = CONFIG.WORLD_HEIGHT;

  // 绘制地面纹理
  const grassImage = imageLoader.getImage('/assets/tiles/grass.png');
  if (grassImage) {
    // 平铺草地纹理
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        ctx.drawImage(grassImage, x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
  } else {
    // 回退到纯色背景
    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
  }

  // 绘制网格（可选）
  if (CONFIG.SHOW_GRID) {
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
  }

  // 获取世界状态
  const worldState = state.world.getWorldState();

  // 绘制物体
  for (const obj of worldState.objects.values()) {
    drawObject(ctx, obj, cellSize, CONFIG);
  }

  // 绘制 Agent
  for (const agentState of worldState.agents.values()) {
    drawAgent(ctx, agentState, cellSize, CONFIG);
  }
}

/**
 * 绘制物体（增强版 - 使用图片精灵）
 */
export function drawObject(ctx, obj, cellSize, CONFIG) {
  const x = obj.position.x * cellSize;
  const y = obj.position.y * cellSize;

  // 尝试获取建筑图片
  const spritePath = getBuildingSprite(obj.id);
  const sprite = spritePath ? imageLoader.getImage(spritePath) : null;
  const displaySize = getBuildingDisplaySize(obj.id);

  if (sprite) {
    // 使用图片精灵
    const drawWidth = displaySize[0] * CONFIG.SPRITE_SCALE;
    const drawHeight = displaySize[1] * CONFIG.SPRITE_SCALE;
    
    // 绘制阴影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + drawHeight / 2 - 4, drawWidth / 2, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制建筑
    ctx.drawImage(sprite, x - drawWidth / 2, y - drawHeight / 2, drawWidth, drawHeight);
  } else {
    // 回退到原始矩形绘制
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

  // 绘制名称标签（带半透明背景）
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  const nameWidth = ctx.measureText(obj.name).width + 10;
  ctx.fillRect(x - nameWidth / 2, y + (sprite ? displaySize[1] : cellSize * 3) / 2 - 6, nameWidth, 16);
  
  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(obj.name, x, y + (sprite ? displaySize[1] : cellSize * 3) / 2 + 6);
}

/**
 * 绘制 Agent（增强版 - 使用图片精灵）
 */
export function drawAgent(ctx, agent, cellSize, CONFIG) {
  const x = agent.position.x * cellSize;
  const y = agent.position.y * cellSize;

  // 获取角色图片
  const spritePath = getCharacterSprite(agent.agentId);
  const sprite = spritePath ? imageLoader.getImage(spritePath) : null;
  const displaySize = getCharacterDisplaySize(agent.agentId);

  if (sprite) {
    // 使用图片精灵
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
    // 回退到原始圆形绘制
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

    // 绘制 Agent 主体
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.AGENT_COLOR;
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 绘制状态指示点（右下角小圆点）
  const statusColors = {
    idle: '#28a745',
    busy: '#ffc107',
    sleeping: '#6c757d',
    moving: '#17a2b8'
  };
  const statusColor = statusColors[agent.status] || '#28a745';
  
  ctx.beginPath();
  ctx.arc(x + (sprite ? displaySize[0] : cellSize) / 2 - 8, y + (sprite ? displaySize[1] : cellSize) / 2 - 8, 5, 0, Math.PI * 2);
  ctx.fillStyle = statusColor;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 绘制名字标签（带半透明背景）
  const nameY = y - (sprite ? displaySize[1] : cellSize) / 2 - 6;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  const nameWidth = ctx.measureText(agent.name).width + 10;
  ctx.fillRect(x - nameWidth / 2, nameY - 12, nameWidth, 16);
  
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(agent.name, x, nameY);

  // 绘制当前动作气泡（显示在头顶）
  if (agent.currentAction) {
    const desc = typeof agent.currentAction === 'object'
      ? agent.currentAction.description
      : agent.currentAction;

    if (desc) {
      // 气泡位置：在名字标签上方
      const nameY = y - (sprite ? displaySize[1] : cellSize) / 2 - 6;
      const bubbleY = nameY - 22;
      const bubbleImage = imageLoader.getImage('/assets/ui/bubble.png');

      if (bubbleImage) {
        // 使用气泡图片
        const bubbleWidth = Math.min(desc.length * 8 + 30, 180);
        const bubbleHeight = 32;
        ctx.drawImage(bubbleImage, x - bubbleWidth / 2, bubbleY - bubbleHeight, bubbleWidth, bubbleHeight);
      } else {
        // 回退到半透明背景
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        const textWidth = ctx.measureText(desc.substring(0, 20)).width + 16;
        ctx.fillRect(x - textWidth / 2, bubbleY - 20, textWidth, 24);
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - textWidth / 2, bubbleY - 20, textWidth, 24);
      }

      ctx.fillStyle = '#333';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(desc.substring(0, 20), x, bubbleY - 8);
    }
  }

  // 绘制睡眠效果
  if (agent.status === 'sleeping') {
    const sleepImage = imageLoader.getImage('/assets/ui/sleep-zzz.png');
    if (sleepImage) {
      const oscillation = Math.sin(Date.now() / 500) * 3;
      ctx.drawImage(sleepImage, x + 15, y - (sprite ? displaySize[1] : cellSize) / 2 - 10 + oscillation, 20, 20);
    } else {
      // 回退到文字
      ctx.fillStyle = '#6495ed';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Zzz...', x + 15, y - (sprite ? displaySize[1] : cellSize) / 2);
    }
  }
}

/**
 * 更新碰撞检测以匹配精灵尺寸
 */
export function checkAgentHit(agent, mouseX, mouseY, cellSize, CONFIG) {
  const displaySize = getCharacterDisplaySize(agent.agentId);
  const drawWidth = displaySize[0] * CONFIG.SPRITE_SCALE;
  const drawHeight = displaySize[1] * CONFIG.SPRITE_SCALE;
  
  const ax = agent.position.x * cellSize;
  const ay = agent.position.y * cellSize;
  
  // 矩形碰撞检测
  return mouseX >= ax - drawWidth / 2 && 
         mouseX <= ax + drawWidth / 2 && 
         mouseY >= ay - drawHeight / 2 && 
         mouseY <= ay + drawHeight / 2;
}

export function checkObjectHit(obj, mouseX, mouseY, cellSize, CONFIG) {
  const displaySize = getBuildingDisplaySize(obj.id);
  const drawWidth = displaySize[0] * CONFIG.SPRITE_SCALE;
  const drawHeight = displaySize[1] * CONFIG.SPRITE_SCALE;
  
  const ox = obj.position.x * cellSize;
  const oy = obj.position.y * cellSize;
  
  // 矩形碰撞检测（扩大 1.5 倍便于点击）
  const margin = 1.5;
  return mouseX >= ox - drawWidth / 2 * margin && 
         mouseX <= ox + drawWidth / 2 * margin && 
         mouseY >= oy - drawHeight / 2 * margin && 
         mouseY <= oy + drawHeight / 2 * margin;
}
