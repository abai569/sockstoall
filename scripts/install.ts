#!/usr/bin/env node
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, chmodSync, createWriteStream } from 'fs';
import { join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const ROOT = resolve(import.meta.dirname, '..');
const BIN_DIR = join(ROOT, 'bin');
const DATA_DIR = join(ROOT, 'data');
const REPO = 'abai569/sockstoall';

function detectPlatform(): { os: string; arch: string; ext: string } {
  const platform = process.platform;
  const arch = process.arch;
  let os: string, binaryExt: string;
  if (platform === 'win32') { os = 'windows'; binaryExt = '.exe'; }
  else if (platform === 'darwin') { os = 'macos'; binaryExt = ''; }
  else { os = 'linux'; binaryExt = ''; }
  let archStr: string;
  if (arch === 'x64') archStr = '64';
  else if (arch === 'arm64') archStr = 'arm64-v8a';
  else archStr = '32';
  return { os: `${os}-${archStr}`, arch, ext: binaryExt };
}

async function getLatestReleaseUrl(): Promise<string | null> {
  try {
    const apiUrl = `https://api.github.com/repos/${REPO}/releases/latest`;
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
    const data = await response.json() as { tag_name: string; assets: Array<{ name: string; browser_download_url: string }> };
    const asset = data.assets.find(a => a.name.startsWith('sockstoall-') && a.name.endsWith('.tar.gz'));
    return asset ? asset.browser_download_url : null;
  } catch {
    return null;
  }
}

async function getXrayDownloadUrl(platform: string): Promise<string> {
  const apiUrl = 'https://api.github.com/repos/XTLS/Xray-core/releases/latest';
  const response = await fetch(apiUrl);
  const data = await response.json() as { tag_name: string; assets: Array<{ name: string; browser_download_url: string }> };
  const assetName = `Xray-${platform}.zip`;
  const asset = data.assets.find(a => a.name === assetName);
  if (!asset) throw new Error(`Xray release not found for platform: ${platform}`);
  return asset.browser_download_url;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`Downloading: ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.statusText}`);
  const fileStream = createWriteStream(dest);
  await pipeline(Readable.fromWeb(response.body as any), fileStream);
}

function extractZip(zipPath: string, destDir: string): void {
  if (process.platform === 'win32') {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'inherit' });
  } else {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'inherit' });
  }
}

function extractTarGz(tarPath: string, destDir: string): void {
  execSync(`tar -xzf "${tarPath}" -C "${destDir}"`, { stdio: 'inherit' });
}

async function getIPv4(): Promise<string> {
  const urls = [
    'https://api4.ipify.org',
    'https://ipv4.icanhazip.com',
    'https://v4.ident.me',
    'https://4.ifconfig.me',
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const text = (await res.text()).trim();
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(text)) return text;
    } catch { /* ignore */ }
  }
  return 'localhost';
}

async function downloadRelease(): Promise<boolean> {
  console.log('[1/4] Checking for latest release...');
  const releaseUrl = await getLatestReleaseUrl();
  if (!releaseUrl) {
    console.log('No release found, will build from source\n');
    return false;
  }

  try {
    const tarPath = join(ROOT, 'sockstoall-release.tar.gz');
    await downloadFile(releaseUrl, tarPath);
    extractTarGz(tarPath, ROOT);
    const { unlinkSync } = await import('fs');
    unlinkSync(tarPath);
    console.log('Release installed\n');
    return true;
  } catch (error) {
    console.log('Release download failed, will build from source:', error, '\n');
    return false;
  }
}

function buildFromSource(): void {
  console.log('[1/4] Building from source...');
  const isWindows = process.platform === 'win32';
  const unsetCmd = isWindows
    ? 'npm config unset production 2>nul || ver >nul'
    : 'npm config unset production 2>/dev/null || true';
  execSync(`${unsetCmd} && npm install --include=dev`, { cwd: ROOT, stdio: 'inherit', shell: true });
  execSync('npm run build:release', { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' } });
  console.log('Build complete\n');
}

async function installXray(): Promise<void> {
  console.log('[2/4] Downloading Xray-core...');
  const { os: platform, ext } = detectPlatform();
  const xrayBinaryName = ext ? `xray${ext}` : 'xray';
  const xrayPath = join(BIN_DIR, xrayBinaryName);
  if (existsSync(xrayPath)) {
    console.log('Xray-core already exists, skipping\n');
    return;
  }

  try {
    const downloadUrl = await getXrayDownloadUrl(platform);
    const zipPath = join(BIN_DIR, 'xray.zip');
    await downloadFile(downloadUrl, zipPath);
    extractZip(zipPath, BIN_DIR);
    if (process.platform !== 'win32') chmodSync(xrayPath, 0o755);
    const { unlinkSync } = await import('fs');
    unlinkSync(zipPath);
    console.log('Xray-core installed\n');
  } catch (error) {
    console.error('Failed to download Xray-core:', error);
  }
}

function initData(): void {
  console.log('[3/4] Initializing data files...');
  mkdirSync(DATA_DIR, { recursive: true });
  for (const file of ['nodes.json', 'routes.json']) {
    const filePath = join(DATA_DIR, file);
    if (!existsSync(filePath)) writeFileSync(filePath, '[]');
  }
  console.log('Data files initialized\n');
}

async function main() {
  console.log('=== SocksToAll Installer ===\n');
  mkdirSync(BIN_DIR, { recursive: true });

  const installed = await downloadRelease();
  if (!installed) buildFromSource();

  await installXray();
  initData();

  const ip = await getIPv4();
  console.log('[4/4] Done!');
  console.log('\nStart the server:');
  console.log('  npm start');
  console.log('\nOpen browser:');
  console.log(`  http://${ip}:3456`);
}

main().catch(error => {
  console.error('Installation failed:', error);
  process.exit(1);
});
