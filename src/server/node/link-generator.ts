/**
 * 分享链接生成器
 */

import type { Node } from '../../shared/types.js';

/**
 * 生成 Shadowsocks 分享链接
 * 格式: ss://base64(method:password)@host:port#name
 */
export function generateSSLink(node: Node): string {
  if (node.protocol !== 'shadowsocks') return '';
  
  const method = node.config.encryption;
  const password = node.config.password;
  const host = node.listen || '127.0.0.1';
  const port = node.port;
  const name = encodeURIComponent(node.name);
  
  // SIP002 格式
  const userinfo = Buffer.from(`${method}:${password}`).toString('base64');
  
  return `ss://${userinfo}@${host}:${port}#${name}`;
}

/**
 * 生成 VMess 分享链接
 * 格式: vmess://base64(json)
 */
export function generateVMessLink(node: Node): string {
  if (node.protocol !== 'vmess') return '';
  
  const host = node.listen || '127.0.0.1';
  const config = {
    v: '2',
    ps: node.name,
    add: host,
    port: node.port.toString(),
    id: node.config.uuid,
    aid: node.config.alterId.toString(),
    scy: node.config.encryption,
    net: node.config.transport,
    type: 'none',
    host: node.config.wsSettings?.host || '',
    path: node.config.wsSettings?.path || '',
    tls: node.config.tls === 'tls' ? 'tls' : '',
    sni: node.config.tlsSettings?.serverName || '',
  };
  
  const jsonStr = JSON.stringify(config);
  const base64 = Buffer.from(jsonStr).toString('base64');
  
  return `vmess://${base64}`;
}

/**
 * 生成 VLESS 分享链接
 * 格式: vless://uuid@host:port?params#name
 */
export function generateVLESSLink(node: Node): string {
  if (node.protocol !== 'vless') return '';
  
  const host = node.listen || '127.0.0.1';
  const uuid = node.config.uuid;
  const port = node.port;
  const name = encodeURIComponent(node.name);
  
  const params = new URLSearchParams();
  params.set('type', node.config.transport);
  
  if (node.config.flow && node.config.flow !== 'none') {
    params.set('flow', node.config.flow);
  }
  
  // TLS 配置
  if (node.config.tls === 'tls') {
    params.set('security', 'tls');
    if (node.config.tlsSettings?.serverName) {
      params.set('sni', node.config.tlsSettings.serverName);
    }
    if (node.config.tlsSettings?.alpn) {
      params.set('alpn', node.config.tlsSettings.alpn.join(','));
    }
  } else if (node.config.tls === 'reality') {
    params.set('security', 'reality');
    if (node.config.realitySettings) {
      const reality = node.config.realitySettings;
      if (reality.serverNames[0]) {
        params.set('sni', reality.serverNames[0]);
      }
      if (reality.publicKey) {
        params.set('pbk', reality.publicKey);
      }
      if (reality.shortId) {
        params.set('sid', reality.shortId);
      }
      if (reality.spiderX) {
        params.set('spx', reality.spiderX);
      }
    }
  } else {
    params.set('security', 'none');
  }
  
  // WebSocket 配置
  if (node.config.transport === 'ws') {
    if (node.config.wsSettings?.path) {
      params.set('path', node.config.wsSettings.path);
    }
    if (node.config.wsSettings?.host) {
      params.set('host', node.config.wsSettings.host);
    }
  }
  
  // gRPC 配置
  if (node.config.transport === 'grpc') {
    if (node.config.grpcSettings?.serviceName) {
      params.set('serviceName', node.config.grpcSettings.serviceName);
    }
  }
  
  return `vless://${uuid}@${host}:${port}?${params.toString()}#${name}`;
}

/**
 * 生成节点分享链接
 */
export function generateShareLink(node: Node): string {
  switch (node.protocol) {
    case 'shadowsocks':
      return generateSSLink(node);
    case 'vmess':
      return generateVMessLink(node);
    case 'vless':
      return generateVLESSLink(node);
    default:
      return '';
  }
}
