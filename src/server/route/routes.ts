/**
 * 转发规则路由
 */

import { Hono } from 'hono';
import type { Route, CreateRouteRequest, ApiResponse, ListResponse } from '../../shared/types.js';
import { 
  getRoutes, getRouteById, createRoute, updateRoute, 
  deleteRoute, setRouteEnabled 
} from './route-store.js';
import { getNodeById } from '../node/node-store.js';

export const routeRoutes = new Hono();

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

// 创建规则
routeRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json<CreateRouteRequest>();
    
    // 验证节点存在
    const node = getNodeById(body.nodeId);
    if (!node) {
      return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 400);
    }
    
    // 验证出站配置
    if (!body.outbound.address || !body.outbound.port) {
      return c.json<ApiResponse>({ success: false, error: '出站配置不完整' }, 400);
    }
    
    const route = createRoute(body);
    return c.json<ApiResponse<Route>>({ success: true, data: route }, 201);
  } catch (error) {
    console.error('Create route error:', error);
    return c.json<ApiResponse>({ success: false, error: '创建规则失败' }, 500);
  }
});

// 更新规则
routeRoutes.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<Partial<CreateRouteRequest>>();
    
    const route = updateRoute(id, body);
    if (!route) {
      return c.json<ApiResponse>({ success: false, error: '规则不存在' }, 404);
    }
    
    return c.json<ApiResponse<Route>>({ success: true, data: route });
  } catch (error) {
    console.error('Update route error:', error);
    return c.json<ApiResponse>({ success: false, error: '更新规则失败' }, 500);
  }
});

// 删除规则
routeRoutes.delete('/:id', (c) => {
  const id = c.req.param('id');
  const success = deleteRoute(id);
  
  if (!success) {
    return c.json<ApiResponse>({ success: false, error: '规则不存在' }, 404);
  }
  
  return c.json<ApiResponse>({ success: true });
});

// 启用/禁用规则
routeRoutes.patch('/:id/toggle', async (c) => {
  try {
    const id = c.req.param('id');
    const { enabled } = await c.req.json<{ enabled: boolean }>();
    
    const route = setRouteEnabled(id, enabled);
    if (!route) {
      return c.json<ApiResponse>({ success: false, error: '规则不存在' }, 404);
    }
    
    return c.json<ApiResponse<Route>>({ success: true, data: route });
  } catch (error) {
    console.error('Toggle route error:', error);
    return c.json<ApiResponse>({ success: false, error: '操作失败' }, 500);
  }
});
