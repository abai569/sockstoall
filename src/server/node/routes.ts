/**
 * 节点路由
 */

import { Hono } from 'hono';
import type { Node, CreateNodeRequest, ApiResponse, ListResponse } from '../../shared/types.js';
import { getNodes, getNodeById, createNode, updateNode, deleteNode, setNodeEnabled, countNodesByUser } from './node-store.js';
import { generateShareLink } from './link-generator.js';
import { testNodeLatency } from './latency-tester.js';
import { xrayService } from '../xray/service.js';
import { getRoutes } from '../route/route-store.js';
import { getUserById } from '../auth/user-store.js';
import { getAllowedServerIds } from '../server/user-server-store.js';
import { resolveNodeShareHost } from './share-host.js';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export const nodeRoutes = new Hono();

const ROOT_DIR = process.cwd();
const BIN_DIR = join(ROOT_DIR, 'bin');

// 调用 xray x25519 生成密钥对
function generateX25519KeyPair(): { privateKey: string; publicKey: string } | null {
  try {
    let xrayPath = xrayService.getXrayPath();
    if (!xrayPath) {
      const isWindows = process.platform === 'win32';
      xrayPath = join(BIN_DIR, isWindows ? 'xray.exe' : 'xray');
    }
    if (!xrayPath || !existsSync(xrayPath)) {
      console.error(`Xray binary not found at: ${xrayPath || 'unknown'}, cwd: ${process.cwd()}`);
      return null;
    }
    console.log(`Generating x25519 keys using: ${xrayPath}`);
    const output = execSync(`"${xrayPath}" x25519`, {
      encoding: 'utf-8',
      cwd: ROOT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // xray 旧版输出: Private key: xxx\nPublic key: xxx
    // xray 26.x 输出: PrivateKey: xxx\nPassword (PublicKey): xxx
    const lines = output.split('\n');
    const privateKeyLine = lines.find(l => l.startsWith('PrivateKey:')) || lines.find(l => l.startsWith('Private key:'));
    const publicKeyLine = lines.find(l => l.includes('PublicKey')) || lines.find(l => l.startsWith('Public key:'));
    const privateKey = privateKeyLine?.split(':').slice(1).join(':').trim() || '';
    const publicKey = publicKeyLine?.split(':').slice(1).join(':').trim() || '';
    if (privateKey && publicKey) {
      return { privateKey, publicKey };
    }
    console.error('Failed to parse x25519 output:', output);
  } catch (error: any) {
    console.error('Failed to generate x25519 keys:', error.message);
    if (error.stderr) console.error('xray stderr:', error.stderr.toString());
    if (error.stdout) console.error('xray stdout:', error.stdout.toString());
  }
  return null;
}

// 生成随机 Short ID
function generateShortId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

// 自动填充 Reality 配置
function fillRealityConfig(config: any): void {
  if (config.tls !== 'reality') return;
  if (!config.realitySettings) config.realitySettings = {};
  
  // 默认目标地址
  if (!config.realitySettings.dest) {
    config.realitySettings.dest = 'tesla.com:443';
  }
  // 默认 Server Names
  if (!config.realitySettings.serverNames) {
    config.realitySettings.serverNames = ['tesla.com'];
  }
  // 生成密钥对
  if (!config.realitySettings.privateKey) {
    const keys = generateX25519KeyPair();
    if (keys) {
      config.realitySettings.privateKey = keys.privateKey;
      config.realitySettings.publicKey = keys.publicKey;
    }
  }
  // 生成 Short ID
  if (!config.realitySettings.shortId) {
    config.realitySettings.shortId = generateShortId();
  }
  // 默认 spiderX
  if (!config.realitySettings.spiderX) {
    config.realitySettings.spiderX = '/';
  }
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

// 当前用户是否有权操作该节点
function canAccessNode(c: any, node: Node): boolean {
  if (c.get('role') === 'admin') return true;
  return (node.userId ?? 1) === c.get('userId');
}

// 获取节点列表（管理员看全部，普通用户看自己的；可按服务器过滤）
nodeRoutes.get('/', (c) => {
  const serverIdParam = c.req.query('serverId');
  const isAdmin = (c as any).get('role') === 'admin';
  const userId = (c as any).get('userId');
  let nodes = getNodes();
  if (!isAdmin) {
    nodes = nodes.filter(n => (n.userId ?? 1) === userId);
  }
  if (serverIdParam) {
    const serverId = parseInt(serverIdParam);
    nodes = nodes.filter(n => (n.serverId ?? 1) === serverId);
  }
  const nodesWithLinks = nodes.map(node => {
    const host = resolveNodeShareHost(node);
    return {
      ...node,
      listen: host,
      shareLink: generateShareLink({ ...node, listen: host }),
    };
  });
  const response: ListResponse<any> = { items: nodesWithLinks, total: nodesWithLinks.length };
  return c.json<ApiResponse<ListResponse<any>>>({ success: true, data: response });
});

// 获取单个节点
nodeRoutes.get('/:id', (c) => {
  const id = c.req.param('id');
  const node = getNodeById(id);
  
  if (!node) {
    return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
  }
  
  const host = resolveNodeShareHost(node);
  return c.json<ApiResponse<any>>({
    success: true,
    data: { ...node, listen: host, shareLink: generateShareLink({ ...node, listen: host }) }
  });
});

// 创建节点（自动重载 Xray）
nodeRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json<CreateNodeRequest>();
    
    if (!body.name || !body.protocol) {
      return c.json<ApiResponse>({ success: false, error: '缺少必要字段' }, 400);
    }
    
    if (body.port && (body.port < 1 || body.port > 65535)) {
      return c.json<ApiResponse>({ success: false, error: '端口范围 1-65535' }, 400);
    }
    
    // 自动填充 Reality 配置
    if (body.config) {
      fillRealityConfig(body.config);
    }
    
    const config = body.config as any;
    if (config?.tls === 'reality' && (!config.realitySettings?.privateKey || !config.realitySettings?.publicKey)) {
      return c.json<ApiResponse>({ success: false, error: 'Reality 密钥生成失败，请确认 Xray 已安装' }, 400);
    }

    const role = (c as any).get('role');
    const userId = (c as any).get('userId');

    if (role !== 'admin') {
      const targetServerId = body.serverId ?? 1;
      const allowed = getAllowedServerIds(userId);
      if (!allowed.includes(targetServerId)) {
        return c.json<ApiResponse>({ success: false, error: '你没有该服务器的使用权限' }, 403);
      }
      const user = await getUserById(userId);
      const limit = user?.maxNodes ?? 0;
      if (limit > 0 && countNodesByUser(userId) >= limit) {
        return c.json<ApiResponse>({ success: false, error: `节点数量已达上限（${limit}）` }, 400);
      }
    }

    const node = createNode({ ...body, serverId: body.serverId ?? 1, userId });
    reloadXray();
    
    return c.json<ApiResponse<any>>({ 
      success: true, 
      data: { ...node, listen: resolveNodeShareHost(node), shareLink: generateShareLink({ ...node, listen: resolveNodeShareHost(node) }) }
    }, 201);
  } catch (error) {
    console.error('Create node error:', error);
    return c.json<ApiResponse>({ success: false, error: '创建节点失败' }, 500);
  }
});

