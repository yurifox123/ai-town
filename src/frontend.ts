/**
 * 组合模式入口
 * 同时启动 Web 服务器和 CLI 界面
 */

import { WorldSimulator } from './world/simulator';
import { FrontendServer } from './server/frontend-server';
import { appConfig, ensureDataDir, validateConfig } from './config';
import { LLMClient } from './llm/client';
import { agentTemplates } from './data/agent-templates';
import { SaveSystem } from './save-system';
import * as readline from 'readline';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const PORT = parseInt(process.env.FRONTEND_PORT || '3060');

async function main() {
  console.log('🚀 启动AI小镇组合模式（Web + CLI）...\n');

  // 1. 初始化
  ensureDataDir();

  if (!validateConfig()) {
    console.log('\n请复制 .env.example 为 .env 并配置API密钥');
    process.exit(1);
  }

  // 2. 初始化LLM客户端
  const llm = new LLMClient(appConfig.llm);
  console.log('✅ LLM客户端初始化完成');
  console.log(`   模型: ${appConfig.llm.model}\n`);

  // 3. 初始化存档系统
  const saveSystem = new SaveSystem('./data/saves');

  // 4. 创建世界模拟器
  const world = new WorldSimulator(
    appConfig.world.width,
    appConfig.world.height,
    appConfig.world.timeScale,
    llm
  );

  // 5. 创建前端服务器
  const server = new FrontendServer(world, PORT);

  // 6. 设置事件监听（同时输出到CLI和WebSocket）
  let lastHour = -1;
  const lastAgentActions = new Map<string, string>();

  world.on('tick', (state) => {
    const currentHour = state.time.getHours();

    // 每小时打印时间
    if (currentHour !== lastHour) {
      console.log(`\n⏰ 游戏时间: ${state.time.toLocaleTimeString()}`);
      console.log(`👥 在线Agent: ${state.agents.length}个`);
      lastHour = currentHour;
    }

    // 打印Agent动作变化
    for (const agent of state.agents) {
      const actionDesc = agent.currentAction?.description || '空闲中';
      const lastAction = lastAgentActions.get(agent.id);

      if (lastAction !== actionDesc) {
        console.log(`  → ${agent.name}: ${actionDesc}`);
        lastAgentActions.set(agent.id, actionDesc);
      }
    }
  });

  world.on('agentJoined', (agent) => {
    console.log(`📥 ${agent.name} 加入世界`);
  });

  world.on('agentLeft', ({ agentId }) => {
    console.log(`📤 Agent ${agentId} 离开世界`);
  });

  world.on('event', (event) => {
    console.log(`📢 世界事件: ${event.description}`);
  });

  world.on('loaded', ({ tickCount, agentCount }) => {
    console.log(`📂 存档加载: ${agentCount} 个Agent, ${tickCount} ticks`);
  });

  // 7. 设置命令行接口
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  // 游戏状态
  let isRunning = false;
  let isInMenu = true;
  let hasShownMenu = false;

  // 8. 命令处理
  const processCommand = async (input: string) => {
    const parts = input.trim().split(/\s+/);
    const command = parts[0].toLowerCase();

    // 菜单状态下的命令
    if (isInMenu) {
      switch (command) {
        case '1':
        case '继续':
        case 'continue': {
          // 加载最新存档或继续
          const saves = saveSystem.listSaves();
          if (saves.length > 0) {
            const latest = saves[0];
            console.log(`\n📂 加载存档: ${latest.fileName}`);
            const saveData = saveSystem.load(latest.filePath);
            if (saveData) {
              await world.loadFromSave(saveData);
            }
          }
          isInMenu = false;
          if (!isRunning) {
            world.start(appConfig.world.tickIntervalMs);
            isRunning = true;
            console.log('\n▶️  模拟已启动');
            console.log(`🌐 Web界面: http://localhost:${PORT}`);
          }
          rl.prompt();
          return;
        }

        case '2': {
          // 选择存档
          const saves = saveSystem.listSaves();
          if (saves.length === 0) {
            console.log('📂 没有可用存档');
            showMenu();
            return;
          }
          const index = parseInt(parts[1]) - 1;
          if (index >= 0 && index < saves.length) {
            const save = saves[index];
            console.log(`\n📂 加载存档: ${save.fileName}`);
            const saveData = saveSystem.load(save.filePath);
            if (saveData) {
              await world.loadFromSave(saveData);
            }
            isInMenu = false;
            if (!isRunning) {
              world.start(appConfig.world.tickIntervalMs);
              isRunning = true;
              console.log('\n▶️  模拟已启动');
              console.log(`🌐 Web界面: http://localhost:${PORT}`);
            }
          } else {
            console.log('❌ 无效的存档编号');
          }
          rl.prompt();
          return;
        }

        case '3':
        case 'new':
        case '新游戏': {
          // 开始新游戏
          console.log('\n🎮 开始新游戏...');

          // 清除现有Agent
          const existingConfigs = await world.reset(true);

          // 添加默认Agent
          console.log('\n🎭 创建初始Agent...\n');
          await world.addAgent(agentTemplates.xiaoming, { x: 10, y: 10 });
          await world.addAgent(agentTemplates.xiaohong, { x: 30, y: 20 });

          isInMenu = false;
          world.start(appConfig.world.tickIntervalMs);
          isRunning = true;
          console.log('\n▶️  模拟已启动');
          console.log(`🌐 Web界面: http://localhost:${PORT}`);
          console.log('\n提示: 输入 menu 返回菜单, status 查看状态\n');
          rl.prompt();
          return;
        }

        case 'del':
        case '删除': {
          const saves = saveSystem.listSaves();
          const index = parseInt(parts[1]) - 1;
          if (index >= 0 && index < saves.length) {
            const save = saves[index];
            if (saveSystem.deleteSave(save.filePath)) {
              console.log(`✅ 已删除存档: ${save.fileName}`);
            }
          } else {
            console.log('❌ 无效的存档编号');
          }
          showMenu();
          return;
        }

        case 'q':
        case 'exit':
        case '退出': {
          console.log('\n👋 再见!');
          world.stop();
          server.stop();
          rl.close();
          process.exit(0);
        }

        default: {
          console.log('❌ 无效选择，请重新输入');
          showMenu();
          return;
        }
      }
    }

    // 运行状态下的命令
    switch (command) {
      case 'menu':
      case '菜单': {
        isInMenu = true;
        hasShownMenu = false;
        showMenu();
        return;
      }

      case 'status':
      case '状态': {
        const worldState = world.getWorldState();
        console.log('\n📊 世界状态:');
        console.log(`  时间: ${worldState.time.gameTime.toLocaleString()}`);
        console.log(`  Agent: ${worldState.agents.size}个`);
        console.log(`  Tick: ${world.getTickCount()}`);
        console.log(`  Web: http://localhost:${PORT}`);
        console.log();
        break;
      }

      case 'agents':
      case 'list': {
        const worldState = world.getWorldState();
        console.log('\n👥 Agent列表:');
        for (const [id, state] of worldState.agents) {
          console.log(`  - ${state.agentId}: ${state.status}`);
        }
        console.log();
        break;
      }

      case 'save': {
        const name = parts[1] || `manual_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        const saveData = world.exportState();
        const filePath = saveSystem.save(saveData, name);
        if (filePath) {
          console.log(`✅ 已保存: ${name}`);
        } else {
          console.log('❌ 保存失败');
        }
        break;
      }

      case 'talk': {
        const agentId1 = parts[1];
        const agentId2 = parts[2];
        if (agentId1 && agentId2) {
          await world.startConversation(agentId1, agentId2);
        } else {
          console.log('用法: talk <agentId1> <agentId2>');
        }
        break;
      }

      case 'pause':
      case '暂停': {
        world.stop();
        isRunning = false;
        console.log('⏸️ 模拟已暂停');
        break;
      }

      case 'resume':
      case '继续': {
        world.start(appConfig.world.tickIntervalMs);
        isRunning = true;
        console.log('▶️ 模拟已恢复');
        break;
      }

      case 'help':
      case '帮助': {
        showHelp();
        break;
      }

      case 'q':
      case 'exit':
      case '退出': {
        console.log('\n👋 再见!');
        world.stop();
        server.stop();
        rl.close();
        process.exit(0);
      }

      case '': {
        break;
      }

      default: {
        console.log(`❌ 未知命令: ${command}`);
        console.log('输入 help 查看可用命令');
      }
    }

    rl.prompt();
  };

  // 显示菜单
  function showMenu() {
    if (hasShownMenu) return;
    hasShownMenu = true;

    const saves = saveSystem.listSaves();

    console.log('\n═══════════════════════════════════════');
    console.log('           🎮 主菜单');
    console.log('═══════════════════════════════════════');

    if (saves.length > 0) {
      console.log('  1 / continue  - 继续游戏（加载最新）');
      console.log('  2 <编号>      - 选择存档加载');

      console.log('\n📂 存档列表:');
      console.log('─────────────────────────────────────');
      saves.forEach((save, index) => {
        const date = new Date(save.timestamp).toLocaleString();
        console.log(`  ${index + 1}. ${save.fileName}`);
        console.log(`     时间: ${date} | 大小: ${(save.size / 1024).toFixed(1)} KB`);
      });
      console.log('─────────────────────────────────────');
    } else {
      console.log('  📂 暂无存档');
      console.log('  1 / continue  - 开始新游戏');
    }

    console.log('  3 / new       - 开始新游戏');
    console.log('  del <编号>    - 删除存档');
    console.log('  q / exit      - 退出');
    console.log('═══════════════════════════════════════');
    rl.prompt();
  }

  // 显示帮助
  function showHelp() {
    console.log('\n📖 可用命令:');
    console.log('  menu          - 返回主菜单');
    console.log('  status        - 查看世界状态');
    console.log('  agents        - 列出所有Agent');
    console.log('  save [name]   - 保存游戏');
    console.log('  talk <id1> <id2> - 触发Agent对话');
    console.log('  pause         - 暂停模拟');
    console.log('  resume        - 恢复模拟');
    console.log('  help          - 显示帮助');
    console.log('  exit          - 退出程序');
    console.log();
  }

  // 9. 启动服务器
  server.start();
  console.log(`🌐 Web服务器已启动: http://localhost:${PORT}\n`);

  // 10. 显示菜单
  showMenu();

  // 11. 设置输入处理
  rl.on('line', (input) => {
    processCommand(input).catch((err) => {
      console.error('命令执行错误:', err);
      rl.prompt();
    });
  });

  // 12. 优雅关闭
  process.on('SIGINT', () => {
    console.log('\n\n👋 正在关闭...');
    world.stop();
    server.stop();
    rl.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('启动失败:', error);
  process.exit(1);
});
