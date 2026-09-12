import { Hono } from 'hono';
import { db } from '../db/index.js';
import { servers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import type { ApiResponse } from '../../shared/types.js';
import { getNodes } from '../node/node-store.js';
import { getAllowedServerIds, countUsersForServer, getUserIdsForServer, setServerUsers } from './user-server-store.js';
import { getPublicIPv4 } from '../net/public-ip.js';

export const serverRoutes = new Hono();

const ONLINE_TIMEOUT_MS = 90 * 1000;

function requireAdmin(c: any): boolean {
  return c.get('role') === 'admin';
}

function isOnline(server: any): boolean {
  if (server.isLocal === 1) return true;
  if (!server.lastHeartbeat) return false;
  return Date.now() - server.lastHeartbeat < ONLINE_TIMEOUT_MS;
}

function getPanelBaseUrl(c: any): string {
  const host = c.req.header('host') || 'localhost:3456';
  const proto = c.req.header('x-forwarded-proto') || 'http';
  return `${proto}://${host}`;
}

function buildInstallCommand(baseUrl: string, token: string): string {
  return `curl -fsSL "${baseUrl}/api/agent/install.sh?token=${token}" | bash`;
}

function buildUninstallCommand(baseUrl: string, token: string): string {
  return `curl -fsSL "${baseUrl}/api/agent/install.sh?token=${token}" | bash -s -- uninstall`;
}

// 获取服务器列表（管理员看全部，普通用户只看被分配的）
serverRoutes.get('/servers', (c) => {
  const isAdmin = (c as any).get('role') === 'admin';
  const userId = (c as any).get('userId');
  let list = db.query.servers.findMany({
    orderBy: [servers.id],
  }).sync();

  if (!isAdmin) {
    const allowed = getAllowedServerIds(userId);
    list = list.filter(s => allowed.includes(s.id));
  }

  // 本机地址为空时自动探测公网 IPv4
  const localServer = list.find(s => s.isLocal === 1);
  if (localServer && (!localServer.address || localServer.address === 'localhost')) {
    const ip = getPublicIPv4();
    if (ip) {
      db.update(servers).set({ address: ip, updatedAt: new Date().toISOString() }).where(eq(servers.id, localServer.id)).run();
      localServer.address = ip;
    }
  }

  const nodes = getNodes();
  const baseUrl = getPanelBaseUrl(c);

  const data = list.map(server => ({
    id: server.id,
    name: server.name,
    address: server.address,
    agentToken: server.agentToken,
    status: isOnline(server) ? 'online' : 'offline',
    isLocal: server.isLocal === 1,
    lastHeartbeat: server.lastHeartbeat,
    xrayVersion: server.xrayVersion,
    os: server.os,
    arch: server.arch,
    nodeCount: nodes.filter(n => (n.serverId ?? 1) === server.id).length,
    assignedUserCount: countUsersForServer(server.id),
    installCommand: server.isLocal === 1 ? null : buildInstallCommand(baseUrl, server.agentToken),
    uninstallCommand: server.isLocal === 1 ? null : buildUninstallCommand(baseUrl, server.agentToken),
    createdAt: server.createdAt,
  }));

  return c.json<ApiResponse>({ success: true, data });
});

// 创建服务器（管理员）
serverRoutes.post('/servers', async (c) => {
  if (!requireAdmin(c)) {
    return c.json<ApiResponse>({ success: false, error: '需要管理员权限' }, 403);
  }
  const body = await c.req.json<{ name: string; address: string }>();

  if (!body.name || !body.address) {
    return c.json<ApiResponse>({ success: false, error: '名称和地址不能为空' }, 400);
  }

  const agentToken = randomBytes(24).toString('hex');
  const now = new Date().toISOString();

  const result = db.insert(servers).values({
    name: body.name,
    address: body.address,
    agentToken,
    status: 'offline',
    isLocal: 0,
    createdAt: now,
    updatedAt: now,
  }).run();

  const baseUrl = getPanelBaseUrl(c);
  return c.json<ApiResponse>({
    success: true,
    data: {
      id: result.lastInsertRowid,
      agentToken,
      installCommand: buildInstallCommand(baseUrl, agentToken),
    },
  });
});

// 编辑服务器（管理员）
serverRoutes.put('/servers/:id', async (c) => {
  if (!requireAdmin(c)) {
    return c.json<ApiResponse>({ success: false, error: '需要管理员权限' }, 403);
  }
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<{ name?: string; address?: string }>();

  const server = db.query.servers.findFirst({
    where: eq(servers.id, id),
  }).sync();

  if (!server) {
    return c.json<ApiResponse>({ success: false, error: '服务器不存在' }, 404);
  }

  const updateData: any = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined && body.name.trim()) updateData.name = body.name.trim();
  if (body.address !== undefined && body.address.trim()) updateData.address = body.address.trim();

  db.update(servers).set(updateData).where(eq(servers.id, id)).run();

  return c.json<ApiResponse>({ success: true });
});

