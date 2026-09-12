import { Hono } from 'hono';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ApiResponse } from '../../shared/types.js';
import { createUser, getUser, renameUser, updateUserPassword } from './user-store.js';
import { hashPassword } from './password.js';
import { countNodesByUser } from '../node/node-store.js';
import { countRoutesByUser } from '../route/route-store.js';
import { getAllowedServerIds, setAllowedServers } from '../server/user-server-store.js';

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
      nodeCount: countNodesByUser(u.id),
      routeCount: countRoutesByUser(u.id),
      createdAt: u.createdAt,
    }))
  });
});

// 创建用户（管理员）
adminUserRoutes.post('/users', async (c) => {
  try {
    const body = await c.req.json<{
      username: string;
      password: string;
      role?: string;
      status?: number;
      maxNodes?: number;
      trafficLimitGb?: number;
      expiredAt?: number;
    }>();

    if (!body.username || !body.password) {
      return c.json<ApiResponse>({ success: false, error: '用户名和密码不能为空' }, 400);
    }
    if (body.username.length < 3) {
      return c.json<ApiResponse>({ success: false, error: '用户名至少 3 个字符' }, 400);
    }
    if (body.password.length < 6) {
      return c.json<ApiResponse>({ success: false, error: '密码至少 6 个字符' }, 400);
    }

    const existing = await getUser(body.username);
    if (existing) {
      return c.json<ApiResponse>({ success: false, error: '用户名已存在' }, 409);
    }

    const passwordHash = await hashPassword(body.password);
    const user = await createUser(body.username, passwordHash, body.role || 'user');
    if (!user) {
      return c.json<ApiResponse>({ success: false, error: '创建用户失败' }, 500);
    }

    const updateData: any = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.maxNodes !== undefined) updateData.maxNodes = body.maxNodes;
    if (body.trafficLimitGb !== undefined) updateData.trafficLimitGb = body.trafficLimitGb;
    if (body.expiredAt !== undefined) updateData.expiredAt = body.expiredAt;
    if (Object.keys(updateData).length > 0) {
      db.update(users)
        .set({ ...updateData, updatedAt: new Date().toISOString() })
        .where(eq(users.id, user.id))
        .run();
    }

    return c.json<ApiResponse>({ success: true, data: { id: user.id, username: user.username } }, 201);
  } catch (error: any) {
    console.error('Create user error:', error);
    return c.json<ApiResponse>({ success: false, error: '创建用户失败' }, 500);
  }
});

// 更新用户（管理员）
adminUserRoutes.put('/users/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<{
    username?: string;
    password?: string;
    role?: string;
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

  // 用户名修改
  if (body.username && body.username.trim() && body.username.trim() !== user.username) {
    const newUsername = body.username.trim();
    if (newUsername.length < 3) {
      return c.json<ApiResponse>({ success: false, error: '用户名至少 3 个字符' }, 400);
    }
    const dup = await getUser(newUsername);
    if (dup) {
      return c.json<ApiResponse>({ success: false, error: '用户名已存在' }, 409);
    }
    await renameUser(user.username, newUsername);
  }

  // 密码修改
  if (body.password) {
    if (body.password.length < 6) {
      return c.json<ApiResponse>({ success: false, error: '密码至少 6 个字符' }, 400);
    }
    const hash = await hashPassword(body.password);
    await updateUserPassword(body.username?.trim() || user.username, hash);
  }

  const updateData: any = { updatedAt: new Date().toISOString() };
  if (body.role !== undefined) updateData.role = body.role;
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

// 获取用户已分配的服务器（管理员）
adminUserRoutes.get('/users/:id/servers', (c) => {
  const id = parseInt(c.req.param('id'));
  return c.json<ApiResponse>({ success: true, data: getAllowedServerIds(id) });
});

// 设置用户可用的服务器（管理员）
adminUserRoutes.put('/users/:id/servers', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<{ serverIds: number[] }>();

  const user = db.query.users.findFirst({ where: eq(users.id, id) }).sync();
  if (!user) {
    return c.json<ApiResponse>({ success: false, error: '用户不存在' }, 404);
  }

  const serverIds = Array.isArray(body.serverIds) ? body.serverIds.map(Number).filter(n => !isNaN(n)) : [];
  setAllowedServers(id, serverIds);

  return c.json<ApiResponse>({ success: true, data: serverIds });
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
  setAllowedServers(id, []);

  return c.json<ApiResponse>({ success: true });
});