// 更新节点（自动重载 Xray）
nodeRoutes.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = getNodeById(id);
    if (!existing) {
      return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
    }
    if (!canAccessNode(c, existing)) {
      return c.json<ApiResponse>({ success: false, error: '无权操作该节点' }, 403);
    }
    const body = await c.req.json<Partial<CreateNodeRequest>>();
    
    // 自动填充 Reality 配置
    if (body.config) {
      fillRealityConfig(body.config);
    }
    
    const config = body.config as any;
    if (config?.tls === 'reality' && (!config.realitySettings?.privateKey || !config.realitySettings?.publicKey)) {
      return c.json<ApiResponse>({ success: false, error: 'Reality 密钥生成失败，请确认 Xray 已安装' }, 400);
    }

    const node = updateNode(id, body);
    if (!node) {
      return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
    }
    
    reloadXray();
    
    return c.json<ApiResponse<any>>({ 
      success: true, 
      data: { ...node, listen: resolveNodeShareHost(node), shareLink: generateShareLink({ ...node, listen: resolveNodeShareHost(node) }) }
    });
  } catch (error) {
    console.error('Update node error:', error);
    return c.json<ApiResponse>({ success: false, error: '更新节点失败' }, 500);
  }
});

// 删除节点（自动重载 Xray）
nodeRoutes.delete('/:id', (c) => {
  const id = c.req.param('id');
  const existing = getNodeById(id);
  if (!existing) {
    return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
  }
  if (!canAccessNode(c, existing)) {
    return c.json<ApiResponse>({ success: false, error: '无权操作该节点' }, 403);
  }

  deleteNode(id);
  reloadXray();
  return c.json<ApiResponse>({ success: true });
});

// 启用/禁用节点（自动重载 Xray）
nodeRoutes.patch('/:id/toggle', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = getNodeById(id);
    if (!existing) {
      return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
    }
    if (!canAccessNode(c, existing)) {
      return c.json<ApiResponse>({ success: false, error: '无权操作该节点' }, 403);
    }
    const { enabled } = await c.req.json<{ enabled: boolean }>();
    
    const node = setNodeEnabled(id, enabled);
    if (!node) {
      return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
    }
    
    reloadXray();
    return c.json<ApiResponse<any>>({ success: true, data: { ...node, listen: resolveNodeShareHost(node), shareLink: generateShareLink({ ...node, listen: resolveNodeShareHost(node) }) } });
  } catch (error) {
    console.error('Toggle node error:', error);
    return c.json<ApiResponse>({ success: false, error: '操作失败' }, 500);
  }
});

// 测试节点延迟
nodeRoutes.post('/:id/test-latency', async (c) => {
  try {
    const id = c.req.param('id');
    const node = getNodeById(id);
    
    if (!node) {
      return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
    }
    if (!canAccessNode(c, node)) {
      return c.json<ApiResponse>({ success: false, error: '无权操作该节点' }, 403);
    }
    
    const result = await testNodeLatency(node);
    return c.json<ApiResponse<any>>({ success: true, data: result });
  } catch (error) {
    console.error('Test latency error:', error);
    return c.json<ApiResponse>({ success: false, error: '测试失败' }, 500);
  }
});
