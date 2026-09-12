/**
 * Xray 服务路由
 */

import { Hono } from 'hono';
import type { ApiResponse } from '../../shared/types.js';
import { xrayService } from './service.js';
import { getNodes, getNodeById } from '../node/node-store.js';
import { getRoutes } from '../route/route-store.js';

export const xrayRoutes = new Hono();

// 获取 Xray 服务状态
xrayRoutes.get('/status', async (c) => {
  const version = await xrayService.getVersion();
  
  return c.json<ApiResponse<any>>({ 
    success: true, 
    data: {
      installed: xrayService.isInstalled(),
      running: xrayService.isRunning(),
      version,
      uptime: xrayService.getUptime(),
      pid: xrayService.getPid(),
    }
  });
});

// 检查 Xray 更新（仅管理员）
xrayRoutes.get('/update', async (c) => {
  if ((c as any).get('username') !== 'admin') {
    return c.json<ApiResponse>({ success: false, error: '仅管理员可以管理 Xray' }, 403);
  }

  return c.json<ApiResponse>({ success: true, data: await xrayService.checkUpdate() });
});

// 升级 Xray（仅管理员）
xrayRoutes.post('/update', async (c) => {
  if ((c as any).get('username') !== 'admin') {
    return c.json<ApiResponse>({ success: false, error: '仅管理员可以管理 Xray' }, 403);
  }

  try {
    const result = await xrayService.upgrade();
    return c.json<ApiResponse>({ success: true, data: result });
  } catch (error: any) {
    return c.json<ApiResponse>({ success: false, error: error.message || 'Xray 升级失败' }, 400);
  }
});

// 手动启动 Xray 服务
xrayRoutes.post('/start', (c) => {
  const result = xrayService.start();
  
  if (!result.success) {
    return c.json<ApiResponse>({ success: false, error: result.error }, 500);
  }
  
  return c.json<ApiResponse>({ success: true, data: { message: 'Xray 服务已启动' } });
});

// 手动停止 Xray 服务
xrayRoutes.post('/stop', (c) => {
  const result = xrayService.stop();
  
  if (!result.success) {
    return c.json<ApiResponse>({ success: false, error: result.error }, 400);
  }
  
  return c.json<ApiResponse>({ success: true, data: { message: 'Xray 服务已停止' } });
});

// 重新加载配置（手动触发）
xrayRoutes.post('/reload', (c) => {
  const nodes = getNodes().filter(n => n.enabled);
  const routes = getRoutes().filter(r => r.enabled);
  const routeDetails = routes
    .map(r => {
      const node = getNodeById(r.nodeId);
      return node ? { routeId: r.id, node, outbound: r.outbound } : null;
    })
    .filter(Boolean) as any[];
  
  xrayService.setNodesAndRoutes(nodes, routeDetails);
  return c.json<ApiResponse>({ success: true, data: { message: '配置已重载' } });
});
