/**
 * 分享链接解析器
 * 支持 ss:// vmess:// vless://
 */

import type { CreateNodeRequest, SSNode, VMessNode, VLESSNode } from '../../shared/types.js';

interface ParsedLink {
  protocol: 'shadowsocks' | 'vmess' | 'vless';
  config: CreateNodeRequest;
}

/**
 * 解析 ss:// 链接
 * 格式1: ss://method:password@host:port#name
 * 格式2: ss://base64(method:password)@host:port#name (SIP008)
 * 格式3: ss://base64(method:password@host:port)#name (旧格式)
 */
function parseSSLink(url: string): ParsedLink | null {
  try {
    const urlObj = new URL(url);
    const name = decodeURIComponent(urlObj.hash.slice(1)) || 'SS Node';
    const host = urlObj.hostname;
    const port = parseInt(urlObj.port);
    
    // 格式1: method:password 直接在 userinfo
    let method: string, password: string;
    
    if (urlObj.username) {
      // SIP008 或旧格式
      method = decodeURIComponent(urlObj.username);
      password = decodeURIComponent(urlObj.password || '');
    } else {
      // base64 编码
      const base64Part = urlObj.pathname.replace('//', '').split('@')[0];
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
      const [m, p] = decoded.split(':');
      method = m;
      password = p;
    }
    
    return {
      protocol: 'shadowsocks',
      config: {
        name,
        protocol: 'shadowsocks',
        port,
        listen: host,
        config: {
          password,
          encryption: method as SSNode['config']['encryption'],
        },
      } as CreateNodeRequest,
    };
  } catch (error) {
    console.error('Parse SS link error:', error);
    return null;
  }
}

/**
 * 解析 vmess:// 链接
 * 格式: vmess://base64(json)
 * JSON: {v, ps, add, port, id, aid, net, type, host, path, tls, ...}
 */
function parseVMessLink(url: string): ParsedLink | null {
  try {
    const base64Part = url.replace('vmess://', '');
    const jsonStr = Buffer.from(base64Part, 'base64').toString('utf-8');
    const config = JSON.parse(jsonStr);
    
    const name = config.ps || 'VMess Node';
    const host = config.add;
    const port = parseInt(config.port);
    const uuid = config.id;
    const alterId = parseInt(config.aid) || 0;
    const net = config.net || 'tcp';
    const tls = config.tls === 'tls' ? 'tls' : 'none';
    
    const result: CreateNodeRequest = {
      name,
      protocol: 'vmess',
      port,
      listen: host,
      config: {
        uuid,
        alterId,
        encryption: 'auto',
        transport: net as VMessNode['config']['transport'],
        tls: tls as VMessNode['config']['tls'],
      },
    };
    
    // WebSocket 配置
    if (net === 'ws') {
      (result.config as VMessNode['config']).wsSettings = {
        path: config.path || '/',
        host: config.host || undefined,
      };
    }
    
    // TLS 配置
    if (tls === 'tls') {
      (result.config as VMessNode['config']).tlsSettings = {
        serverName: config.sni || config.host || undefined,
      };
    }
    
    return { protocol: 'vmess', config: result };
  } catch (error) {
    console.error('Parse VMess link error:', error);
    return null;
  }
}

/**
 * 解析 vless:// 链接
 * 格式: vless://uuid@host:port?params#name
 * params: security, type, flow, sni, fp, sid, pbk, path, host, serviceName...
 */
function parseVLESSLink(url: string): ParsedLink | null {
  try {
    const urlObj = new URL(url);
    const uuid = urlObj.username;
    const host = urlObj.hostname;
    const port = parseInt(urlObj.port);
    const name = decodeURIComponent(urlObj.hash.slice(1)) || 'VLESS Node';
    
    const security = urlObj.searchParams.get('security') || 'none';
    const type = urlObj.searchParams.get('type') || 'tcp';
    const flow = urlObj.searchParams.get('flow') || 'none';
    
    const result: CreateNodeRequest = {
      name,
      protocol: 'vless',
      port,
      listen: host,
      config: {
        uuid,
        flow: flow as VLESSNode['config']['flow'],
        transport: type as VLESSNode['config']['transport'],
        tls: security as VLESSNode['config']['tls'],
      },
    };
    
    const config = result.config as VLESSNode['config'];
    
    // Reality 配置
    if (security === 'reality') {
      config.realitySettings = {
        dest: urlObj.searchParams.get('sni') || '',
        serverNames: [urlObj.searchParams.get('sni') || ''],
        privateKey: '', // 分享链接不含私钥，需手动填写
        shortId: urlObj.searchParams.get('sid') || '',
        spiderX: urlObj.searchParams.get('spx') || '/',
      };
    }
    
    // TLS 配置
    if (security === 'tls') {
      const sniParam = urlObj.searchParams.get('sni');
      const alpnParam = urlObj.searchParams.get('alpn');
      config.tlsSettings = {
        serverName: sniParam ?? undefined,
        alpn: alpnParam?.split(','),
      };
    }
    
    // WebSocket 配置
    if (type === 'ws') {
      const hostParam = urlObj.searchParams.get('host');
      config.wsSettings = {
        path: urlObj.searchParams.get('path') || '/',
        host: hostParam ?? undefined,
      };
    }
    
    // gRPC 配置
    if (type === 'grpc') {
      config.grpcSettings = {
        serviceName: urlObj.searchParams.get('serviceName') || '',
      };
    }
    
    return { protocol: 'vless', config: result };
  } catch (error) {
    console.error('Parse VLESS link error:', error);
    return null;
  }
}

/**
 * 解析分享链接
 */
export function parseShareLink(link: string): ParsedLink | null {
  const trimmed = link.trim();
  
  if (trimmed.startsWith('ss://')) {
    return parseSSLink(trimmed);
  }
  
  if (trimmed.startsWith('vmess://')) {
    return parseVMessLink(trimmed);
  }
  
  if (trimmed.startsWith('vless://')) {
    return parseVLESSLink(trimmed);
  }
  
  return null;
}
