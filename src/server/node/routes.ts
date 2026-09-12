/**
 * 节点路由
 */

import { Hono } from 'hono';
import type { Node, CreateNodeRequest, ApiResponse, ListResponse } from '../../shared/types.js';
import { getNodes, getNodeById, createNode, updateNode, deleteNode, setNodeEnabled } from './node-store.js';
import { generateShareLink } from './link-generator.js';
import { testNodeLatency } from './latency-tester.js';
import { xrayService } from '../xray/service.js';
import { getRoutes } from '../route/route-store.js';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

let cachedPublicIp: string | null = null;

function getPublicIPv4(): string {
  if (cachedPublicIp) return cachedPublicIp;
  const urls = [
    'https://api4.ipify.org',
    'https://ipv4.icanhazip.com',
    'https://v4.ident.me',
  ];
  for (const url of urls) {
    try {
      const ip = execSync(`curl -fsSL --max-time 3 "${url}" 2>/dev/null || wget -qO- --timeout=3 "${url}" 2>/dev/null`, { timeout: 5000, encoding: 'utf-8' }).trim();
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
        cachedPublicIp = ip;
        return ip;
      }
    } catch { /* ignore */ }
  }
  return '127.0.0.1';
}

function resolveListenAddress(listen?: string): string {
  if (!listen || listen === '0.0.0.0' || listen === '::') {
    return getPublicIPv4();
  }
  return listen;
}

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

// 获取所有节点（可按服务器过滤）
nodeRoutes.get('/', (c) => {
  const serverIdParam = c.req.query('serverId');
  let nodes = getNodes();
  if (serverIdParam) {
    const serverId = parseInt(serverIdParam);
    nodes = nodes.filter(n => (n.serverId ?? 1) === serverId);
  }
  const nodesWithLinks = nodes.map(node => ({
    ...node,
    listen: resolveListenAddress(node.listen),
    shareLink: generateShareLink(node)
  }));
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
  
  return c.json<ApiResponse<any>>({ 
    success: true, 
    data: { ...node, listen: resolveListenAddress(node.listen), shareLink: generateShareLink(node) } 
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

    const node = createNode({ ...body, serverId: body.serverId ?? 1 });
    reloadXray();
    
    return c.json<ApiResponse<any>>({ 
      success: true, 
      data: { ...node, shareLink: generateShareLink(node) }
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
      data: { ...node, shareLink: generateShareLink(node) }
    });
  } catch (error) {
    console.error('Update node error:', error);
    return c.json<ApiResponse>({ success: false, error: '更新节点失败' }, 500);
  }
});

// 删除节点（自动重载 Xray）
nodeRoutes.delete('/:id', (c) => {
  const id = c.req.param('id');
  const success = deleteNode(id);
  
  if (!success) {
    return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
  }
  
  reloadXray();
  return c.json<ApiResponse>({ success: true });
});

// 启用/禁用节点（自动重载 Xray）
nodeRoutes.patch('/:id/toggle', async (c) => {
  try {
    const id = c.req.param('id');
    const { enabled } = await c.req.json<{ enabled: boolean }>();
    
    const node = setNodeEnabled(id, enabled);
    if (!node) {
      return c.json<ApiResponse>({ success: false, error: '节点不存在' }, 404);
    }
    
    reloadXray();
    return c.json<ApiResponse<any>>({ success: true, data: { ...node, shareLink: generateShareLink(node) } });
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
    
    const result = await testNodeLatency(node);
    return c.json<ApiResponse<any>>({ success: true, data: result });
  } catch (error) {
    console.error('Test latency error:', error);
    return c.json<ApiResponse>({ success: false, error: '测试失败' }, 500);
  }
});