// 获取服务器已分配的用户（管理员）
serverRoutes.get('/servers/:id/users', (c) => {
  if (!requireAdmin(c)) {
    return c.json<ApiResponse>({ success: false, error: '需要管理员权限' }, 403);
  }
  const id = parseInt(c.req.param('id'));
  return c.json<ApiResponse>({ success: true, data: getUserIdsForServer(id) });
});

// 设置服务器分配的用户（管理员）
serverRoutes.put('/servers/:id/users', async (c) => {
  if (!requireAdmin(c)) {
    return c.json<ApiResponse>({ success: false, error: '需要管理员权限' }, 403);
  }
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<{ userIds: number[] }>();

  const server = db.query.servers.findFirst({ where: eq(servers.id, id) }).sync();
  if (!server) {
    return c.json<ApiResponse>({ success: false, error: '服务器不存在' }, 404);
  }

  const userIds = Array.isArray(body.userIds) ? body.userIds.map(Number).filter(n => !isNaN(n)) : [];
  setServerUsers(id, userIds);
  return c.json<ApiResponse>({ success: true, data: userIds });
});

// 轮换 Agent Token（管理员）
serverRoutes.post('/servers/:id/rotate-token', (c) => {
  if (!requireAdmin(c)) {
    return c.json<ApiResponse>({ success: false, error: '需要管理员权限' }, 403);
  }
  const id = parseInt(c.req.param('id'));

  const server = db.query.servers.findFirst({
    where: eq(servers.id, id),
  }).sync();

  if (!server) {
    return c.json<ApiResponse>({ success: false, error: '服务器不存在' }, 404);
  }
  if (server.isLocal === 1) {
    return c.json<ApiResponse>({ success: false, error: '本机服务器无需 Token' }, 400);
  }

  const agentToken = randomBytes(24).toString('hex');
  db.update(servers)
    .set({ agentToken, updatedAt: new Date().toISOString() })
    .where(eq(servers.id, id))
    .run();

  const baseUrl = getPanelBaseUrl(c);
  return c.json<ApiResponse>({
    success: true,
    data: { agentToken, installCommand: buildInstallCommand(baseUrl, agentToken) },
  });
});

// 删除服务器（管理员）
serverRoutes.delete('/servers/:id', (c) => {
  if (!requireAdmin(c)) {
    return c.json<ApiResponse>({ success: false, error: '需要管理员权限' }, 403);
  }
  const id = parseInt(c.req.param('id'));

  const server = db.query.servers.findFirst({
    where: eq(servers.id, id),
  }).sync();

  if (!server) {
    return c.json<ApiResponse>({ success: false, error: '服务器不存在' }, 404);
  }
  if (server.isLocal === 1) {
    return c.json<ApiResponse>({ success: false, error: '不能删除本机服务器' }, 400);
  }

  const nodeCount = getNodes().filter(n => (n.serverId ?? 1) === id).length;
  if (nodeCount > 0) {
    return c.json<ApiResponse>({ success: false, error: `该服务器下还有 ${nodeCount} 个节点，请先删除节点` }, 400);
  }

  db.delete(servers).where(eq(servers.id, id)).run();

  return c.json<ApiResponse>({ success: true });
});
