import 'dotenv/config';
import * as readline from 'readline';
import { appConfig, ensureDataDir, validateConfig } from './config';
import { WorldSimulator } from './world/simulator';
import { LLMClient } from './llm/client';
import { agentTemplates } from './data/agent-templates';
import { SaveSystem } from './save-system';

/**
 * AI小镇主程序 - 支持存档/读档和实时命令
 */
async function main() {
  console.log('🎮 AI小镇启动中...\n');

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

  // 监听世界事件
  let lastHour = -1;
  const lastAgentActions = new Map<string, string>();

  world.on('tick', (state) => {
    const currentHour = state.time.getHours();

    // 打印时间变化（每小时）
    if (currentHour !== lastHour) {
      console.log(`\n⏰ 游戏时间: ${state.time.toLocaleTimeString()}`);
      console.log(`👥 在线Agent: ${state.agents.length}个`);
      lastHour = currentHour;
    }

    // 打印Agent动作变化（动作变化时）
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

  world.on('event', (event) => {
    console.log(`📢 世界事件: ${event.description}`);
  });

  world.on('loaded', ({ tickCount, agentCount }) => {
    console.log(`📂 存档加载: ${agentCount} 个Agent, ${tickCount} ticks`);
  });

  console.log('✅ 世界模拟器初始化完成\n');

  // 5. 设置命令行接口
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  // 游戏状态
  let isRunning = false;
  let isInMenu = true;

  // 6. 命令处理
  const processCommand = async (input: string) => {
    const parts = input.trim().split(/\s+/);
    const command = parts[0].toLowerCase();

    // 菜单状态下的命令
    if (isInMenu) {
      switch (command) {
        case '1':
        case '继续':
        case 'continue': {
          isInMenu = false;
          const saveData = saveSystem.load();
          if (saveData) {
            await world.loadFromSave(saveData);
            startGame();
          } else {
            console.log('❌ 加载失败，输入 3 开始新游戏');
            showMenu();
          }
          return;
        }

        case '2':
        case '选择':
        case 'select': {
          if (parts[1]) {
            const index = parseInt(parts[1]) - 1;
            const saves = saveSystem.listSaves();
            if (index >= 0 && index < saves.length) {
              isInMenu = false;
              const saveData = saveSystem.load(saves[index].filePath);
              if (saveData) {
                await world.loadFromSave(saveData);
                startGame();
              } else {
                console.log('❌ 加载失败');
                showMenu();
              }
            } else {
              console.log('❌ 无效的存档编号');
              showMenu();
            }
          } else {
            console.log('请输入存档编号，例如: 2 1');
            showMenu();
          }
          return;
        }

        case '3':
        case '新游戏':
        case 'new': {
          isInMenu = false;
          await createNewGame(world);
          startGame();
          return;
        }

        case 'del':
        case 'delete': {
          if (parts[1]) {
            const index = parseInt(parts[1]) - 1;
            const saves = saveSystem.listSaves();
            if (index >= 0 && index < saves.length) {
              const fs = await import('fs');
              fs.unlinkSync(saves[index].filePath);
              console.log(`✅ 已删除: ${saves[index].fileName}`);
            } else {
              console.log('❌ 无效的存档编号');
            }
          }
          showMenu();
          return;
        }

        case 'exit':
        case 'quit':
        case 'q': {
          console.log('\n👋 再见！\n');
          rl.close();
          process.exit(0);
        }

        default:
          console.log('❓ 无效选项，请重新选择');
          showMenu();
          return;
      }
    }

    // 游戏运行状态下的命令
    if (!isRunning && !isInMenu) {
      console.log('游戏未运行，请等待...');
      return;
    }

    switch (command) {
      case 'save':
      case '存档': {
        const name = parts[1];
        const filePath = saveSystem.save(world.exportState(), name);
        console.log(`✅ 游戏已保存: ${filePath}`);
        break;
      }

      case 'load':
      case '读档': {
        world.stop();
        if (parts[1]) {
          const index = parseInt(parts[1]) - 1;
          const saves = saveSystem.listSaves();
          if (index >= 0 && index < saves.length) {
            const saveData = saveSystem.load(saves[index].filePath);
            if (saveData) {
              await world.loadFromSave(saveData);
              console.log('✅ 存档加载完成，游戏继续');
              world.start(appConfig.world.tickIntervalMs);
            }
          } else {
            console.log('❌ 无效的存档编号');
            world.start(appConfig.world.tickIntervalMs);
          }
        } else {
          saveSystem.printSaves();
          console.log('使用: load <编号>');
        }
        break;
      }

      case 'restart':
      case '重启': {
        console.log('\n🔄 重新开始游戏（保留Agent）...');
        world.stop();
        const configs = await world.reset(true);

        for (const config of configs) {
          await world.addAgent(config);
        }

        world.start(appConfig.world.tickIntervalMs);
        console.log('✅ 游戏已重启\n');
        break;
      }

      case 'newgame':
      case '新游戏': {
        world.stop();
        const confirm = await question('确定要开始全新游戏吗？这将清除所有进度 (y/n): ');
        if (confirm.toLowerCase() === 'y') {
          console.log('\n🆕 开始全新游戏...');
          await world.reset(false);
          await createNewGame(world);
          world.start(appConfig.world.tickIntervalMs);
          console.log('✅ 新游戏已开始\n');
        } else {
          world.start(appConfig.world.tickIntervalMs);
          console.log('取消操作');
        }
        break;
      }

      case 'talk':
      case '对话': {
        if (parts.length < 3) {
          console.log('用法: talk <Agent名字1> <Agent名字2>');
          break;
        }
        const agent1Name = parts[1];
        const agent2Name = parts[2];

        let agent1Id: string | undefined;
        let agent2Id: string | undefined;

        for (const [id, agent] of Array.from(world['agents'])) {
          if (agent.name === agent1Name) agent1Id = id;
          if (agent.name === agent2Name) agent2Id = id;
        }

        if (agent1Id && agent2Id) {
          await world.startConversation(agent1Id, agent2Id);
        } else {
          console.log(`❌ 找不到Agent: ${!agent1Id ? agent1Name : ''} ${!agent2Id ? agent2Name : ''}`);
        }
        break;
      }

      case 'status':
      case '状态': {
        const state = world.exportState();
        const gameTime = new Date(state.gameTime);
        console.log('\n📊 世界状态:');
        console.log(`  游戏时间: ${gameTime.toLocaleString()}`);
        console.log(`  运行时长: ${state.world.tickCount} ticks`);
        console.log(`  Agent数量: ${state.agents.length}`);
        console.log(`  天气: ${state.weather || '晴朗'}`);
        console.log(`  最近事件: ${state.events.length} 个\n`);
        break;
      }

      case 'agents':
      case '角色': {
        console.log('\n👥 Agent列表:');
        for (const agentData of world.exportState().agents) {
          const status = agentData.status === 'busy' ? '忙碌' : agentData.status === 'sleeping' ? '睡觉' : '空闲';
          const action = agentData.currentAction?.description || '无';
          console.log(`  ${agentData.config.name}: ${status} @ (${agentData.position.x}, ${agentData.position.y})`);
          console.log(`    行为: ${action}`);
        }
        console.log('');
        break;
      }

      case 'memories':
      case '记忆': {
        if (parts.length < 2) {
          console.log('用法: memories <Agent名字>');
          break;
        }
        const targetName = parts[1];
        // 从存档数据中获取记忆
        const state = world.exportState();
        const agentData = state.agents.find(a => a.config.name === targetName);
        if (agentData && agentData.memories.length > 0) {
          console.log(`\n🧠 ${targetName} 的记忆 (${agentData.memories.length}条):`);
          // 显示最近的5条
          const recent = agentData.memories.slice(-5);
          for (const mem of recent) {
            const date = new Date(mem.timestamp).toLocaleTimeString();
            console.log(`  [${date}] ${mem.content.substring(0, 60)}...`);
          }
          console.log('');
        } else {
          console.log(`❌ 找不到 ${targetName} 或没有记忆`);
        }
        break;
      }

      case 'pause':
      case '暂停': {
        world.stop();
        console.log('⏸️  游戏已暂停，输入 resume 继续');
        break;
      }

      case 'resume':
      case '继续': {
        world.start(appConfig.world.tickIntervalMs);
        console.log('▶️  游戏继续');
        break;
      }

      case 'menu':
      case '菜单': {
        world.stop();
        isInMenu = true;
        isRunning = false;
        console.log('\n返回主菜单...');
        showMenu();
        break;
      }

      case 'help':
      case '?':
      case '帮助': {
        showHelp();
        break;
      }

      case 'exit':
      case 'quit':
      case 'q':
      case '退出': {
        console.log('\n💾 正在保存...');
        saveSystem.save(world.exportState(), 'exit_autosave');
        saveSystem.stopAutoSave();
        world.stop();
        console.log('👋 再见！\n');
        rl.close();
        process.exit(0);
      }

      case '':
        break;

      default:
        console.log(`❓ 未知命令: ${command}，输入 help 查看帮助`);
    }
  };

  // 辅助函数
  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  const showMenu = () => {
    const saves = saveSystem.listSaves();

    if (saves.length > 0) {
      console.log('\n📂 发现以下存档：');
      saveSystem.printSaves();
    } else {
      console.log('\n📂 没有找到存档');
    }

    console.log('\n═══════════════════════════════════════');
    console.log('           🎮 主菜单');
    console.log('═══════════════════════════════════════');
    console.log('  1 / continue  - 继续游戏（加载最新）');
    console.log('  2 <编号>      - 选择存档加载');
    console.log('  3 / new       - 开始新游戏');
    if (saves.length > 0) {
      console.log('  del <编号>    - 删除存档');
    }
    console.log('  q / exit      - 退出');
    console.log('═══════════════════════════════════════');
    console.log('输入选项:\n');
  };

  const showHelp = () => {
    console.log('\n═══════════════════════════════════════');
    console.log('           📋 游戏内命令');
    console.log('═══════════════════════════════════════');
    console.log('  save [名称]   - 保存游戏（随时可用）');
    console.log('  load [编号]   - 加载存档');
    console.log('  restart       - 重新开始（保留Agent）');
    console.log('  newgame       - 全新游戏');
    console.log('  talk A B      - 让两个Agent对话');
    console.log('  status        - 查看世界状态');
    console.log('  agents        - 查看所有Agent');
    console.log('  memories 名字 - 查看Agent记忆');
    console.log('  pause/resume  - 暂停/继续');
    console.log('  menu          - 返回主菜单');
    console.log('  help          - 显示帮助');
    console.log('  exit/q/退出   - 保存并退出');
    console.log('═══════════════════════════════════════\n');
  };

  const startGame = () => {
    isRunning = true;
    world.start(appConfig.world.tickIntervalMs);
    saveSystem.startAutoSave(() => world.exportState(), 300000);
    console.log('\n═══════════════════════════════════════');
    console.log('         🚀 游戏开始！');
    console.log('═══════════════════════════════════════');
    console.log('输入 help 查看所有命令，随时可输入命令\n');
    // 显示提示符
    rl.setPrompt('> ');
    rl.prompt();
    // 处理队列中积累的命令
    processNextCommand().catch(console.error);
  };

  // 监听输入 - 将输入暂存到队列
  const inputQueue: string[] = [];
  let processingQueue = false;

  rl.on('line', (input) => {
    if (isInMenu || isRunning) {
      inputQueue.push(input);
      processNextCommand().catch(console.error);
    }
  });

  const processNextCommand = async () => {
    if (processingQueue || inputQueue.length === 0) return;
    processingQueue = true;

    while (inputQueue.length > 0) {
      const input = inputQueue.shift()!;
      await processCommand(input);
    }

    processingQueue = false;
    // 显示提示符
    if (!isInMenu && isRunning) {
      rl.setPrompt('> ');
      rl.prompt();
    }
  };

  // 显示初始菜单
  showMenu();

  // 优雅退出
  process.on('SIGINT', async () => {
    console.log('\n\n💾 正在保存...');
    saveSystem.save(world.exportState(), 'exit_autosave');
    saveSystem.stopAutoSave();
    world.stop();
    console.log('👋 再见！\n');
    rl.close();
    process.exit(0);
  });
}

/**
 * 创建新游戏
 */
async function createNewGame(world: WorldSimulator) {
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
    await world.addAgent(config);
  }

  console.log('\n✅ 所有Agent创建完成\n');
}

// 运行主程序
main().catch((e) => {
  console.error('程序错误:', e);
  process.exit(1);
});
