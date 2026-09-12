/**
 * SocksToAll Agent - 运行在远程服务器上
 * 轮询面板拉取本服务器的 Xray 配置，写入本地并重启 Xray
 */

import { spawn, ChildProcess, execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { hostname, platform, arch } from 'os';

const WORK_DIR = process.cwd();
const CONFIG_FILE = join(WORK_DIR, 'config.json');
const XRAY_CONFIG_FILE = join(WORK_DIR, 'xray-config.json');
const XRAY_PATH = join(WORK_DIR, 'bin', process.platform === 'win32' ? 'xray.exe' : 'xray');

const HEARTBEAT_INTERVAL_MS = 15 * 1000;

interface AgentConfig {
  panelUrl: string;
  token: string;
}

let xrayProcess: ChildProcess | null = null;
let currentVersion: string | null = null;
let xrayVersion: string | null = null;

function loadConfig(): AgentConfig {
  if (!existsSync(CONFIG_FILE)) {
    throw new Error(`config.json not found at ${CONFIG_FILE}`);
  }
  const raw = readFileSync(CONFIG_FILE, 'utf-8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function detectXrayVersion(): string | null {
  if (!existsSync(XRAY_PATH)) return null;
  try {
    const output = execFileSync(XRAY_PATH, ['version'], { encoding: 'utf-8' });
    return output.match(/Xray\s+([^\s]+)/i)?.[1] || null;
  } catch {
    return null;
  }
}

function startXray(): void {
  if (!existsSync(XRAY_PATH)) {
    console.error('[Agent] Xray binary not found, skip start');
    return;
  }
  if (!existsSync(XRAY_CONFIG_FILE)) {
    console.log('[Agent] No config yet, waiting for panel');
    return;
  }

  xrayProcess = spawn(XRAY_PATH, ['run', '-c', XRAY_CONFIG_FILE], {
    cwd: WORK_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  xrayProcess.stdout?.on('data', (d) => console.log('[Xray]', d.toString().trim()));
  xrayProcess.stderr?.on('data', (d) => console.error('[Xray]', d.toString().trim()));
  xrayProcess.on('exit', (code) => {
    console.log(`[Agent] Xray exited with code ${code}`);
    xrayProcess = null;
  });
}

function stopXray(): Promise<void> {
  return new Promise((resolve) => {
    if (!xrayProcess) return resolve();
    const proc = xrayProcess;
    const timer = setTimeout(resolve, 5000);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    proc.kill();
  });
}

async function restartXray(): Promise<void> {
  await stopXray();
  startXray();
}

async function reportHeartbeat(cfg: AgentConfig): Promise<void> {
  try {
    await fetch(`${cfg.panelUrl}/api/agent/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: cfg.token,
        xrayVersion,
        os: platform(),
        arch: arch(),
        hostname: hostname(),
      }),
    });
  } catch (error: any) {
    console.error('[Agent] Heartbeat failed:', error.message);
  }
}

async function pullConfig(cfg: AgentConfig): Promise<void> {
  try {
    const response = await fetch(`${cfg.panelUrl}/api/agent/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cfg.token }),
    });
    if (!response.ok) {
      console.error(`[Agent] Config fetch failed: HTTP ${response.status}`);
      return;
    }
    const result: any = await response.json();
    if (!result.success || !result.data) return;

    const { version, config } = result.data;
    if (version === currentVersion) return;

    writeFileSync(XRAY_CONFIG_FILE, JSON.stringify(config, null, 2));
    currentVersion = version;
    console.log(`[Agent] Config updated to version ${version}`);
    await restartXray();
  } catch (error: any) {
    console.error('[Agent] Pull config failed:', error.message);
  }
}

async function tick(cfg: AgentConfig): Promise<void> {
  xrayVersion = detectXrayVersion();
  await reportHeartbeat(cfg);
  await pullConfig(cfg);
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  console.log(`[Agent] Starting, panel=${cfg.panelUrl}`);
  xrayVersion = detectXrayVersion();
  startXray();

  await tick(cfg);
  setInterval(() => { tick(cfg).catch(err => console.error('[Agent] tick error:', err)); }, HEARTBEAT_INTERVAL_MS);
}

process.on('SIGTERM', async () => {
  console.log('[Agent] SIGTERM, stopping Xray');
  await stopXray();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await stopXray();
  process.exit(0);
});

main().catch((error) => {
  console.error('[Agent] Fatal:', error);
  process.exit(1);
});
