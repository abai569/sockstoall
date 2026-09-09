/**
 * WebSocket 日志推送 - 支持多实例
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { xrayManager } from './manager.js';
import type { WSMessage, LogMessage, StatusMessage } from '../../shared/types.js';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

/**
 * 初始化 WebSocket 服务
 */
export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });
  
  wss.on('connection', (ws) => {
    clients.add(ws);
    
    // 发送当前状态
    const status = xrayManager.getStatus();
    const runningInstances = xrayManager.getRunningInstances();
    const statusMsg = {
      type: 'status',
      running: status.running,
      instanceCount: runningInstances.length,
      instances: runningInstances,
    };
    ws.send(JSON.stringify(statusMsg));
    
    ws.on('close', () => {
      clients.delete(ws);
    });
    
    ws.on('error', () => {
      clients.delete(ws);
    });
  });
  
  // 监听 Xray 日志（带 routeId）
  xrayManager.on('log', (data: { routeId: string; level: string; message: string }) => {
    broadcast({
      type: 'log',
      routeId: data.routeId,
      level: data.level as LogMessage['level'],
      message: data.message,
      timestamp: Date.now(),
    });
  });
  
  // 监听 Xray 退出（带 routeId）
  xrayManager.on('exit', (data: { routeId: string; code: number }) => {
    // 发送更新后的状态
    const runningInstances = xrayManager.getRunningInstances();
    broadcast({
      type: 'status',
      running: runningInstances.length > 0,
      instanceCount: runningInstances.length,
      instances: runningInstances,
      exitedRouteId: data.routeId,
    });
  });
  
  // 监听错误（带 routeId）
  xrayManager.on('error', (data: { routeId: string; message: string }) => {
    broadcast({
      type: 'log',
      routeId: data.routeId,
      level: 'error',
      message: data.message,
      timestamp: Date.now(),
    });
  });
  
  console.log('WebSocket server initialized on /ws');
}

/**
 * 广播消息到所有客户端
 */
function broadcast(message: any): void {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

/**
 * 关闭 WebSocket 服务
 */
export function closeWebSocket(): void {
  if (wss) {
    wss.close();
    wss = null;
  }
  clients.clear();
}
