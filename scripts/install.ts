#!/usr/bin/env node
/**
 * SocksToAll 一键安装脚本
 * 自动完成：Node 依赖 + Xray-core 下载 + 默认数据初始化 + 前端构建
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, chmodSync, createWriteStream } from 'fs';
import { join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const ROOT = resolve(import.meta.dirname, '..');
const BIN_DIR = join(ROOT, 'bin');
const DATA_DIR = join(ROOT, 'data');

// 检测平台
function detectPlatform(): { os: string; arch: string; ext: string } {
  const platform = process.platform;
  const arch = process.arch;
  
  let os: string, binaryExt: string;
  if (platform === 'win32') {
    os = 'windows';
    binaryExt = '.exe';
  } else if (platform === 'darwin') {
    os = 'macos';
    binaryExt = '';
  } else {
    os = 'linux';
    binaryExt = '';
  }
  
  let archStr: string;
  if (arch === 'x64') {
    archStr = '64';
  } else if (arch === 'arm64') {
    archStr = 'arm64-v8a';
  } else {
    archStr = '32';
  }
  
  return { os: `${os}-${archStr}`, arch, ext: binaryExt };
}

// 获取 Xray 最新版本下载 URL
async function getXrayDownloadUrl(platform: string): Promise<string> {
  const apiUrl = 'https://api.github.com/repos/XTLS/Xray-core/releases/latest';
  const response = await fetch(apiUrl);
  const data = await response.json() as { tag_name: string; assets: Array<{ name: string; browser_download_url: string }> };
  
  const assetName = `Xray-${platform}.zip`;
  const asset = data.assets.find(a => a.name === assetName);
  
  if (!asset) {
    throw new Error(`Xray release not found for platform: ${platform}`);
  }
  
  return asset.browser_download_url;
}

// 下载文件
async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`Downloading: ${url}`);
  const response = await fetch(url);
  
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.statusText}`);
  }
  
  const fileStream = createWriteStream(dest);
  await pipeline(Readable.fromWeb(response.body as any), fileStream);
}

// 解压 zip (使用系统命令)
function extractZip(zipPath: string, destDir: string): void {
  if (process.platform === 'win32') {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'inherit' });
  } else {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'inherit' });
  }
}

// 初始化默认用户
function initDefaultUsers(): void {
  const usersPath = join(DATA_DIR, 'users.json');
  if (!existsSync(usersPath)) {
    // 默认 admin/admin123 (bcrypt hash)
    const defaultUsers = [{
      username: 'admin',
      // bcrypt hash of 'admin123' - will be generated on first run
      passwordHash: '$2a$10$placeholder_will_be_replaced_on_first_run',
      createdAt: new Date().toISOString(),
    }];
    writeFileSync(usersPath, JSON.stringify(defaultUsers, null, 2));
    console.log('✓ Created default user: admin / admin123');
  }
}

// 初始化空数据文件
function initDataFiles(): void {
  const files = ['nodes.json', 'routes.json'];
  for (const file of files) {
    const filePath = join(DATA_DIR, file);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, '[]');
      console.log(`✓ Created ${file}`);
    }
  }
}

async function main() {
  console.log('=== SocksToAll Installer ===\n');
  
  // 1. 创建目录
  console.log('[1/5] Creating directories...');
  mkdirSync(BIN_DIR, { recursive: true });
  mkdirSync(DATA_DIR, { recursive: true });
  
  // 2. 安装 Node 依赖
  console.log('\n[2/5] Installing Node.js dependencies...');
  const unsetCmd = process.platform === 'win32'
    ? 'npm config unset production 2>nul || ver >nul'
    : 'npm config unset production 2>/dev/null || true';
  execSync(`${unsetCmd} && npm install`, { cwd: ROOT, stdio: 'inherit', shell: true });
  
  // 3. 下载 Xray-core
  console.log('\n[3/5] Downloading Xray-core...');
  const { os: platform, ext } = detectPlatform();
  const xrayBinaryName = ext ? `xray${ext}` : 'xray';
  const xrayPath = join(BIN_DIR, xrayBinaryName);
  
  if (existsSync(xrayPath)) {
    console.log('✓ Xray-core already exists, skipping download');
  } else {
    try {
      const downloadUrl = await getXrayDownloadUrl(platform);
      const zipPath = join(BIN_DIR, 'xray.zip');
      
      await downloadFile(downloadUrl, zipPath);
      console.log('Extracting...');
      extractZip(zipPath, BIN_DIR);
      
      // 设置可执行权限
      if (process.platform !== 'win32') {
        chmodSync(xrayPath, 0o755);
      }
      
      // 清理 zip
      const { unlinkSync } = await import('fs');
      unlinkSync(zipPath);
      
      console.log('✓ Xray-core installed');
    } catch (error) {
      console.error('✗ Failed to download Xray-core:', error);
      console.log('\nPlease download manually:');
      console.log('https://github.com/XTLS/Xray-core/releases');
      console.log(`Place xray binary in: ${BIN_DIR}`);
    }
  }
  
  // 4. 初始化数据
  console.log('\n[4/5] Initializing data files...');
  initDefaultUsers();
  initDataFiles();
  
  // 5. 构建前端
  console.log('\n[5/5] Building frontend...');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' } });
  
  console.log('\n=== Installation Complete ===');
  console.log('\nStart the server:');
  console.log('  npm start');
  console.log('\nOpen browser:');
  console.log('  http://localhost:3456');
  console.log('\nDefault login:');
  console.log('  Username: admin');
  console.log('  Password: admin123');
}

main().catch(error => {
  console.error('Installation failed:', error);
  process.exit(1);
});
