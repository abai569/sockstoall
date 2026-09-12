/**
 * 转发规则路由
 */

import { Hono } from 'hono';
import type { Route, CreateRouteRequest, ApiResponse, ListResponse } from '../../shared/types.js';
import { 
  getRoutes, getRouteById, createRoute, updateRoute, 
  deleteRoute, setRouteEnabled, countRoutesByUser
} from './route-store.js';
import { getNodeById, getNodes } from '../node/node-store.js';
import { getUserById } from '../auth/user-store.js';
import { xrayService } from '../xray/service.js';

export const routeRoutes = new Hono();

function canAccessRoute(c: any, route: Route): boolean {
  if (c.get('role') === 'admin') return true;
  return (route.userId ?? 1) === c.get('userId');
}

// 重新加载 Xray 配置（只包含本机启用的节点和规则）
function reloadXray() {
  setTimeout(() => {
    try {
      const nodes = getNodes().filter(n => n.enabled && (n.serverId ?? 1) === 1);
      const routes = getRoutes().filter(r => r.enabled);
      const routeDetails = routes
        .map(r => {
          const node = getNodeById(r.nodeId);
          return node && (node.serverId ?? 1) === 1 ? { routeId: r.id, node, outbound: r.outbound } : null;
        })
        .filter(Boolean) as any[];
      xrayService.setNodesAndRoutes(nodes, routeDetails);
      console.log('Xray config reloaded');
    } catch (error) {
      console.error('Failed to reload Xray config:', error);
    }
  }, 0);
}

// 获取所有规则（管理员看全部，普通用户看自己的）
routeRoutes.get('/', (c) => {
  const isAdmin = (c as any).get('role') === 'admin';
  const userId = (c as any).get('userId');
  let routes = getRoutes();
  if (!isAdmin) {
    routes = routes.filter(r => (r.userId ?? 1) === userId);
  }
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
  if (!canAccessRoute(c, route)) {
    return c.json<ApiResponse>({ success: false, error: '无权操作该规则' }, 403);
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

    const role = (c as any).get('role');
    const userId = (c as any).get('userId');

    if (role !== 'admin') {
      if ((node.userId ?? 1) !== userId) {
        return c.json<ApiResponse>({ success: false, error: '无权使用该节点' }, 403);
      }
      const user = await getUserById(userId);
      const limit = user?.maxNodes ?? 0;
      if (limit > 0 && countRoutesByUser(userId) >= limit) {
        return c.json<ApiResponse>({ success: false, error: `出站代理数量已达上限（${limit}）` }, 400);
      }
    }
    
    if (!body.outbound.address || !body.outbound.port) {
      return c.json<ApiResponse>({ success: false, error: '出站配置不完整' }, 400);
    }
    
    const route = createRoute({ ...body, userId });
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
    const existing = getRouteById(id);
    if (!existing) {
      return c.json<ApiResponse>({ success: false, error: '规则不存在' }, 404);
    }
    if (!canAccessRoute(c, existing)) {
      return c.json<ApiResponse>({ success: false, error: '无权操作该规则' }, 403);
    }
    const body = await c.req.json<Partial<CreateRouteRequest>>();
    
    const route = updateRoute(id, body);
    
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
  const existing = getRouteById(id);
  if (!existing) {
    return c.json<ApiResponse>({ success: false, error: '规则不存在' }, 404);
  }
  if (!canAccessRoute(c, existing)) {
    return c.json<ApiResponse>({ success: false, error: '无权操作该规则' }, 403);
  }

  deleteRoute(id);
  reloadXray();
  return c.json<ApiResponse>({ success: true });
});

// 启用/禁用规则（自动重载 Xray）
routeRoutes.patch('/:id/toggle', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = getRouteById(id);
    if (!existing) {
      return c.json<ApiResponse>({ success: false, error: '规则不存在' }, 404);
    }
    if (!canAccessRoute(c, existing)) {
      return c.json<ApiResponse>({ success: false, error: '无权操作该规则' }, 403);
    }
    const { enabled } = await c.req.json<{ enabled: boolean }>();
    
    const route = setRouteEnabled(id, enabled);
    
    reloadXray();
    return c.json<ApiResponse<Route>>({ success: true, data: route });
  } catch (error) {
    console.error('Toggle route error:', error);
    return c.json<ApiResponse>({ success: false, error: '操作失败' }, 500);
  }
});
