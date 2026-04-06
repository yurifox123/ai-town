/**
 * 素材配置文件
 * 用户可在此文件修改素材路径映射
 */

export const ASSET_CONFIG = {
  // 素材基础路径
  basePath: '/assets',
  
  // 角色素材配置
  characters: {
    xiaoming: {
      sprite: 'characters/xiaoming.png',
      portrait: 'portraits/xiaoming.png',
      displaySize: [48, 48]
    },
    xiaohong: {
      sprite: 'characters/xiaohong.png',
      portrait: 'portraits/xiaohong.png',
      displaySize: [48, 48]
    },
    xiaomi: {
      sprite: 'characters/xiaomi.png',
      portrait: 'portraits/xiaomi.png',
      displaySize: [48, 48]
    },
    xiaodong: {
      sprite: 'characters/xiaodong.png',
      portrait: 'portraits/xiaodong.png',
      displaySize: [48, 48]
    },
    default: {
      sprite: 'characters/default.png',
      portrait: 'portraits/default.png',
      displaySize: [48, 48]
    }
  },
  
  // 建筑素材配置
  buildings: {
    cafe: { 
      sprite: 'buildings/cafe.png', 
      displaySize: [96, 96] 
    },
    park: { 
      sprite: 'buildings/park.png', 
      displaySize: [120, 96] 
    },
    home1: { 
      sprite: 'buildings/home1.png', 
      displaySize: [80, 80] 
    },
    home2: {
      sprite: 'buildings/home2.png',
      displaySize: [80, 80]
    },
    home3: {
      sprite: 'buildings/home3.png',
      displaySize: [80, 80]
    },
    home4: {
      sprite: 'buildings/home4.png',
      displaySize: [80, 80]
    },
    shop: { 
      sprite: 'buildings/shop.png', 
      displaySize: [96, 96] 
    },
    library: { 
      sprite: 'buildings/library.png', 
      displaySize: [96, 96] 
    }
  },
  
  // 地面纹理配置
  tiles: {
    grass: 'tiles/grass.png',
    path: 'tiles/path.png',
    water: 'tiles/water.png' // 可选
  },
  
  // UI 元素配置
  ui: {
    bubble: 'ui/bubble.png',
    sleepZzz: 'ui/sleep-zzz.png',
    talkBubble: 'ui/talk-bubble.png'
  },
  
  // 状态颜色配置
  statusColors: {
    idle: '#28a745',
    busy: '#ffc107',
    sleeping: '#6c757d',
    moving: '#17a2b8'
  }
};

/**
 * 根据 agentId 获取角色配置键名
 */
export function getCharacterKey(agentId) {
  // 移除可能的 agent_ 前缀
  const key = agentId.replace(/^agent_/, '');
  // 如果配置中存在该键，返回它；否则返回 default
  if (ASSET_CONFIG.characters[key]) {
    return key;
  }
  return 'default';
}

/**
 * 获取角色精灵图片路径
 */
export function getCharacterSprite(agentId) {
  const key = getCharacterKey(agentId);
  const config = ASSET_CONFIG.characters[key];
  return config ? `${ASSET_CONFIG.basePath}/${config.sprite}` : null;
}

/**
 * 获取角色头像图片路径
 */
export function getCharacterPortrait(agentId) {
  const key = getCharacterKey(agentId);
  const config = ASSET_CONFIG.characters[key];
  return config ? `${ASSET_CONFIG.basePath}/${config.portrait}` : null;
}

/**
 * 获取建筑精灵图片路径
 */
export function getBuildingSprite(buildingId) {
  const config = ASSET_CONFIG.buildings[buildingId];
  return config ? `${ASSET_CONFIG.basePath}/${config.sprite}` : null;
}

/**
 * 获取建筑显示尺寸
 */
export function getBuildingDisplaySize(buildingId) {
  const config = ASSET_CONFIG.buildings[buildingId];
  return config ? config.displaySize : [96, 96];
}

/**
 * 获取角色显示尺寸
 */
export function getCharacterDisplaySize(agentId) {
  const key = getCharacterKey(agentId);
  const config = ASSET_CONFIG.characters[key];
  return config ? config.displaySize : [48, 48];
}
