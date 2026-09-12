import { Hono } from 'hono';
import { db } from '../db/index.js';
import { servers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import type { ApiResponse } from '../../shared/types.js';

export const serverRoutes = new Hono();

// 获取服务器列表（管理员）
serverRoutes.get('/servers', (c) => {
  const list = db.query.servers.findMany({
    orderBy: [servers.id],
  }).sync();
  
  return c.json<ApiResponse>({ success: true, data: list });
});

// 创建服务器（管理员）
serverRoutes.post('/servers', async (c) => {
  const body = await c.req.json<{ name: string; address: string }>();
  
  if (!body.name || !body.address) {
    return c.json<ApiResponse>({ success: false, error: '名称和地址不能为空' }, 400);
  }
  
  const agentToken = randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  
  const result = db.insert(servers).values({
    name: body.name,
    address: body.address,
    agentToken,
    status: 'offline',
    createdAt: now,
    updatedAt: now,
  }).run();
  
  return c.json<ApiResponse>({ 
    success: true, 
    data: { id: result.lastInsertRowid, agentToken } 
  });
});

// 删除服务器（管理员）
serverRoutes.delete('/servers/:id', (c) => {
  const id = parseInt(c.req.param('id'));
  
  const server = db.query.servers.findFirst({
    where: eq(servers.id, id),
  }).sync();
  
  if (!server) {
    return c.json<ApiResponse>({ success: false, error: '服务器不存在' }, 404);
  }
  
  db.delete(servers).where(eq(servers.id, id)).run();
  
  return c.json<ApiResponse>({ success: true });
});
