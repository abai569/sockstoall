/**
 * 流量采集与配额执行
 * 参照 flox：增量采集 -> 节点/用户累加 -> 超额/到期停用 -> 归零
 */

import { execFileSync } from 'child_process';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { getNodeById, getNodes, addNodeTraffic, suspendUserNodes, resumeUserNodes, resetUserNodesTraffic } from '../node/node-store.js';
import { getRoutes } from '../route/route-store.js';
import { xrayService } from '../xray/service.js';

const BYTES_PER_GB = 1024 * 1024 * 1024;
const API_PORT = parseInt(process.env.XRAY_API_PORT || '10085');
const COLLECT_INTERVAL_MS = 60 * 1000;

export interface TrafficItem {
  n: string; // node id (inbound tag)
  u: number; // uplink bytes delta
  d: number; // downlink bytes delta
}

function reloadLocalXray(): void {
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
  } catch (error) {
    console.error('[Traffic] reload local xray failed:', error);
  }
}

/**
 * 应用一批流量增量：累加到节点与用户，并执行配额检查
 * @returns 是否因配额导致本地节点启停变化（需要重载）
 */
export function applyTrafficItems(items: TrafficItem[]): boolean {
  const userIds = new Set<number>();

  for (const item of items) {
    const node = getNodeById(item.n);
    if (!node) continue;
    const up = Math.max(0, Math.floor(item.u || 0));
    const down = Math.max(0, Math.floor(item.d || 0));
    if (up === 0 && down === 0) continue;

    addNodeTraffic(node.id, up, down);

    const userId = node.userId ?? 1;
    db.run(sql`UPDATE users SET used_flow_gb = used_flow_gb + ${(up + down) / BYTES_PER_GB} WHERE id = ${userId}`);
    userIds.add(userId);
  }

  let reloadNeeded = false;
  for (const userId of userIds) {
    if (enforceUserQuota(userId)) reloadNeeded = true;
  }
  return reloadNeeded;
}

/**
 * 检查用户配额/到期，必要时停用或恢复其节点
 * @returns 是否发生启停变化
 */
export function enforceUserQuota(userId: number): boolean {
  const user = db.query.users.findFirst({ where: eq(users.id, userId) }).sync();
  if (!user) return false;

  const limit = user.trafficLimitGb || 0;
  const used = user.usedFlowGb || 0;
  const expired = (user.expiredAt || 0) > 0 && (user.expiredAt || 0) < Date.now();
  const overQuota = limit > 0 && used >= limit;
  const shouldSuspend = overQuota || expired;
  const isSuspended = user.trafficSuspended === 1;

  if (shouldSuspend && !isSuspended) {
    const count = suspendUserNodes(userId);
    db.update(users).set({ trafficSuspended: 1, updatedAt: new Date().toISOString() }).where(eq(users.id, userId)).run();
    console.log(`[Traffic] suspend user ${userId} (overQuota=${overQuota} expired=${expired}) nodes=${count}`);
    return count > 0;
  }

  if (!shouldSuspend && isSuspended) {
    const count = resumeUserNodes(userId);
    db.update(users).set({ trafficSuspended: 0, updatedAt: new Date().toISOString() }).where(eq(users.id, userId)).run();
    console.log(`[Traffic] resume user ${userId} nodes=${count}`);
    return count > 0;
  }

  return false;
}

function parseStats(raw: string): Array<{ name: string; value: number }> {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return [];
  try {
    const json = JSON.parse(raw.slice(start, end + 1));
    const list = json.stat || json.stats || [];
    return list.map((s: any) => ({ name: String(s.name), value: Number(s.value) || 0 }));
  } catch {
    return [];
  }
}

/**
 * 采集本机 Xray 流量增量
 */
export function collectLocalTraffic(): void {
  const xrayPath = xrayService.getXrayPath();
  if (!xrayPath) return;

  let raw = '';
  try {
    raw = execFileSync(
      xrayPath,
      ['api', 'statsquery', `--server=127.0.0.1:${API_PORT}`, '-reset'],
      { encoding: 'utf-8', timeout: 10000 }
    );
  } catch {
    return; // Xray 未运行或未开启 stats
  }

  const stats = parseStats(raw);
  if (stats.length === 0) return;

  const map = new Map<string, { u: number; d: number }>();
  for (const s of stats) {
    const m = s.name.match(/^inbound>>>(.+)>>>traffic>>>(uplink|downlink)$/);
    if (!m) continue;
    const tag = m[1];
    const entry = map.get(tag) || { u: 0, d: 0 };
    if (m[2] === 'uplink') entry.u += s.value;
    else entry.d += s.value;
    map.set(tag, entry);
  }

  const items: TrafficItem[] = [];
  for (const [n, v] of map.entries()) items.push({ n, u: v.u, d: v.d });
  if (items.length === 0) return;

  const reload = applyTrafficItems(items);
  if (reload) reloadLocalXray();
}

/**
 * 月度流量归零任务
 */
export function runTrafficResetJob(): void {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const currentMonthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;

  const allUsers = db.query.users.findMany().sync();
  for (const user of allUsers) {
    const resetDay = user.flowResetTime || 0;
    if (resetDay <= 0) continue;
    if (dayOfMonth !== resetDay) continue;

    const last = user.flowLastResetAt || 0;
    const lastMonthKey = last ? (() => { const d = new Date(last); return `${d.getFullYear()}-${d.getMonth() + 1}`; })() : '';
    if (lastMonthKey === currentMonthKey) continue;

    resetUserNodesTraffic(user.id);
    db.update(users)
      .set({ usedFlowGb: 0, flowLastResetAt: now.getTime(), updatedAt: now.toISOString() })
      .where(eq(users.id, user.id))
      .run();
    console.log(`[Traffic] reset monthly flow for user ${user.id}`);

    // 归零后如因超额暂停，尝试恢复
    enforceUserQuota(user.id);
  }

  reloadLocalXray();
}

export function startTrafficCollector(): void {
  setInterval(() => {
    try {
      collectLocalTraffic();
    } catch (error) {
      console.error('[Traffic] collect error:', error);
    }
  }, COLLECT_INTERVAL_MS);
  console.log('Traffic collector started');
}
