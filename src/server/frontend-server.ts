import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { WorldSimulator } from '../world/simulator';
import { Agent } from '../agent/agent';
import { AgentConfig } from '../types';

/**
 * 前端服务器
 * 提供HTTP服务和WebSocket实时通信
 */
export class FrontendServer {
  private server: http.Server;
  private wss: WebSocketServer;
  private simulator: WorldSimulator;
  private clients: Set<WebSocket> = new Set();
  private port: number;

  constructor(simulator: WorldSimulator, port: number = 3000) {
    this.simulator = simulator;
    this.port = port;

    // 创建HTTP服务器
    this.server = http.createServer((req, res) => this.handleHttpRequest(req, res));

    // 创建WebSocket服务器
    this.wss = new WebSocketServer({ server: this.server });

    // 设置WebSocket事件处理
    this.wss.on('connection', (ws) => this.handleWebSocketConnection(ws));

    // 订阅模拟器事件
    this.setupSimulatorListeners();
  }

  /**
   * 启动服务器
   */
  start(): void {
    this.server.listen(this.port, () => {
      console.log(`\n🌐 前端服务器已启动`);
      console.log(`   访问地址: http://localhost:${this.port}`);
      console.log(`   WebSocket: ws://localhost:${this.port}\n`);
    });
  }

  /**
   * 停止服务器
   */
  stop(): void {
    this.wss.close();
    this.server.close();
    console.log('前端服务器已停止');
  }

  /**
   * 处理HTTP请求
   */
  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url === '/' ? '/index.html' : req.url;
    // 修正路径：从 src/server/ 上两级到项目根目录
    const filePath = path.join(__dirname, '..', '..', 'public', url!);

    // 安全检查：确保请求的文件在public目录内
    const resolvedPath = path.resolve(filePath);
    const publicPath = path.resolve(path.join(__dirname, '..', '..', 'public'));
    if (!resolvedPath.startsWith(publicPath)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404);
          res.end('Not Found');
        } else {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
        return;
      }

      // 设置Content-Type
      const ext = path.extname(filePath);
      const contentType = this.getContentType(ext);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }

  /**
   * 获取文件类型
   */
  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    };
    return types[ext] || 'application/octet-stream';
  }

  /**
   * 处理WebSocket连接
   */
  private handleWebSocketConnection(ws: WebSocket): void {
    console.log('客户端已连接');
    this.clients.add(ws);

    // 发送初始状态
    this.sendInitialState(ws);

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        this.handleWebSocketMessage(ws, data);
      } catch (e) {
        console.error('WebSocket消息解析失败:', e);
      }
    });

    ws.on('close', () => {
      console.log('客户端已断开');
      this.clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('WebSocket错误:', err);
      this.clients.delete(ws);
    });
  }

  /**
   * 发送初始状态给新连接的客户端
   */
  private sendInitialState(ws: WebSocket): void {
    const worldState = this.simulator.getWorldState();
    const agents: any[] = [];

    // 获取所有Agent的详细信息
    const simulatorAny = this.simulator as any;
    const agentMap = simulatorAny.agents as Map<string, Agent>;

    for (const [id, agent] of agentMap) {
      agents.push({
        id: agent.id,
        name: agent.name,
        age: agent.config.age,
        traits: agent.config.traits,
        position: agent.getPosition(),
        status: agent.getState().status,
        currentAction: agent.getState().currentAction,
      });
    }

    const objects: any[] = [];
    for (const obj of worldState.objects.values()) {
      objects.push(obj);
    }

    this.sendToClient(ws, {
      type: 'initialState',
      data: {
        world: {
          width: (this.simulator as any).width,
          height: (this.simulator as any).height,
          time: worldState.time,
          tickCount: this.simulator.getTickCount(),
        },
        agents,
        objects,
        events: worldState.events,
        isRunning: this.simulator.getIsRunning(),
      },
    });
  }

  /**
   * 处理WebSocket消息
   */
  private handleWebSocketMessage(ws: WebSocket, data: any): void {
    switch (data.type) {
      case 'command':
        this.handleCommand(data.command, data.params);
        break;
      case 'requestAgentDetails':
        this.sendAgentDetails(ws, data.agentId);
        break;
      case 'startSimulation':
        this.simulator.start(data.interval || 5000);
        this.broadcast({ type: 'simulationStarted' });
        break;
      case 'stopSimulation':
        this.simulator.stop();
        this.broadcast({ type: 'simulationStopped' });
        break;
      default:
        console.log('未知消息类型:', data.type);
    }
  }

  /**
   * 处理命令
   */
  private handleCommand(command: string, params: any): void {
    switch (command) {
      case 'triggerConversation':
        if (params.agentId1 && params.agentId2) {
          this.simulator.startConversation(params.agentId1, params.agentId2);
        }
        break;
      case 'triggerEvent':
        if (params.description) {
          this.simulator.triggerEvent(params.type || 'custom', params.description);
        }
        break;
    }
  }

  /**
   * 发送Agent详细信息
   */
  private sendAgentDetails(ws: WebSocket, agentId: string): void {
    const simulatorAny = this.simulator as any;
    const agent = (simulatorAny.agents as Map<string, Agent>).get(agentId);

    if (!agent) {
      this.sendToClient(ws, { type: 'error', message: 'Agent not found' });
      return;
    }

    const memoryData = agent.memory.exportData();

    this.sendToClient(ws, {
      type: 'agentDetails',
      data: {
        id: agent.id,
        name: agent.name,
        config: agent.config,
        position: agent.getPosition(),
        state: agent.getState(),
        memories: memoryData.memories.slice(-20), // 最近20条记忆
        reflections: memoryData.reflections.slice(-10), // 最近10条反思
      },
    });
  }

  /**
   * 设置模拟器事件监听
   */
  private setupSimulatorListeners(): void {
    // Tick事件
    this.simulator.on('tick', (data) => {
      this.broadcast({
        type: 'tick',
        data: {
          time: data.time,
          agents: data.agents,
          tickCount: this.simulator.getTickCount(),
        },
      });
    });

    // Agent加入事件
    this.simulator.on('agentJoined', (agentState) => {
      this.broadcast({
        type: 'agentJoined',
        data: agentState,
      });
    });

    // Agent离开事件
    this.simulator.on('agentLeft', (data) => {
      this.broadcast({
        type: 'agentLeft',
        data,
      });
    });

    // 世界事件
    this.simulator.on('event', (event) => {
      this.broadcast({
        type: 'worldEvent',
        data: event,
      });
    });

    // 模拟启动/停止
    this.simulator.on('started', () => {
      this.broadcast({ type: 'simulationStarted' });
    });

    this.simulator.on('stopped', () => {
      this.broadcast({ type: 'simulationStopped' });
    });
  }

  /**
   * 广播消息给所有客户端
   */
  private broadcast(message: any): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  /**
   * 发送消息给特定客户端
   */
  private sendToClient(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}
