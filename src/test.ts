import 'dotenv/config';
import { ensureDataDir } from './config';
import { WorldSimulator } from './world/simulator';
import { MockLLMClient } from './llm/mock';
import { agentTemplates } from './data/agent-templates';

/**
 * AI生态小镇测试程序
 * 使用Mock LLM，无需API Key
 */
async function main() {
  console.log('🎮 AI生态小镇测试启动中...\n');
  console.log('（使用Mock模式，无需API Key）\n');

  // 1. 初始化
  ensureDataDir();

  // 2. 初始化Mock LLM客户端
  const llm = new MockLLMClient({
    provider: 'openai',
    model: 'mock-model',
    apiKey: 'mock-key',
  });
  console.log('✅ Mock LLM客户端初始化完成');
  console.log('   模式: Mock（模拟回复）\n');

  // 3. 创建世界模拟器（小地图便于测试）
  const world = new WorldSimulator(20, 15, 60, llm);

  // 监听世界事件
  world.on('tick', (state) => {
    console.log(`\n⏰ 游戏时间: ${state.time.gameTime.toLocaleTimeString()}`);
    console.log(`👥 在线Agent: ${state.agents.size}个`);
  });

  world.on('agentJoined', (agent) => {
    console.log(`📥 ${agent.agentId} 加入世界`);
  });

  world.on('event', (event) => {
    console.log(`📢 ${event.description}`);
  });

  console.log('✅ 世界模拟器初始化完成\n');

  // 4. 创建示例Agent
  console.log('🎭 创建Agent...\n');

  const templates = [
    agentTemplates.xiaoming,
    agentTemplates.xiaohong,
    agentTemplates.aqiang,
  ];

  for (const template of templates) {
    const config = {
      ...template,
      id: `${template.id}_${Date.now()}`,
    };
    try {
      await world.addAgent(config, {
        x: Math.floor(Math.random() * 15) + 2,
        y: Math.floor(Math.random() * 10) + 2,
      });
    } catch (e) {
      console.error(`创建Agent ${config.name} 失败:`, e);
    }
  }

  console.log('\n✅ 所有Agent创建完成\n');

  // 5. 显示Agent信息
  console.log('Agent列表:');
  const worldState = world.getWorldState();
  for (const [id, agentState] of worldState.agents) {
    const name = id.includes('xiaoming') ? '小明' :
                 id.includes('xiaohong') ? '小红' :
                 id.includes('aqiang') ? '阿强' : 'Unknown';
    console.log(`  - ${name} (${id})`);
    console.log(`    位置: (${agentState.position.x}, ${agentState.position.y})`);
    console.log(`    状态: ${agentState.status}`);
  }

  // 6. 启动模拟
  console.log('\n═══════════════════════════════════════');
  console.log('🚀 启动世界模拟（按 Ctrl+C 停止）\n');

  world.start(3000); // 3秒一个tick

  // 7. 示例：5秒后触发一次对话
  setTimeout(async () => {
    const agents = Array.from(worldState.agents.keys());
    if (agents.length >= 2) {
      console.log('\n💬 触发示例对话...\n');
      await world.startConversation(agents[0], agents[1]);
    }
  }, 5000);

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n\n👋 正在关闭AI生态小镇...');
    world.stop();
    process.exit(0);
  });
}

// 运行测试程序
main().catch((e) => {
  console.error('程序错误:', e);
  process.exit(1);
});
