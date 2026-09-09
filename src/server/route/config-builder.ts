/**
 * Xray 配置构建器
 * 将节点 + SOCKS 出站转换为 Xray JSON 配置
 */

import type { Node, Route, SocksOutbound } from '../../shared/types.js';

interface XrayConfig {
  log?: {
    loglevel: string;
  };
  inbounds: any[];
  outbounds: any[];
}

/**
 * 构建入站配置
 */
function buildInbound(node: Node): any {
  const base = {
    port: node.port,
    listen: node.listen || '0.0.0.0',
    tag: node.name,
  };

  switch (node.protocol) {
    case 'shadowsocks':
      return {
        ...base,
        protocol: 'shadowsocks',
        settings: {
          method: node.config.encryption,
          password: node.config.password,
          network: 'tcp,udp',
        },
      };

    case 'vmess': {
      const inbound: any = {
        ...base,
        protocol: 'vmess',
        settings: {
          clients: [{
            id: node.config.uuid,
            alterId: node.config.alterId,
          }],
        },
        streamSettings: {
          network: node.config.transport,
        },
      };

      // TLS
      if (node.config.tls === 'tls' && node.config.tlsSettings) {
        inbound.streamSettings.security = 'tls';
        inbound.streamSettings.tlsSettings = {
          serverName: node.config.tlsSettings.serverName,
          alpn: node.config.tlsSettings.alpn,
        };
      }

      // WebSocket
      if (node.config.transport === 'ws' && node.config.wsSettings) {
        inbound.streamSettings.wsSettings = {
          path: node.config.wsSettings.path,
          headers: node.config.wsSettings.host ? { Host: node.config.wsSettings.host } : undefined,
        };
      }

      // gRPC
      if (node.config.transport === 'grpc' && node.config.grpcSettings) {
        inbound.streamSettings.grpcSettings = {
          serviceName: node.config.grpcSettings.serviceName,
        };
      }

      return inbound;
    }

    case 'vless': {
      const inbound: any = {
        ...base,
        protocol: 'vless',
        settings: {
          clients: [{
            id: node.config.uuid,
            flow: node.config.flow !== 'none' ? node.config.flow : undefined,
          }],
          decryption: 'none',
        },
        streamSettings: {
          network: node.config.transport,
        },
      };

      // Reality
      if (node.config.tls === 'reality' && node.config.realitySettings) {
        inbound.streamSettings.security = 'reality';
        inbound.streamSettings.realitySettings = {
          dest: node.config.realitySettings.dest,
          serverNames: node.config.realitySettings.serverNames,
          privateKey: node.config.realitySettings.privateKey,
          shortIds: [node.config.realitySettings.shortId],
        };
      }

      // TLS
      if (node.config.tls === 'tls' && node.config.tlsSettings) {
        inbound.streamSettings.security = 'tls';
        inbound.streamSettings.tlsSettings = {
          serverName: node.config.tlsSettings.serverName,
          alpn: node.config.tlsSettings.alpn,
        };
      }

      // WebSocket
      if (node.config.transport === 'ws' && node.config.wsSettings) {
        inbound.streamSettings.wsSettings = {
          path: node.config.wsSettings.path,
          headers: node.config.wsSettings.host ? { Host: node.config.wsSettings.host } : undefined,
        };
      }

      // gRPC
      if (node.config.transport === 'grpc' && node.config.grpcSettings) {
        inbound.streamSettings.grpcSettings = {
          serviceName: node.config.grpcSettings.serviceName,
        };
      }

      return inbound;
    }

    case 'socks':
      return {
        ...base,
        protocol: 'socks',
        settings: {
          auth: node.config.username ? 'password' : 'noauth',
          accounts: node.config.username ? [{
            user: node.config.username,
            pass: node.config.password,
          }] : undefined,
          udp: node.config.udp !== false,
        },
      };

    default:
      throw new Error(`Unknown protocol: ${(node as any).protocol}`);
  }
}

/**
 * 构建 SOCKS 出站配置
 */
function buildSocksOutbound(outbound: SocksOutbound): any {
  return {
    protocol: 'socks',
    tag: 'socks-outbound',
    settings: {
      servers: [{
        address: outbound.address,
        port: outbound.port,
        users: outbound.username ? [{
          user: outbound.username,
          pass: outbound.password,
          level: 0,
        }] : undefined,
      }],
    },
  };
}

/**
 * 构建完整 Xray 配置
 */
export function buildXrayConfig(node: Node, outbound: SocksOutbound): XrayConfig {
  return {
    log: {
      loglevel: 'info',
    },
    inbounds: [buildInbound(node)],
    outbounds: [
      buildSocksOutbound(outbound),
      {
        protocol: 'freedom',
        tag: 'direct',
      },
    ],
  };
}

/**
 * 生成 Xray 配置 JSON 字符串
 */
export function generateXrayConfigJson(node: Node, outbound: SocksOutbound): string {
  const config = buildXrayConfig(node, outbound);
  return JSON.stringify(config, null, 2);
}

/**
 * 构建直连出站配置（freedom）
 */
function buildDirectConfig(node: Node): XrayConfig {
  return {
    log: {
      loglevel: 'info',
    },
    inbounds: [buildInbound(node)],
    outbounds: [
      {
        protocol: 'freedom',
        tag: 'direct',
      },
    ],
  };
}

/**
 * 生成直连 Xray 配置 JSON 字符串（节点独立运行，不转发 SOCKS）
 */
export function generateDirectConfigJson(node: Node): string {
  const config = buildDirectConfig(node);
  return JSON.stringify(config, null, 2);
}
