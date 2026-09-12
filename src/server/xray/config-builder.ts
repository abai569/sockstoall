/**
 * Xray 配置生成 - 本地服务与远程 Agent 共用
 */

import type { Node, SocksOutbound } from '../../shared/types.js';

export interface RouteDetail {
  routeId: string;
  node: Node;
  outbound: SocksOutbound;
}

function buildInbound(node: Node): any {
  const base = {
    port: node.port,
    listen: '::',
    tag: node.id,
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
          clients: [{ id: node.config.uuid, alterId: node.config.alterId }],
        },
        streamSettings: { network: node.config.transport },
      };
      if (node.config.tls === 'tls' && node.config.tlsSettings) {
        inbound.streamSettings.security = 'tls';
        inbound.streamSettings.tlsSettings = {
          serverName: node.config.tlsSettings.serverName,
          alpn: node.config.tlsSettings.alpn,
        };
      }
      if (node.config.transport === 'ws' && node.config.wsSettings) {
        inbound.streamSettings.wsSettings = {
          path: node.config.wsSettings.path,
          headers: node.config.wsSettings.host ? { Host: node.config.wsSettings.host } : undefined,
        };
      }
      if (node.config.transport === 'grpc' && node.config.grpcSettings) {
        inbound.streamSettings.grpcSettings = { serviceName: node.config.grpcSettings.serviceName };
      }
      return inbound;
    }

    case 'vless': {
      const inbound: any = {
        ...base,
        protocol: 'vless',
        settings: {
          clients: [{ id: node.config.uuid, flow: node.config.flow !== 'none' ? node.config.flow : undefined }],
          decryption: 'none',
        },
        streamSettings: { network: node.config.transport },
      };
      if (node.config.tls === 'reality' && node.config.realitySettings) {
        inbound.streamSettings.security = 'reality';
        inbound.streamSettings.realitySettings = {
          dest: node.config.realitySettings.dest,
          serverNames: node.config.realitySettings.serverNames,
          privateKey: node.config.realitySettings.privateKey,
          shortIds: [node.config.realitySettings.shortId],
        };
      }
      if (node.config.tls === 'tls' && node.config.tlsSettings) {
        inbound.streamSettings.security = 'tls';
        inbound.streamSettings.tlsSettings = {
          serverName: node.config.tlsSettings.serverName,
          alpn: node.config.tlsSettings.alpn,
        };
      }
      if (node.config.transport === 'ws' && node.config.wsSettings) {
        inbound.streamSettings.wsSettings = {
          path: node.config.wsSettings.path,
          headers: node.config.wsSettings.host ? { Host: node.config.wsSettings.host } : undefined,
        };
      }
      if (node.config.transport === 'grpc' && node.config.grpcSettings) {
        inbound.streamSettings.grpcSettings = { serviceName: node.config.grpcSettings.serviceName };
      }
      return inbound;
    }

    case 'socks':
      return {
        ...base,
        protocol: 'socks',
        settings: {
          auth: node.config.username ? 'password' : 'noauth',
          accounts: node.config.username ? [{ user: node.config.username, pass: node.config.password }] : undefined,
          udp: node.config.udp !== false,
        },
      };

    default:
      throw new Error(`Unknown protocol: ${(node as any).protocol}`);
  }
}

export function buildXrayConfig(nodes: Node[], routes: RouteDetail[]): any {
  const inbounds = nodes.map(node => buildInbound(node));

  const outbounds: any[] = [];
  const routingRules: any[] = [];

  routes.forEach((route) => {
    const socksTag = `socks-${route.routeId}`;
    outbounds.push({
      protocol: 'socks',
      tag: socksTag,
      settings: {
        servers: [{
          address: route.outbound.address,
          port: route.outbound.port,
          users: route.outbound.username ? [{
            user: route.outbound.username,
            pass: route.outbound.password,
            level: 0,
          }] : undefined,
        }],
      },
    });
    routingRules.push({
      type: 'field',
      inboundTag: route.node.id,
      outboundTag: socksTag,
    });
  });

  outbounds.push({
    protocol: 'freedom',
    tag: 'direct',
  });

  // 本地统计 API 入站（供面板/Agent 采集流量）
  const apiPort = parseInt(process.env.XRAY_API_PORT || '10085');
  inbounds.push({
    listen: '127.0.0.1',
    port: apiPort,
    protocol: 'dokodemo-door',
    settings: { address: '127.0.0.1' },
    tag: 'api',
  });

  const config: any = {
    log: { loglevel: 'info' },
    stats: {},
    api: { tag: 'api', services: ['StatsService'] },
    policy: {
      system: {
        statsInboundUplink: true,
        statsInboundDownlink: true,
      },
    },
    inbounds,
    outbounds,
    routing: {
      domainStrategy: 'IPIfNonMatch',
      rules: [
        { type: 'field', inboundTag: ['api'], outboundTag: 'api', enabled: true },
        ...routingRules,
      ],
    },
  };

  return config;
}
