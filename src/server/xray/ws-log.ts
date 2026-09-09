/**
 * WebSocket 日志推送
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { xrayService } from './service.js';
import type { LogMessage } from '../../shared/types.js';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });
  
  wss.on('connection', (ws) => {
    clients.add(ws);
    
    const statusMsg = {
      type: 'status',
      running: xrayService.isRunning(),
      uptime: xrayService.getUptime(),
      pid: xrayService.getPid(),
    };
    ws.send(JSON.stringify(statusMsg));
    
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });
  
  xrayService.on('log', (data: { level: string; message: string }) => {
    broadcast({
      type: 'log',
      level: data.level as LogMessage['level'],
      message: data.message,
      timestamp: Date.now(),
    });
  });
  
  xrayService.on('exit', () => {
    broadcast({ type: 'status', running: false });
  });
  
  xrayService.on('error', (data: { message: string }) => {
    broadcast({
      type: 'log',
      level: 'error',
      message: data.message,
      timestamp: Date.now(),
    });
  });
  
  console.log('WebSocket server initialized on /ws');
}

function broadcast(message: any): void {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function closeWebSocket(): void {
  if (wss) { wss.close(); wss = null; }
  clients.clear();
}
