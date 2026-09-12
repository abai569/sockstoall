/**
 * Xray 服务管理器 - Xray 作为常驻服务运行
 * 节点增删改时自动重新生成配置并热重载
 */

import { spawn, ChildProcess, execFileSync, execSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';
import type { Node, SocksOutbound } from '../../shared/types.js';
import { buildXrayConfig } from './config-builder.js';

const ROOT_DIR = process.cwd();
const BIN_DIR = join(ROOT_DIR, 'bin');
const DATA_DIR = join(ROOT_DIR, 'data');
const CONFIG_FILE = join(DATA_DIR, 'xray-config.json');
const RELEASES_API = 'https://api.github.com/repos/XTLS/Xray-core/releases/latest';
const UPDATE_CACHE_MS = 5 * 60 * 1000;

interface XrayUpdateInfo {
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  downloadUrl?: string;
  error?: string;
}

export class XrayService extends EventEmitter {
  private process: ChildProcess | null = null;
  private xrayPath: string | null = null;
  private startTime: number = 0;
  private nodes: Node[] = [];
  private routes: Array<{ routeId: string; node: Node; outbound: SocksOutbound }> = [];
  private updateCache: { expiresAt: number; value: XrayUpdateInfo } | null = null;
  private updating = false;

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
    return !!this.xrayPath && existsSync(this.xrayPath);
  }

  getXrayPath(): string | null {
    return this.xrayPath;
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

  private getPlatformAssetName(): string {
    const platform = process.platform;
    if (platform !== 'linux') {
      throw new Error(`Xray 自动升级暂不支持 ${platform}`);
    }

    const arch = process.arch === 'x64' ? '64' : process.arch === 'arm64' ? 'arm64-v8a' : process.arch === 'arm' ? 'arm32-v7a' : null;
    if (!arch) throw new Error(`Xray 自动升级暂不支持 ${process.arch}`);
    return `Xray-linux-${arch}.zip`;
  }

  private compareVersions(left: string | null, right: string | null): number {
    if (!left || !right) return 0;
    const parse = (version: string) => version.replace(/^v/i, '').split('.').map(part => parseInt(part, 10) || 0);
    const a = parse(left);
    const b = parse(right);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
    }
    return 0;
  }

  async checkUpdate(force = false): Promise<XrayUpdateInfo> {
    const currentVersion = await this.getVersion();
    if (!force && this.updateCache && this.updateCache.expiresAt > Date.now()) {
      return { ...this.updateCache.value, currentVersion };
    }

    try {
      const assetName = this.getPlatformAssetName();
      const response = await fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'SocksToAll' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
      const release = await response.json() as { tag_name?: string; assets?: Array<{ name: string; browser_download_url: string }> };
      const asset = release.assets?.find(item => item.name === assetName);
      if (!release.tag_name || !asset) throw new Error(`Xray asset ${assetName} not found`);

      const value: XrayUpdateInfo = {
        currentVersion,
        latestVersion: release.tag_name.replace(/^v/i, ''),
        updateAvailable: this.compareVersions(currentVersion, release.tag_name) < 0,
        downloadUrl: asset.browser_download_url,
      };
      this.updateCache = { expiresAt: Date.now() + UPDATE_CACHE_MS, value };
      return value;
    } catch (error: any) {
      const value: XrayUpdateInfo = {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        error: error.message || '检查 Xray 更新失败',
      };
      return value;
    }
  }

  private findExtractedBinary(directory: string): string | null {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        const nested = this.findExtractedBinary(path);
        if (nested) return nested;
      } else if (entry.name === 'xray' || entry.name === 'xray.exe') {
        return path;
      }
    }
    return null;
  }

  private async waitForProcessExit(process: ChildProcess, timeoutMs = 10_000): Promise<void> {
    if (process.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      process.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async upgrade(): Promise<{ previousVersion: string | null; version: string | null }> {
    if (this.updating) throw new Error('Xray 升级正在进行中');
    this.updating = true;
    const wasRunning = this.isRunning();
    const previousVersion = await this.getVersion();
    const stagingDir = mkdtempSync(join(tmpdir(), 'sockstoall-xray-'));
    const backupPath = `${this.xrayPath || join(BIN_DIR, 'xray')}.backup`;

    try {
      const update = await this.checkUpdate(true);
      if (update.error) throw new Error(update.error);
      if (!update.updateAvailable || !update.downloadUrl) throw new Error('当前已是最新版本');

      const archivePath = join(stagingDir, 'xray.zip');
      const response = await fetch(update.downloadUrl, {
        headers: { 'User-Agent': 'SocksToAll' },
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`下载 Xray 失败: HTTP ${response.status}`);
      writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
      execFileSync('unzip', ['-q', '-o', archivePath, '-d', stagingDir]);

      const downloadedPath = this.findExtractedBinary(stagingDir);
      if (!downloadedPath) throw new Error('Xray 压缩包中未找到可执行文件');
      chmodSync(downloadedPath, 0o755);
      const versionOutput = execFileSync(downloadedPath, ['version'], { encoding: 'utf8' });
      const downloadedVersion = versionOutput.match(/Xray\s+([^\s]+)/i)?.[1] || null;
      if (!downloadedVersion || this.compareVersions(downloadedVersion, update.latestVersion) !== 0) {
        throw new Error('下载的 Xray 版本校验失败');
      }

      if (wasRunning) {
        const oldProcess = this.process;
        this.stop();
        if (oldProcess) await this.waitForProcessExit(oldProcess);
      }
      mkdirSync(BIN_DIR, { recursive: true });
      const targetPath = join(BIN_DIR, basename(this.xrayPath || 'xray'));
      if (existsSync(targetPath)) renameSync(targetPath, backupPath);
      renameSync(downloadedPath, targetPath);
      this.xrayPath = targetPath;

      if (wasRunning) {
        const result = this.start();
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (!result.success || !this.isRunning()) throw new Error('新版本启动失败');
      }

      if (existsSync(backupPath)) rmSync(backupPath, { force: true });
      this.updateCache = null;
      return { previousVersion, version: downloadedVersion };
    } catch (error) {
      const targetPath = join(BIN_DIR, basename(this.xrayPath || 'xray'));
      if (existsSync(backupPath)) {
        if (existsSync(targetPath)) rmSync(targetPath, { force: true });
        renameSync(backupPath, targetPath);
        this.xrayPath = targetPath;
        if (wasRunning && !this.isRunning()) this.start();
      }
      throw error;
    } finally {
      this.updating = false;
      rmSync(stagingDir, { recursive: true, force: true });
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

  private writeConfig(): void {
    const config = buildXrayConfig(this.nodes, this.routes);

    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }

    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
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

  private restart(): void {
    if (!this.isRunning()) {
      return;
    }

    const oldProcess = this.process!;

    const doStart = () => {
      if (!this.isInstalled()) return;
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
    };

    oldProcess.once('exit', () => {
      doStart();
    });

    oldProcess.kill();

    setTimeout(() => {
      if (!this.isRunning()) {
        doStart();
      }
    }, 3000);
  }
}

export const xrayService = new XrayService();
