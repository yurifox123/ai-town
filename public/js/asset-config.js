/**
 * 素材配置文件
 * 用户可在此文件修改素材路径映射
 */

export const ASSET_CONFIG = {
  // 素材基础路径
  basePath: "/assets",

  // 角色素材配置
  characters: {
    xiaoming: {
      sprite: "characters/xiaoming.png",
      portrait: "portraits/xiaoming.png",
      displaySize: [48, 48],
      // 动画模式配置（存在时覆盖 sprite）
      animation: {
        basePath: "characters/xiaoming/",
        frameSize: [48, 48],
        walkFrames: 6,
        idleFrames: 1,
      },
    },
    xiaohong: {
      sprite: "characters/xiaohong.png",
      portrait: "portraits/xiaohong.png",
      displaySize: [48, 48],
      animation: {
        basePath: "characters/xiaohong/",
        frameSize: [48, 48],
        walkFrames: 6,
        idleFrames: 1,
      },
    },
    xiaomi: {
      sprite: "characters/xiaomi.png",
      portrait: "portraits/xiaomi.png",
      displaySize: [48, 48],
      animation: {
        basePath: "characters/xiaomi/",
        frameSize: [48, 48],
        walkFrames: 6,
        idleFrames: 1,
      },
    },
    xiaodong: {
      sprite: "characters/xiaodong.png",
      portrait: "portraits/xiaodong.png",
      displaySize: [48, 48],
      animation: {
        basePath: "characters/xiaodong/",
        frameSize: [48, 48],
        walkFrames: 6,
        idleFrames: 1,
      },
    },
  },

  // 建筑素材配置
  buildings: {
    cafe: {
      sprite: "buildings/cafe.png",
      displaySize: [96, 96],
    },
    park: {
      sprite: "buildings/park.png",
      displaySize: [190, 180],
    },
    home1: {
      sprite: "buildings/home1.png",
      displaySize: [80, 80],
    },
    home2: {
      sprite: "buildings/home2.png",
      displaySize: [80, 80],
    },
    home3: {
      sprite: "buildings/home3.png",
      displaySize: [80, 80],
    },
    home4: {
      sprite: "buildings/home4.png",
      displaySize: [80, 80],
    },
    shop: {
      sprite: "buildings/shop.png",
      displaySize: [96, 96],
    },
    library: {
      sprite: "buildings/library.png",
      displaySize: [96, 96],
    },
  },

  // 地面纹理配置
  tiles: {
    grass: "tiles/grass.png",
    path: "tiles/path.png",
    water: "tiles/water.png",
    wall: "tiles/wall.png",
  },

  // 状态颜色配置
  statusColors: {
    idle: "#28a745",
    busy: "#ffc107",
    sleeping: "#6c757d",
    moving: "#17a2b8",
  },
};

/**
 * 根据 agentId 获取角色配置键名
 */
export function getCharacterKey(agentId) {
  if (!agentId) return "xiaoming";
  // 移除可能的 agent_ 前缀
  const key = agentId.replace(/^agent_/, "");
  // 如果配置中存在该键，返回它；否则返回 xiaoming
  if (ASSET_CONFIG.characters[key]) {
    return key;
  }
  return "xiaoming";
}

/**
 * 获取角色精灵图片路径（兼容静态和动画模式）
 * 动画模式下返回 null，由渲染器单独处理
 */
export function getCharacterSprite(agentId) {
  const key = getCharacterKey(agentId);
  const config = ASSET_CONFIG.characters[key];
  if (!config) return null;
  // 如果有动画配置，不使用静态 sprite
  if (config.animation) return null;
  return `${ASSET_CONFIG.basePath}/${config.sprite}`;
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
  if (!buildingId) return null;
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

/**
 * 获取角色动画配置（返回 null 表示使用静态精灵）
 */
export function getCharacterAnimation(agentId) {
  const key = getCharacterKey(agentId);
  const config = ASSET_CONFIG.characters[key];
  return config?.animation || null;
}
