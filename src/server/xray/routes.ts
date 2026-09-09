/**
 * Xray 管理路由
 */

import { Hono } from 'hono';
import type { ApiResponse } from '../../shared/types.js';
import { xrayManager } from './manager.js';
import { getNodeById } from '../node/node-store.js';
import { getRouteById } from '../route/route-store.js';

export const xrayRoutes = new Hono();

// 获取状态
xrayRoutes.get('/status', async (c) => {
  const status = xrayManager.getStatus();
  
  if (status.installed) {
    const version = await xrayManager.getVersion();
    (status as any).version = version;
  }
  
  const runningInstances = xrayManager.getRunningInstances();
  (status as any).runningInstances = runningInstances;
  (status as any).instanceCount = runningInstances.length;
  
  return c.json<ApiResponse<any>>({ success: true, data: status });
});

// 启动节点（直连出站）
xrayRoutes.post('/start-node', async (c) => {
  try {
    const { nodeId } = await c.req.json<{ nodeId: string }>();
    
    if (!nodeId) {
      return c.json<ApiResponse>({ success: false, error: '缺少 nodeId' }, 400);
    }
    
    const node = getNodeById(nodeId);
    if (!node) {
      return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
    }
    
    const result = xrayManager.startNode(node);
    
    if (!result.success) {
      return c.json<ApiResponse>({ success: false, error: result.error }, 500);
    }
    
    return c.json<ApiResponse>({ success: true, data: { message: '节点启动成功', nodeId } });
  } catch (error) {
    console.error('Start node error:', error);
    return c.json<ApiResponse>({ success: false, error: '启动失败' }, 500);
  }
});

// 启动转发规则（SOCKS 出站）
xrayRoutes.post('/start', async (c) => {
  try {
    const { routeId } = await c.req.json<{ routeId: string }>();
    
    if (!routeId) {
      return c.json<ApiResponse>({ success: false, error: '缺少 routeId' }, 400);
    }
    
    const route = getRouteById(routeId);
    if (!route) {
      return c.json<ApiResponse>({ success: false, error: '规则不存在' }, 404);
    }
    
    const node = getNodeById(route.nodeId);
    if (!node) {
      return c.json<ApiResponse>({ success: false, error: '关联节点不存在' }, 404);
    }
    
    const result = xrayManager.startRoute(routeId, node, route.outbound);
    
    if (!result.success) {
      return c.json<ApiResponse>({ success: false, error: result.error }, 500);
    }
    
    return c.json<ApiResponse>({ success: true, data: { message: '规则启动成功', routeId } });
  } catch (error) {
    console.error('Start route error:', error);
    return c.json<ApiResponse>({ success: false, error: '启动失败' }, 500);
  }
});

// 停止（节点或规则）
xrayRoutes.post('/stop', async (c) => {
  try {
    const { id } = await c.req.json<{ id: string }>();
    
    if (!id) {
      return c.json<ApiResponse>({ success: false, error: '缺少 id' }, 400);
    }
    
    const result = xrayManager.stop(id);
    
    if (!result.success) {
      return c.json<ApiResponse>({ success: false, error: result.error }, 400);
    }
    
    return c.json<ApiResponse>({ success: true, data: { message: '已停止', id } });
  } catch (error) {
    console.error('Stop error:', error);
    return c.json<ApiResponse>({ success: false, error: '停止失败' }, 500);
  }
});

// 停止所有实例
xrayRoutes.post('/stop-all', (c) => {
  xrayManager.stopAll();
  return c.json<ApiResponse>({ success: true, data: { message: '已停止所有实例' } });
});
