#!/bin/bash
# SocksToAll 一键安装脚本 (Linux/macOS)

set -e

echo "=== SocksToAll Installer ==="
echo ""

# 检测 Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing..."
    
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs
    elif command -v brew &> /dev/null; then
        brew install node
    else
        echo "Please install Node.js manually: https://nodejs.org/"
        exit 1
    fi
fi

echo "Node.js version: $(node -v)"

# 运行 TypeScript 安装脚本
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 临时安装 tsx 来运行安装脚本
npx tsx scripts/install.ts
