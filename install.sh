#!/bin/bash

# SocksToAll 一键安装脚本
# 支持 Ubuntu/Debian/CentOS

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 日志函数
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检测系统
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VER=$VERSION_ID
    elif type lsb_release >/dev/null 2>&1; then
        OS=$(lsb_release -si | tr '[:upper:]' '[:lower:]')
        VER=$(lsb_release -sr)
    elif [ -f /etc/centos-release ]; then
        OS="centos"
        VER=$(cat /etc/centos-release | grep -oP '[0-9]+' | head -1)
    else
        OS="unknown"
        VER="unknown"
    fi
    log_info "检测到系统: $OS $VER"
}

# 安装依赖
install_deps() {
    log_info "安装依赖..."
    
    case $OS in
        ubuntu|debian)
            apt-get update -y
            apt-get install -y curl wget unzip git
            ;;
        centos|rhel|fedora)
            if [ "$VER" -ge 8 ] 2>/dev/null; then
                dnf install -y curl wget unzip git
            else
                yum install -y curl wget unzip git
            fi
            ;;
        *)
            log_error "不支持的系统: $OS"
            exit 1
            ;;
    esac
    
    log_info "依赖安装完成"
}

# 安装 Node.js
install_nodejs() {
    local node_version=$(node -v 2>/dev/null | grep -oP '[0-9]+' | head -1)
    
    if [ -z "$node_version" ] || [ "$node_version" -lt 18 ]; then
        log_info "安装 Node.js 20..."
        
        case $OS in
            ubuntu|debian)
                curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
                apt-get install -y nodejs
                ;;
            centos|rhel|fedora)
                curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
                yum install -y nodejs
                ;;
        esac
        
        log_info "Node.js 安装完成: $(node -v)"
    else
        log_info "Node.js 版本已满足: $(node -v)"
    fi
}

# 下载 Xray
install_xray() {
    log_info "下载 Xray..."
    
    local bin_dir="/opt/sockstoall/bin"
    mkdir -p "$bin_dir"
    
    # 检测架构
    local arch=$(uname -m)
    case $arch in
        x86_64) arch="64" ;;
        aarch64) arch="arm64-v8a" ;;
        armv7l) arch="arm32-v7a" ;;
        *) arch="64" ;;
    esac
    
    # 下载最新 Xray
    local xray_url="https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-${arch}.zip"
    local tmp_dir=$(mktemp -d)
    
    wget -q -O "$tmp_dir/xray.zip" "$xray_url" || {
        log_error "下载 Xray 失败"
        exit 1
    }
    
    unzip -q "$tmp_dir/xray.zip" -d "$tmp_dir"
    mv "$tmp_dir/xray" "$bin_dir/xray"
    chmod +x "$bin_dir/xray"
    
    rm -rf "$tmp_dir"
    
    log_info "Xray 安装完成: $($bin_dir/xray -version | head -1)"
}

# 安装 SocksToAll
install_sockstoall() {
    log_info "安装 SocksToAll..."
    
    local install_dir="/opt/sockstoall"
    
    # 下载源码
    if [ -d "$install_dir" ]; then
        if [ -d "$install_dir/.git" ]; then
            log_warn "目录已存在，更新中..."
            cd "$install_dir"
            git pull || {
                log_error "Git pull 失败"
                exit 1
            }
        else
            log_warn "旧目录非 git 仓库，重新安装..."
            rm -rf "$install_dir"
            git clone https://github.com/abai569/sockstoall.git "$install_dir"
            cd "$install_dir"
        fi
    else
        git clone https://github.com/abai569/sockstoall.git "$install_dir"
        cd "$install_dir"
    fi
    
    # 安装依赖
    log_info "安装 Node 依赖..."
    npm install --production
    
    # 构建
    log_info "构建前端..."
    npm run build
    
    # 创建 systemd 服务
    cat > /etc/systemd/system/sockstoall.service << 'EOF'
[Unit]
Description=SocksToAll Proxy Manager
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sockstoall
ExecStart=/usr/bin/node dist/server/server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3456

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable sockstoall
    
    log_info "SocksToAll 安装完成"
}

# 启动服务
start_service() {
    log_info "启动服务..."
    systemctl start sockstoall
    systemctl status sockstoall --no-pager
}

# 获取服务器 IP
get_server_ip() {
    local ip=$(curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo "localhost")
    echo "$ip"
}

# 主函数
main() {
    echo -e "${BLUE}"
    echo "═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║   SocksToAll 一键安装脚本                                 ║"
    echo "║                                                           ║"
    echo "║   GitHub: https://github.com/abai569/sockstoall           ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # 检查 root
    if [ "$EUID" -ne 0 ]; then
        log_error "请使用 root 用户运行此脚本"
        exit 1
    fi
    
    detect_os
    install_deps
    install_nodejs
    install_xray
    install_sockstoall
    start_service
    
    local ip=$(get_server_ip)
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  安装完成！${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  访问地址: ${BLUE}http://${ip}:3456${NC}"
    echo -e "  默认账号: ${YELLOW}admin${NC}"
    echo -e "  默认密码: ${YELLOW}admin123${NC}"
    echo ""
    echo -e "  管理命令:"
    echo -e "    启动: ${BLUE}systemctl start sockstoall${NC}"
    echo -e "    停止: ${BLUE}systemctl stop sockstoall${NC}"
    echo -e "    重启: ${BLUE}systemctl restart sockstoall${NC}"
    echo -e "    日志: ${BLUE}journalctl -u sockstoall -f${NC}"
    echo ""
    echo -e "  ⚠️  ${YELLOW}请立即修改默认密码！${NC}"
    echo ""
}

main "$@"
