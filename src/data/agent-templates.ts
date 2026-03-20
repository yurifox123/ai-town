import { AgentConfig } from '../types';

export type { AgentConfig };

/**
 * 预定义的Agent模板
 */
export const agentTemplates: Record<string, AgentConfig> = {
  xiaoming: {
    id: 'agent_xiaoming',
    name: '小明',
    age: 25,
    traits: '外向活泼，喜欢社交，热爱咖啡和编程。总是充满好奇心，喜欢尝试新事物。',
    background: '一名软件工程师，在科技公司工作，独居在市中心的小公寓。周末喜欢去咖啡馆写代码或看书。',
    goals: ['提升编程技能', '认识新朋友', '找到人生伴侣', '升职加薪'],
  },

  xiaohong: {
    id: 'agent_xiaohong',
    name: '小红',
    age: 23,
    traits: '温柔内向，喜欢阅读和艺术，善于倾听。有点完美主义，对自己要求很高。',
    background: '自由插画师，喜欢在家工作，养了一只叫"橘子"的猫。经常在公园写生寻找灵感。',
    goals: ['举办个人画展', '写一本小说', '旅行世界', '买个大房子'],
  },

  aqiang: {
    id: 'agent_aqiang',
    name: '阿强',
    age: 28,
    traits: '沉稳可靠，喜欢运动和户外活动。性格直率，说话有点 blunt 但很真诚。',
    background: '健身教练，住在小明隔壁，喜欢早起跑步。梦想是开一家自己的健身房。',
    goals: ['开一家健身房', '跑完马拉松', '帮助更多人健康生活', '存够首付款'],
  },

  linda: {
    id: 'agent_linda',
    name: '琳达',
    age: 26,
    traits: '独立自主，事业心强，喜欢精致生活。有点工作狂，但也在学习放松。',
    background: '产品经理，工作繁忙但效率高。喜欢去咖啡馆工作因为家里容易分心。',
    goals: ['成为产品总监', '学习烘焙', '找到work-life balance', '养只狗'],
  },

  unclewang: {
    id: 'agent_unclewang',
    name: '王大爷',
    age: 65,
    traits: '和蔼可亲，喜欢聊天讲故事。退休生活悠闲，喜欢观察年轻人。',
    background: '退休教师，每天都会去公园晨练和下棋。在附近住了30年，认识所有人。',
    goals: ['保持健康', '写回忆录', '多陪伴孙子', '学用智能手机'],
  },
};

/**
 * 获取随机Agent配置
 */
export function getRandomAgentConfig(): AgentConfig {
  const keys = Object.keys(agentTemplates);
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  const template = agentTemplates[randomKey];

  // 深拷贝并生成唯一ID
  return {
    ...template,
    id: `${template.id}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
  };
}

/**
 * 获取所有Agent模板
 */
export function getAllAgentTemplates(): AgentConfig[] {
  return Object.values(agentTemplates).map((template) => ({
    ...template,
    id: `${template.id}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
  }));
}
