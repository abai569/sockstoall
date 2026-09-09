/**
 * SocksToAll 服务器入口
 */

import { Hono } from 'hono';
import { createAdaptorServer } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { readFileSync } from 'fs';
import { join } from 'path';

import { authRoutes } from './auth/routes.js';
import { authMiddleware } from './auth/middleware.js';
import { nodeRoutes } from './node/routes.js';
import { linkRoutes } from './node/link-routes.js';
import { routeRoutes } from './route/routes.js';
import { xrayRoutes } from './xray/routes.js';
import { initWebSocket } from './xray/ws-log.js';

const app = new Hono();
const PORT = parseInt(process.env.PORT || '3456');

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ success: false, error: err.message }, 500);
});

// CORS for API
app.use('/api/*', cors());

// 公开路由 (登录)
app.route('/api/auth', authRoutes);

// 受保护路由
app.use('/api/link/*', authMiddleware);
app.use('/api/nodes/*', authMiddleware);
app.use('/api/routes/*', authMiddleware);
app.use('/api/xray/*', authMiddleware);

app.route('/api/link', linkRoutes);
app.route('/api/nodes', nodeRoutes);
app.route('/api/routes', routeRoutes);
app.route('/api/xray', xrayRoutes);

// 健康检查
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// 静态文件 - 始终服务前端文件（dist/client 存在时）
const clientDir = join(process.cwd(), 'dist/client');
try {
  readFileSync(join(clientDir, 'index.html'));
  // 前端资源存在，注册静态文件服务
  app.use('/assets/*', serveStatic({ root: 'dist/client' }));
  
  // SPA fallback
  app.get('*', (c) => {
    const indexPath = join(process.cwd(), 'dist/client/index.html');
    const content = readFileSync(indexPath, 'utf-8');
    return c.html(content);
  });
} catch {
  // dist/client 不存在，跳过静态文件服务
}

// 创建 HTTP 服务器
const server = createAdaptorServer({ fetch: app.fetch });

// 初始化 WebSocket
initWebSocket(server as any);

// 启动服务器
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   SocksToAll Server Running                               ║
║                                                           ║
║   URL: http://localhost:${PORT}                              ║
║   API: http://localhost:${PORT}/api                          ║
║   WS:  ws://localhost:${PORT}/ws                             ║
║                                                           ║
║   Default Login: admin / admin123                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  server.close();
  process.exit(0);
});
