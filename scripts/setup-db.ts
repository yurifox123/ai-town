import { appConfig, ensureDataDir, validateConfig } from '../config';
import { getLLMClient } from '../llm/client';
import { WorldSimulator } from '../world/simulator';

/**
 * 设置脚本 - 初始化数据目录和验证配置
 */
async function setup() {
  console.log('🔧 AI小镇设置\n');

  // 1. 创建数据目录
  ensureDataDir();

  // 2. 验证配置
  if (!validateConfig()) {
    console.log('\n请复制 .env.example 为 .env 并配置API密钥');
    process.exit(1);
  }

  console.log('✅ 配置验证通过');
  console.log(`   LLM: ${appConfig.llm.provider} / ${appConfig.llm.model}`);
  console.log(`   世界: ${appConfig.world.width}x${appConfig.world.height}`);
  console.log(`   Tick: ${appConfig.world.tickIntervalMs}ms`);

  console.log('\n🎮 运行 "npm run dev" 启动AI小镇');
}

setup().catch(console.error);
