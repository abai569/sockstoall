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
import { authProtectedRoutes } from './auth/auth-protected-routes.js';
import { adminUserRoutes } from './auth/admin-user-routes.js';
import { authMiddleware } from './auth/middleware.js';
import { adminMiddleware } from './auth/admin-middleware.js';
import { nodeRoutes } from './node/routes.js';
import { linkRoutes } from './node/link-routes.js';
import { routeRoutes } from './route/routes.js';
import { xrayRoutes } from './xray/routes.js';
import { shopRoutes } from './shop/index.js';
import { serverRoutes } from './server/routes.js';
import { agentRoutes } from './server/agent-routes.js';
import { agentInstallRoutes } from './server/agent-install-routes.js';
import { initWebSocket } from './xray/ws-log.js';
import { xrayService } from './xray/service.js';
import { getNodes, getNodeById } from './node/node-store.js';
import { getRoutes } from './route/route-store.js';
import { initDatabase } from './db/index.js';
import { runAutoRenewCheck, runAutoBuyTrafficCheck, cleanupExpiredOrders } from './shop/jobs.js';
import { startTrafficCollector, runTrafficResetJob } from './traffic/collector.js';

const app = new Hono();
const PORT = parseInt(process.env.PORT || '3456');

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ success: false, error: err.message }, 500);
});

// CORS for API
app.use('/api/*', cors());

app.route('/api/auth', authRoutes);

app.use('/api/auth/*', authMiddleware);
app.route('/api/auth', authProtectedRoutes);
app.use('/api/auth/admin/*', adminMiddleware);
app.route('/api/auth/admin', adminUserRoutes);

app.use('/api/link/*', authMiddleware);
app.use('/api/nodes/*', authMiddleware);
app.use('/api/routes/*', authMiddleware);
app.use('/api/xray/*', authMiddleware);
app.use('/api/shop/orders/*', authMiddleware);
app.use('/api/shop/balance/*', authMiddleware);
app.use('/api/shop/admin/*', authMiddleware);
app.use('/api/shop/admin/*', adminMiddleware);
app.use('/api/server/*', authMiddleware);

app.route('/api/link', linkRoutes);
app.route('/api/nodes', nodeRoutes);
app.route('/api/routes', routeRoutes);
app.route('/api/xray', xrayRoutes);
app.route('/api/shop', shopRoutes);
app.route('/api/server', serverRoutes);
app.route('/api/agent', agentInstallRoutes);
app.route('/api/agent', agentRoutes);

// 健康检查
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// 静态文件
const clientDir = join(process.cwd(), 'dist/client');
try {
  readFileSync(join(clientDir, 'index.html'));
  app.use('/assets/*', serveStatic({ root: 'dist/client' }));
  app.get('*', (c) => {
    const indexPath = join(process.cwd(), 'dist/client/index.html');
    const content = readFileSync(indexPath, 'utf-8');
    return c.html(content);
  });
} catch {}

// 创建 HTTP 服务器
const server = createAdaptorServer({ fetch: app.fetch });

// 初始化 WebSocket
initWebSocket(server as any);

// 初始化数据库
initDatabase();

// 启动定时任务
console.log('Starting scheduled jobs...');
setInterval(() => runAutoRenewCheck(), 60 * 1000);  // 每分钟检查自动续费
setInterval(() => runAutoBuyTrafficCheck(), 10 * 60 * 1000);  // 每 10 分钟检查自动购买流量
setInterval(() => cleanupExpiredOrders(), 60 * 60 * 1000);  // 每小时清理过期订单
setInterval(() => { try { runTrafficResetJob(); } catch (e) { console.error('Traffic reset job error:', e); } }, 30 * 60 * 1000);  // 每 30 分钟检查月度归零
startTrafficCollector();  // 每 60 秒采集本机 Xray 流量

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

  // 自动启动 Xray 服务（类似 3X-UI）
  if (xrayService.isInstalled()) {
    const nodes = getNodes().filter(n => n.enabled);
    const routes = getRoutes().filter(r => r.enabled);
    const routeDetails = routes
      .map(r => {
        const node = getNodeById(r.nodeId);
        return node ? { routeId: r.id, node, outbound: r.outbound } : null;
      })
      .filter(Boolean) as any[];
    
    xrayService.setNodesAndRoutes(nodes, routeDetails);
    
    const result = xrayService.start();
    if (result.success) {
      console.log('✓ Xray service auto-started');
    } else {
      console.log('✗ Xray auto-start failed:', result.error);
    }
  } else {
    console.log(' Xray not installed, skipping auto-start');
  }
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  xrayService.stop();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  xrayService.stop();
  server.close();
  process.exit(0);
});
