import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { AgentConfig, Memory, Reflection } from './types';

/**
 * 存档数据结构
 */
export interface SaveData {
  version: string;
  timestamp: string;
  gameTime: string;
  weather?: string;
  world: {
    width: number;
    height: number;
    timeScale: number;
    tickCount: number;
  };
  agents: SavedAgent[];
  events: any[];
}

/**
 * 保存的Agent数据
 */
export interface SavedAgent {
  config: AgentConfig;
  position: { x: number; y: number; area?: string };
  memories: Memory[];
  reflections: Reflection[];
  currentAction?: any;
  status: 'idle' | 'busy' | 'sleeping';
}

/**
 * 存档管理器
 * 负责保存、加载、列出游戏存档
 */
export class SaveSystem {
  private saveDir: string;
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor(saveDir: string = './data/saves') {
    this.saveDir = resolve(process.cwd(), saveDir);
    this.ensureSaveDir();
  }

  /**
   * 确保存档目录存在
   */
  private ensureSaveDir(): void {
    if (!existsSync(this.saveDir)) {
      mkdirSync(this.saveDir, { recursive: true });
      console.log('✅ 创建存档目录:', this.saveDir);
    }
  }

  /**
   * 生成存档文件名
   */
  private generateSaveFileName(name?: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = name ? `${name}_${timestamp}` : `save_${timestamp}`;
    return resolve(this.saveDir, `${fileName}.json`);
  }

  /**
   * 保存游戏
   * @param saveData 存档数据
   * @param name 存档名称（可选）
   * @returns 保存的文件路径
   */
  save(saveData: Omit<SaveData, 'version' | 'timestamp'>, name?: string): string {
    const fullSaveData: SaveData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      ...saveData,
    };

    const filePath = this.generateSaveFileName(name);
    writeFileSync(filePath, JSON.stringify(fullSaveData, null, 2), 'utf-8');

    console.log(`💾 游戏已保存: ${filePath}`);
    return filePath;
  }

  /**
   * 加载存档
   * @param filePath 存档文件路径，或自动选择最新存档
   * @returns 存档数据
   */
  load(filePath?: string): SaveData | null {
    const targetPath = filePath || this.getLatestSave();

    if (!targetPath) {
      console.log('❌ 没有找到存档文件');
      return null;
    }

    if (!existsSync(targetPath)) {
      console.log(`❌ 存档文件不存在: ${targetPath}`);
      return null;
    }

    try {
      const data = readFileSync(targetPath, 'utf-8');
      const saveData: SaveData = JSON.parse(data);

      // 版本检查
      if (!saveData.version) {
        console.warn('⚠️ 存档版本未知，可能不兼容');
      }

      console.log(`📂 加载存档: ${targetPath}`);
      console.log(`   存档时间: ${new Date(saveData.timestamp).toLocaleString()}`);
      console.log(`   游戏时间: ${new Date(saveData.gameTime).toLocaleString()}`);
      console.log(`   Agent数量: ${saveData.agents.length}`);

      return saveData;
    } catch (e) {
      console.error(`❌ 加载存档失败:`, e);
      return null;
    }
  }

  /**
   * 列出所有存档
   * @returns 存档列表
   */
  listSaves(): Array<{ fileName: string; filePath: string; timestamp: Date; size: number }> {
    this.ensureSaveDir();

    const files = readdirSync(this.saveDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const filePath = resolve(this.saveDir, f);
        const stat = statSync(filePath);
        return {
          fileName: f,
          filePath,
          timestamp: stat.mtime,
          size: stat.size,
        };
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return files;
  }

  /**
   * 获取最新的存档
   */
  getLatestSave(): string | null {
    const saves = this.listSaves();
    return saves.length > 0 ? saves[0].filePath : null;
  }

  /**
   * 删除存档
   * @param filePath 存档路径
   */
  deleteSave(filePath: string): boolean {
    try {
      if (existsSync(filePath)) {
        const fs = require('fs');
        fs.unlinkSync(filePath);
        console.log(`🗑️ 删除存档: ${filePath}`);
        return true;
      }
      return false;
    } catch (e) {
      console.error(`❌ 删除存档失败:`, e);
      return false;
    }
  }

  /**
   * 启动自动保存
   * @param saveCallback 获取存档数据的回调
   * @param intervalMs 自动保存间隔（毫秒），默认5分钟
   */
  startAutoSave(saveCallback: () => Omit<SaveData, 'version' | 'timestamp'>, intervalMs: number = 300000): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    console.log(`🔄 自动保存已启动（每 ${intervalMs / 1000} 秒）`);

    this.autoSaveInterval = setInterval(() => {
      const data = saveCallback();
      this.save(data, 'autosave');
    }, intervalMs);
  }

  /**
   * 停止自动保存
   */
  stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
      console.log('⏹️ 自动保存已停止');
    }
  }

  /**
   * 打印存档列表
   */
  printSaves(): void {
    const saves = this.listSaves();

    if (saves.length === 0) {
      console.log('📂 没有找到存档');
      return;
    }

    console.log('\n📂 存档列表:');
    console.log('─'.repeat(80));
    saves.forEach((save, index) => {
      const sizeKb = (save.size / 1024).toFixed(1);
      const dateStr = save.timestamp.toLocaleString();
      console.log(`${index + 1}. ${save.fileName}`);
      console.log(`   时间: ${dateStr} | 大小: ${sizeKb} KB`);
      console.log(`   路径: ${save.filePath}`);
    });
    console.log('─'.repeat(80));
  }
}

/**
 * 存档管理单例
 */
let saveSystem: SaveSystem | null = null;

export function getSaveSystem(saveDir?: string): SaveSystem {
  if (!saveSystem) {
    saveSystem = new SaveSystem(saveDir);
  }
  return saveSystem;
}
