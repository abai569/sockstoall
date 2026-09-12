/**
 * 节点分享地址解析
 * 优先级：节点 shareHost > 服务器 address > 公网 IPv4 > 公网 IPv6
 */

import { db } from '../db/index.js';
import { servers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { Node } from '../../shared/types.js';
import { getPublicIPv4, getPublicIPv6 } from '../net/public-ip.js';

export function getServerById(id: number) {
  return db.query.servers.findFirst({
    where: eq(servers.id, id),
  }).sync();
}

export function resolveNodeShareHost(node: Node): string {
  const override = node.shareHost?.trim();
  if (override) return override;

  const server = getServerById(node.serverId ?? 1);
  const addr = server?.address?.trim();
  if (addr && addr !== 'localhost' && addr !== '127.0.0.1' && addr !== '::1') {
    return addr;
  }

  return getPublicIPv4() || getPublicIPv6() || '127.0.0.1';
}
