/**
 * 转发规则路由
 */

import { Hono } from 'hono';
import type { Route, CreateRouteRequest, ApiResponse, ListResponse } from '../../shared/types.js';
import { 
  getRoutes, getRouteById, createRoute, updateRoute, 
  deleteRoute, setRouteEnabled 
} from './route-store.js';
import { getNodeById, getNodes } from '../node/node-store.js';
import { xrayService } from '../xray/service.js';

export const routeRoutes = new Hono();

// 重新加载 Xray 配置（只包含启用的节点和规则）
function reloadXray() {
  const nodes = getNodes().filter(n => n.enabled);
  const routes = getRoutes().filter(r => r.enabled);
  const routeDetails = routes
    .map(r => {
      const node = getNodeById(r.nodeId);
      return node ? { routeId: r.id, node, outbound: r.outbound } : null;
    })
    .filter(Boolean) as any[];
  xrayService.setNodesAndRoutes(nodes, routeDetails);
}

// 获取所有规则
routeRoutes.get('/', (c) => {
  const routes = getRoutes();
  const response: ListResponse<Route> = { items: routes, total: routes.length };
  return c.json<ApiResponse<ListResponse<Route>>>({ success: true, data: response });
});

// 获取单个规则
routeRoutes.get('/:id', (c) => {
  const id = c.req.param('id');
  const route = getRouteById(id);
  
  if (!route) {
    return c.json<ApiResponse>({ success: false, error: '规则不存在' }, 404);
  }
  
  return c.json<ApiResponse<Route>>({ success: true, data: route });
});

// 创建规则（自动重载 Xray）
routeRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json<CreateRouteRequest>();
    
    const node = getNodeById(body.nodeId);
    if (!node) {
      return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 400);
    }
    
    if (!body.outbound.address || !body.outbound.port) {
      return c.json<ApiResponse>({ success: false, error: '出站配置不完整' }, 400);
    }
    
    const route = createRoute(body);
    reloadXray();
    return c.json<ApiResponse<Route>>({ success: true, data: route }, 201);
  } catch (error) {
    console.error('Create route error:', error);
    return c.json<ApiResponse>({ success: false, error: '创建规则失败' }, 500);
  }
});

// 更新规则（自动重载 Xray）
routeRoutes.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<Partial<CreateRouteRequest>>();
    
    const route = updateRoute(id, body);
    if (!route) {
      return c.json<ApiResponse>({ success: false, error: '规则不存在' }, 404);
    }
    
    reloadXray();
    return c.json<ApiResponse<Route>>({ success: true, data: route });
  } catch (error) {
    console.error('Update route error:', error);
    return c.json<ApiResponse>({ success: false, error: '更新规则失败' }, 500);
  }
});

// 删除规则（自动重载 Xray）
routeRoutes.delete('/:id', (c) => {
  const id = c.req.param('id');
  const success = deleteRoute(id);
  
  if (!success) {
    return c.json<ApiResponse>({ success: false, error: '规则不存在' }, 404);
  }
  
  reloadXray();
  return c.json<ApiResponse>({ success: true });
});

// 启用/禁用规则（自动重载 Xray）
routeRoutes.patch('/:id/toggle', async (c) => {
  try {
    const id = c.req.param('id');
    const { enabled } = await c.req.json<{ enabled: boolean }>();
    
    const route = setRouteEnabled(id, enabled);
    if (!route) {
      return c.json<ApiResponse>({ success: false, error: '规则不存在' }, 404);
    }
    
    reloadXray();
    return c.json<ApiResponse<Route>>({ success: true, data: route });
  } catch (error) {
    console.error('Toggle route error:', error);
    return c.json<ApiResponse>({ success: false, error: '操作失败' }, 500);
  }
});
