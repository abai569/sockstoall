# SocksToAll 一键安装脚本 (Windows PowerShell)

$ErrorActionPreference = "Stop"

Write-Host "=== SocksToAll Installer ===" -ForegroundColor Cyan
Write-Host ""

# 检测 Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found." -ForegroundColor Yellow
    Write-Host "Please install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "Or use winget: winget install OpenJS.NodeJS.LTS" -ForegroundColor Yellow
    exit 1
}

Write-Host "Node.js version: $(node -v)" -ForegroundColor Green

# 切换到脚本目录
Set-Location $PSScriptRoot

# 运行 TypeScript 安装脚本
npx tsx scripts/install.ts
