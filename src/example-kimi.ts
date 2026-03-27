import 'dotenv/config';
import { ensureDataDir } from './config';
import { WorldSimulator } from './world/simulator';
import { LLMClient } from './llm/client';
import { agentTemplates } from './data/agent-templates';

/**
 * Kimi K2.5 (Anthropic Messages API 格式) 配置示例
 */
async function main() {
  console.log('🎮 AI生态小镇 - Kimi K2.5 示例\n');

  // 1. 初始化
  ensureDataDir();

  // 2. 配置 Kimi LLM客户端 (Anthropic Messages API 格式)
  const llm = new LLMClient({
    provider: 'custom',
    model: 'kimi-k2.5',
    apiKey: 'sk-sp-991b70d4182e4608949442d262161dc2',
    temperature: 0.7,
    maxTokens: 1000,
    custom: {
      // Anthropic Messages API 端点
      endpoint: 'https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages',
      // 自定义请求头 (Anthropic 格式)
      headers: {
        'x-api-key': 'sk-sp-991b70d4182e4608949442d262161dc2',
        'anthropic-version': '2023-06-01',
      },
      // 响应路径
      responsePath: 'content[1].text',  // Kimi 返回 thinking + text 两个 content
    }
  });

  console.log('✅ Kimi K2.5 LLM客户端初始化完成');
  console.log(`   模型: kimi-k2.5\n`);

  // 3. 创建世界模拟器
  const world = new WorldSimulator(20, 15, 60, llm);

  // 监听事件
  world.on('tick', (state) => {
    console.log(`\n⏰ 游戏时间: ${state.time.gameTime.toLocaleTimeString()}`);
    console.log(`👥 在线Agent: ${state.agents.size}个`);
  });

  world.on('agentJoined', (agent) => {
    console.log(`📥 ${agent.agentId} 加入世界`);
  });

  // 4. 创建Agent
  console.log('🎭 创建Agent...\n');

  try {
    await world.addAgent(agentTemplates.xiaoming, { x: 5, y: 5 });
    await world.addAgent(agentTemplates.xiaohong, { x: 15, y: 10 });
    await world.addAgent(agentTemplates.aqiang, { x: 10, y: 7 });
    console.log('\n✅ Agent创建完成\n');
  } catch (e) {
    console.error('创建Agent失败:', e);
    process.exit(1);
  }

  // 5. 启动模拟
  console.log('═══════════════════════════════════════');
  console.log('🚀 启动世界模拟（按 Ctrl+C 停止）\n');

  world.start(5000); // 5秒一个tick

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n\n👋 正在关闭AI生态小镇...');
    world.stop();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error('程序错误:', e);
  process.exit(1);
});
