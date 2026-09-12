/**
 * SocksToAll 共享类型定义
 */

// ==================== 节点相关 ====================

/** 节点协议类型 */
export type NodeProtocol = 'shadowsocks' | 'vmess' | 'vless' | 'socks';

/** 传输协议 */
export type TransportProtocol = 'tcp' | 'ws' | 'grpc' | 'kcp' | 'quic' | 'http';

/** 加密方式 (Shadowsocks) */
export type SSEncryption = 
  | 'aes-256-gcm' 
  | 'aes-128-gcm' 
  | 'chacha20-ietf-poly1305'
  | 'xchacha20-ietf-poly1305'
  | '2022-blake3-aes-128-gcm'
  | '2022-blake3-aes-256-gcm';

/** VMess 加密方式 */
export type VMessEncryption = 'auto' | 'aes-128-gcm' | 'chacha20-poly1305' | 'none' | 'zero';

/** TLS 类型 */
export type TlsType = 'none' | 'tls' | 'reality';

/** VLESS Flow */
export type VlessFlow = 'none' | 'xtls-rprx-vision' | 'xtls-rprx-vision-udp443';

/** 基础节点配置 */
interface BaseNode {
  id: string;
  name: string;
  protocol: NodeProtocol;
  port: number;
  listen?: string; // 监听地址，默认 0.0.0.0
  enabled: boolean; // 是否启用
  serverId?: number; // 所属服务器，默认 1（本机）
  userId?: number; // 所有者用户，默认 1（管理员）
  shareHost?: string; // 分享地址（域名/IP），留空自动
  uplinkBytes?: number; // 上行流量（字节）
  downlinkBytes?: number; // 下行流量（字节）
  suspended?: boolean; // 是否因超额/到期被停用
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

/** Shadowsocks 节点 */
export interface SSNode extends BaseNode {
  protocol: 'shadowsocks';
  config: {
    password: string;
    encryption: SSEncryption;
  };
}

/** VMess 节点 */
export interface VMessNode extends BaseNode {
  protocol: 'vmess';
  config: {
    uuid: string;
    alterId: number;
    encryption: VMessEncryption;
    transport: TransportProtocol;
    tls: TlsType;
    // TLS 配置
    tlsSettings?: {
      serverName?: string;
      alpn?: string[];
    };
    // WebSocket 配置
    wsSettings?: {
      path: string;
      host?: string;
    };
    // gRPC 配置
    grpcSettings?: {
      serviceName: string;
    };
  };
}

/** VLESS 节点 */
export interface VLESSNode extends BaseNode {
  protocol: 'vless';
  config: {
    uuid: string;
    flow: VlessFlow;
    transport: TransportProtocol;
    tls: TlsType;
    // TLS 配置
    tlsSettings?: {
      serverName?: string;
      alpn?: string[];
    };
    // Reality 配置
    realitySettings?: {
      dest: string;
      serverNames: string[];
      privateKey: string;
      publicKey?: string; // 客户端分享链接需要
      shortId: string;
      spiderX?: string;
    };
    // WebSocket 配置
    wsSettings?: {
      path: string;
      host?: string;
    };
    // gRPC 配置
    grpcSettings?: {
      serviceName: string;
    };
  };
}

/** SOCKS5 节点 */
export interface SocksNode extends BaseNode {
  protocol: 'socks';
  config: {
    username?: string;
    password?: string;
    udp?: boolean;
  };
}

/** 节点联合类型 */
export type Node = SSNode | VMessNode | VLESSNode | SocksNode;

/** 创建节点请求 (不含 id 和时间戳，enabled 可选默认 true) */
export type CreateNodeRequest = Omit<Node, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> & { enabled?: boolean };

// ==================== 转发规则相关 ====================

/** SOCKS5 出站配置 */
export interface SocksOutbound {
  address: string;
  port: number;
  username?: string;
  password?: string;
}

/** 转发规则 */
export interface Route {
  id: string;
  name: string;
  nodeId: string; // 关联的节点 ID
  userId?: number; // 所有者用户，默认 1（管理员）
  outbound: SocksOutbound;
  enabled: boolean;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

/** 创建转发规则请求 */
export type CreateRouteRequest = Omit<Route, 'id' | 'createdAt' | 'updatedAt'>;

// ==================== 用户相关 ====================

/** 用户 */
export interface User {
  id: number;
  username: string;
  passwordHash: string;
  role: string;
  status?: number;
  maxNodes?: number;
  trafficLimitGb?: number;
  usedFlowGb?: number;
  flowResetTime?: number;
  flowLastResetAt?: number;
  trafficSuspended?: number;
  expiredAt?: number;
  createdAt: string;
}

/** 登录请求 */
export interface LoginRequest {
  username: string;
  password: string;
}

/** 登录响应 */
export interface LoginResponse {
  token: string;
  username: string;
}

/** 修改密码请求 */
export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

/** 修改用户名和密码请求 */
export interface ChangeAccountRequest {
  oldPassword: string;
  newUsername?: string;
  newPassword?: string;
}

/** 站点配置 */
export interface SiteConfig {
  title: string;
}

// ==================== Xray 相关 ====================

/** Xray 状态 */
export interface XrayStatus {
  installed: boolean;
  version?: string;
  path?: string;
  running: boolean;
  pid?: number;
  uptime?: number; // 秒
  memoryUsage?: number; // bytes
}

/** Xray 进程信息 */
export interface XrayProcess {
  pid: number;
  startTime: number;
}

// ==================== API 响应 ====================

/** 通用 API 响应 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** 列表响应 */
export interface ListResponse<T> {
  items: T[];
  total: number;
}

// ==================== WebSocket 消息 ====================

/** 日志消息 */
export interface LogMessage {
  type: 'log';
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: number;
}

/** 状态变更消息 */
export interface StatusMessage {
  type: 'status';
  running: boolean;
  pid?: number;
}

/** WebSocket 消息联合类型 */
export type WSMessage = LogMessage | StatusMessage;
