import { Hono } from 'hono';
import { db } from '../db/index.js';
import { servers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';
import type { ApiResponse } from '../../shared/types.js';
import { getNodes, getNodeById } from '../node/node-store.js';
import { getRoutes } from '../route/route-store.js';
import { buildXrayConfig } from '../xray/config-builder.js';

export const agentRoutes = new Hono();

function findServerByToken(token: string) {
  if (!token) return null;
  return db.query.servers.findFirst({
    where: eq(servers.agentToken, token),
  }).sync() || null;
}

// Agent 心跳上报
agentRoutes.post('/heartbeat', async (c) => {
  const body = await c.req.json<{
    token: string;
    xrayVersion?: string;
    os?: string;
    arch?: string;
  }>();

  const server = findServerByToken(body.token);
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

// Agent 拉取本服务器的 Xray 配置
agentRoutes.post('/config', async (c) => {
  const body = await c.req.json<{ token: string }>();

  const server = findServerByToken(body.token);
  if (!server) {
    return c.json<ApiResponse>({ success: false, error: '无效的 token' }, 401);
  }

  const nodes = getNodes().filter(n => n.enabled && (n.serverId ?? 1) === server.id);
  const routes = getRoutes().filter(r => r.enabled);
  const routeDetails = routes
    .map(r => {
      const node = getNodeById(r.nodeId);
      return node && (node.serverId ?? 1) === server.id ? { routeId: r.id, node, outbound: r.outbound } : null;
    })
    .filter(Boolean) as any[];

  const config = buildXrayConfig(nodes, routeDetails);
  const version = createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 16);

  return c.json<ApiResponse>({ success: true, data: { version, config } });
});
