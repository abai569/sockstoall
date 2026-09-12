import { Hono } from 'hono';
import { db } from '../db/index.js';
import { servers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ApiResponse } from '../../shared/types.js';

export const agentRoutes = new Hono();

// Agent 心跳上报
agentRoutes.post('/heartbeat', async (c) => {
  const body = await c.req.json<{
    token: string;
    xrayVersion?: string;
    os?: string;
    arch?: string;
  }>();
  
  if (!body.token) {
    return c.json<ApiResponse>({ success: false, error: '缺少 token' }, 400);
  }
  
  const server = db.query.servers.findFirst({
    where: eq(servers.agentToken, body.token),
  }).sync();
  
  if (!server) {
    return c.json<ApiResponse>({ success: false, error: '无效的 token' }, 401);
  }
  
  db.update(servers)
    .set({
      status: 'online',
      lastHeartbeat: Date.now(),
      xrayVersion: body.xrayVersion || server.xrayVersion,
      os: body.os || server.os,
      arch: body.arch || server.arch,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(servers.id, server.id))
    .run();
  
  return c.json<ApiResponse>({ success: true });
});

// Agent 拉取配置
agentRoutes.post('/config', async (c) => {
  const body = await c.req.json<{ token: string }>();
  
  if (!body.token) {
    return c.json<ApiResponse>({ success: false, error: '缺少 token' }, 400);
  }
  
  const server = db.query.servers.findFirst({
    where: eq(servers.agentToken, body.token),
  }).sync();
  
  if (!server) {
    return c.json<ApiResponse>({ success: false, error: '无效的 token' }, 401);
  }
  
  // TODO: 返回该服务器的节点配置
  return c.json<ApiResponse>({ 
    success: true, 
    data: { nodes: [], routes: [] } 
  });
});
