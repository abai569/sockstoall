/**
 * Xray 进程管理器 - 支持节点独立运行 + 转发规则
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import type { XrayStatus, Node, SocksOutbound } from '../../shared/types.js';
import { generateXrayConfigJson, generateDirectConfigJson } from '../route/config-builder.js';

const ROOT_DIR = process.cwd();
const BIN_DIR = join(ROOT_DIR, 'bin');
const DATA_DIR = join(ROOT_DIR, 'data');

interface XrayInstance {
  id: string; // nodeId 或 routeId
  type: 'node' | 'route';
  process: ChildProcess;
  configFile: string;
  startTime: number;
}

export class XrayManager extends EventEmitter {
  private instances: Map<string, XrayInstance> = new Map();
  private xrayPath: string | null = null;

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
      return;
    }
    
    this.xrayPath = binaryName;
  }

  getStatus(): XrayStatus {
    const isWindows = process.platform === 'win32';
    const binaryName = isWindows ? 'xray.exe' : 'xray';
    
    const binPath = join(BIN_DIR, binaryName);
    const installed = existsSync(binPath) || this.xrayPath !== null;
    
    const runningCount = this.instances.size;
    const firstInstance = this.instances.values().next().value;
    
    return {
      installed,
      path: this.xrayPath || undefined,
      running: runningCount > 0,
      pid: firstInstance?.process.pid,
      uptime: firstInstance ? Math.floor((Date.now() - firstInstance.startTime) / 1000) : undefined,
    };
  }

  getRunningInstances(): Array<{ id: string; type: 'node' | 'route'; pid: number; uptime: number }> {
    const result = [];
    
    for (const [id, instance] of this.instances) {
      result.push({
        id,
        type: instance.type,
        pid: instance.process.pid || 0,
        uptime: Math.floor((Date.now() - instance.startTime) / 1000)
      });
    }
    
    return result;
  }

  isRunning(id: string): boolean {
    return this.instances.has(id);
  }

  async getVersion(): Promise<string | null> {
    if (!this.xrayPath) return null;
    
    try {
      const { execSync } = await import('child_process');
      const output = execSync(`"${this.xrayPath}" version`, { encoding: 'utf-8' });
      const match = output.match(/Xray\s+([^\s]+)/i);
      return match ? match[1] : output.trim();
    } catch {
      return null;
    }
  }

  /**
   * 启动节点（直连出站）
   */
  startNode(node: Node): { success: boolean; error?: string } {
    if (this.instances.has(node.id)) {
      return { success: false, error: '该节点已在运行' };
    }
    
    if (!this.xrayPath) {
      return { success: false, error: 'Xray 未安装' };
    }
    
    const config = generateDirectConfigJson(node);
    const configFile = join(DATA_DIR, `xray-node-${node.id}.json`);
    
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    
    writeFileSync(configFile, config);
    
    try {
      const proc = spawn(this.xrayPath, ['run', '-c', configFile], {
        cwd: ROOT_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      
      const instance: XrayInstance = {
        id: node.id,
        type: 'node',
        process: proc,
        configFile,
        startTime: Date.now()
      };
      
      this.instances.set(node.id, instance);
      
      proc.stdout?.on('data', (data) => {
        this.emit('log', { id: node.id, type: 'node', level: 'info', message: data.toString() });
      });
      
      proc.stderr?.on('data', (data) => {
        this.emit('log', { id: node.id, type: 'node', level: 'error', message: data.toString() });
      });
      
      proc.on('exit', (code) => {
        this.emit('exit', { id: node.id, type: 'node', code });
        this.instances.delete(node.id);
        try { unlinkSync(configFile); } catch {}
      });
      
      proc.on('error', (err) => {
        this.emit('error', { id: node.id, type: 'node', message: err.message });
        this.instances.delete(node.id);
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: `启动失败：${error}` };
    }
  }

  /**
   * 启动转发规则（SOCKS 出站）
   */
  startRoute(routeId: string, node: Node, outbound: SocksOutbound): { success: boolean; error?: string } {
    if (this.instances.has(routeId)) {
      return { success: false, error: '该规则已在运行' };
    }
    
    if (!this.xrayPath) {
      return { success: false, error: 'Xray 未安装' };
    }
    
    const config = generateXrayConfigJson(node, outbound);
    const configFile = join(DATA_DIR, `xray-route-${routeId}.json`);
    
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    
    writeFileSync(configFile, config);
    
    try {
      const proc = spawn(this.xrayPath, ['run', '-c', configFile], {
        cwd: ROOT_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      
      const instance: XrayInstance = {
        id: routeId,
        type: 'route',
        process: proc,
        configFile,
        startTime: Date.now()
      };
      
      this.instances.set(routeId, instance);
      
      proc.stdout?.on('data', (data) => {
        this.emit('log', { id: routeId, type: 'route', level: 'info', message: data.toString() });
      });
      
      proc.stderr?.on('data', (data) => {
        this.emit('log', { id: routeId, type: 'route', level: 'error', message: data.toString() });
      });
      
      proc.on('exit', (code) => {
        this.emit('exit', { id: routeId, type: 'route', code });
        this.instances.delete(routeId);
        try { unlinkSync(configFile); } catch {}
      });
      
      proc.on('error', (err) => {
        this.emit('error', { id: routeId, type: 'route', message: err.message });
        this.instances.delete(routeId);
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: `启动失败：${error}` };
    }
  }

  stop(id: string): { success: boolean; error?: string } {
    const instance = this.instances.get(id);
    
    if (!instance) {
      return { success: false, error: '未在运行' };
    }
    
    try {
      instance.process.kill();
      this.instances.delete(id);
      try { unlinkSync(instance.configFile); } catch {}
      return { success: true };
    } catch (error) {
      return { success: false, error: `停止失败：${error}` };
    }
  }

  stopAll(): void {
    for (const [id] of this.instances) {
      this.stop(id);
    }
  }

  isAnyRunning(): boolean {
    return this.instances.size > 0;
  }
}

export const xrayManager = new XrayManager();
