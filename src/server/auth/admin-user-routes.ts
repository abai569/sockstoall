import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ApiResponse } from '../../shared/types.js';

export const adminUserRoutes = new Hono();

// 获取用户列表（管理员）
adminUserRoutes.get('/users', (c) => {
  const userList = db.query.users.findMany({
    orderBy: [users.id],
  }).sync();
  
  return c.json<ApiResponse>({ 
    success: true, 
    data: userList.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      status: u.status,
      trafficLimitGb: u.trafficLimitGb,
      expiredAt: u.expiredAt,
      maxNodes: u.maxNodes,
      createdAt: u.createdAt,
    }))
  });
});

// 更新用户（管理员）
adminUserRoutes.put('/users/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<{
    status?: number;
    trafficLimitGb?: number;
    expiredAt?: number;
    maxNodes?: number;
  }>();
  
  const user = db.query.users.findFirst({
    where: eq(users.id, id),
  }).sync();
  
  if (!user) {
    return c.json<ApiResponse>({ success: false, error: '用户不存在' }, 404);
  }
  
  const updateData: any = { updatedAt: new Date().toISOString() };
  if (body.status !== undefined) updateData.status = body.status;
  if (body.trafficLimitGb !== undefined) updateData.trafficLimitGb = body.trafficLimitGb;
  if (body.expiredAt !== undefined) updateData.expiredAt = body.expiredAt;
  if (body.maxNodes !== undefined) updateData.maxNodes = body.maxNodes;
  
  db.update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .run();
  
  return c.json<ApiResponse>({ success: true });
});

// 删除用户（管理员）
adminUserRoutes.delete('/users/:id', (c) => {
  const id = parseInt(c.req.param('id'));
  
  const user = db.query.users.findFirst({
    where: eq(users.id, id),
  }).sync();
  
  if (!user) {
    return c.json<ApiResponse>({ success: false, error: '用户不存在' }, 404);
  }
  
  if (user.role === 'admin') {
    return c.json<ApiResponse>({ success: false, error: '不能删除管理员' }, 400);
  }
  
  db.delete(users)
    .where(eq(users.id, id))
    .run();
  
  return c.json<ApiResponse>({ success: true });
});
