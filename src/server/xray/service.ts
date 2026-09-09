/**
 * Xray 服务管理器 - Xray 作为常驻服务运行
 * 节点增删改时自动重新生成配置并热重载
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import type { Node, SocksOutbound } from '../../shared/types.js';

const ROOT_DIR = process.cwd();
const BIN_DIR = join(ROOT_DIR, 'bin');
const DATA_DIR = join(ROOT_DIR, 'data');
const CONFIG_FILE = join(DATA_DIR, 'xray-config.json');

export class XrayService extends EventEmitter {
  private process: ChildProcess | null = null;
  private xrayPath: string | null = null;
  private startTime: number = 0;
  private nodes: Node[] = [];
  private routes: Array<{ routeId: string; node: Node; outbound: SocksOutbound }> = [];

  constructor() {
    super();
    this.detectXray();
  }

  private detectXray(): void {
    const isWindows = process.platform === 'win32';
    const binaryName = isWindows ? 'xray.exe' : 'xray';
    
    const binPath = join(BIN_DIR, binaryName);
    if (existsSync(binPath)) {
      this.xrayPath = binPath;
    } else {
      this.xrayPath = binaryName;
    }
  }

  isInstalled(): boolean {
    if (!this.xrayPath) return false;
    const binPath = join(BIN_DIR, process.platform === 'win32' ? 'xray.exe' : 'xray');
    return existsSync(binPath);
  }

  async getVersion(): Promise<string | null> {
    if (!this.xrayPath) return null;
    try {
      const output = execSync(`"${this.xrayPath}" version`, { encoding: 'utf-8' });
      const match = output.match(/Xray\s+([^\s]+)/i);
      return match ? match[1] : output.trim();
    } catch {
      return null;
    }
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  getUptime(): number {
    if (!this.isRunning()) return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  getPid(): number | undefined {
    return this.process?.pid;
  }

  /**
   * 设置节点和路由列表，重新生成配置
   * 如果 Xray 正在运行，自动重启
   */
  setNodesAndRoutes(nodes: Node[], routes: Array<{ routeId: string; node: Node; outbound: SocksOutbound }>): void {
    this.nodes = nodes;
    this.routes = routes;
    this.writeConfig();
    
    // 如果正在运行，重启以应用新配置
    if (this.isRunning()) {
      this.restart();
    }
  }

  /**
   * 写入配置文件
   */
  private writeConfig(): void {
    const inbounds = this.nodes.map(node => this.buildInbound(node));

    const outbounds: any[] = [];
    
    this.routes.forEach((route) => {
      outbounds.push({
        protocol: 'socks',
        tag: `socks-${route.routeId}`,
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
    });

    outbounds.push({
      protocol: 'freedom',
      tag: 'direct',
    });

    const config = {
      log: { loglevel: 'info' },
      inbounds,
      outbounds,
    };

    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }

    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  private buildInbound(node: Node): any {
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

  /**
   * 启动 Xray 服务
   */
  start(): { success: boolean; error?: string } {
    if (!this.isInstalled()) {
      return { success: false, error: 'Xray 未安装' };
    }

    if (this.isRunning()) {
      return { success: false, error: 'Xray 已在运行' };
    }

    try {
      this.process = spawn(this.xrayPath!, ['run', '-c', CONFIG_FILE], {
        cwd: ROOT_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.startTime = Date.now();
      let stderrBuffer = '';

      this.process.stdout?.on('data', (data) => {
        const msg = data.toString();
        console.log('[Xray]', msg.trim());
        this.emit('log', { level: 'info', message: msg });
      });

      this.process.stderr?.on('data', (data) => {
        const msg = data.toString();
        stderrBuffer += msg;
        console.error('[Xray ERROR]', msg.trim());
        this.emit('log', { level: 'error', message: msg });
      });

      this.process.on('exit', (code) => {
        console.log(`[Xray] Process exited with code ${code}`);
        if (code !== 0 && code !== null) {
          console.error('[Xray] Exit stderr:', stderrBuffer);
        }
        this.emit('exit', { code });
        this.process = null;
      });

      this.process.on('error', (err) => {
        console.error('[Xray] Process error:', err.message);
        this.emit('error', { message: err.message });
        this.process = null;
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: `启动失败: ${error}` };
    }
  }

  /**
   * 停止 Xray 服务
   */
  stop(): { success: boolean; error?: string } {
    if (!this.isRunning()) {
      return { success: false, error: 'Xray 未在运行' };
    }

    try {
      this.process!.kill();
      this.process = null;
      return { success: true };
    } catch (error) {
      return { success: false, error: `停止失败: ${error}` };
    }
  }

  /**
   * 重启 Xray（配置变更后调用）
   */
  private restart(): void {
    if (!this.isRunning()) {
      return;
    }

    // 先停止
    this.process!.kill();
    this.process = null;

    // 等待进程退出后重新启动
    setTimeout(() => {
      if (this.isInstalled()) {
        try {
          this.process = spawn(this.xrayPath!, ['run', '-c', CONFIG_FILE], {
            cwd: ROOT_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
          });

          this.startTime = Date.now();
          let stderrBuffer = '';

          this.process.stdout?.on('data', (data) => {
            const msg = data.toString();
            console.log('[Xray]', msg.trim());
            this.emit('log', { level: 'info', message: msg });
          });

          this.process.stderr?.on('data', (data) => {
            const msg = data.toString();
            stderrBuffer += msg;
            console.error('[Xray ERROR]', msg.trim());
            this.emit('log', { level: 'error', message: msg });
          });

          this.process.on('exit', (code) => {
            console.log(`[Xray] Process exited with code ${code}`);
            if (code !== 0 && code !== null) {
              console.error('[Xray] Exit stderr:', stderrBuffer);
            }
            this.emit('exit', { code });
            this.process = null;
          });

          this.process.on('error', (err) => {
            console.error('[Xray] Process error:', err.message);
            this.emit('error', { message: err.message });
            this.process = null;
          });
        } catch (error) {
          this.emit('error', { message: `Restart failed: ${error}` });
        }
      }
    }, 500);
  }
}

export const xrayService = new XrayService();
