#!/bin/bash

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

INSTALL_DIR="/opt/sockstoall"
REPO="abai569/sockstoall"

if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root"
    exit 1
fi

detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        OS="unknown"
    fi
    log_info "OS: $OS"
}

install_base_deps() {
    log_info "Installing base dependencies..."
    case $OS in
        ubuntu|debian)
            apt-get update -y && apt-get install -y curl wget unzip git build-essential python3
            ;;
        centos|rhel|fedora|almalinux|rocky)
            dnf install -y curl wget unzip git gcc-c++ make python3 2>/dev/null || yum install -y curl wget unzip git gcc-c++ make python3
            ;;
        *)
            apt-get update -y && apt-get install -y curl wget unzip git build-essential python3
            ;;
    esac
}

install_nodejs() {
    if command -v node &>/dev/null; then
        local ver=$(node -v | grep -oP '[0-9]+' | head -1)
        if [ "$ver" -ge 18 ]; then
            log_info "Node.js $(node -v) already installed"
            return
        fi
    fi
    log_info "Installing Node.js 20..."
    case $OS in
        ubuntu|debian)
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            apt-get install -y nodejs
            ;;
        *)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
            yum install -y nodejs 2>/dev/null || dnf install -y nodejs
            ;;
    esac
    log_info "Node.js $(node -v) installed"
}

get_ipv4() {
    local urls=(
        "https://api4.ipify.org"
        "https://ipv4.icanhazip.com"
        "https://v4.ident.me"
        "https://4.ifconfig.me"
    )
    for url in "${urls[@]}"; do
        local ip=$(curl -fsSL --max-time 5 "$url" 2>/dev/null | tr -d '[:space:]')
        if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "$ip"
            return 0
        fi
    done
    return 1
}

install_xray() {
    local bin_dir="$INSTALL_DIR/bin"
    mkdir -p "$bin_dir"

    if [ -f "$bin_dir/xray" ]; then
        log_info "Xray already exists: $($bin_dir/xray version 2>/dev/null | head -1)"
        return
    fi

    log_info "Downloading Xray..."
    local arch
    case $(uname -m) in
        x86_64)  arch="64" ;;
        aarch64) arch="arm64-v8a" ;;
        armv7l)  arch="arm32-v7a" ;;
        *)       arch="64" ;;
    esac

    local url="https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-${arch}.zip"
    local tmp=$(mktemp -d)

    wget -q -O "$tmp/xray.zip" "$url" || { log_error "Download Xray failed"; exit 1; }
    unzip -q -o "$tmp/xray.zip" -d "$tmp"
    mv "$tmp/xray" "$bin_dir/xray"
    chmod +x "$bin_dir/xray"
    rm -rf "$tmp"

    log_info "Xray installed: $($bin_dir/xray version 2>/dev/null | head -1)"
}

download_release() {
    log_info "Fetching latest release..."
    local tag
    tag=$(curl -fsSL --max-time 10 "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null | grep '"tag_name"' | head -1 | sed 's/.*: *"//;s/".*//')

    if [ -z "$tag" ]; then
        log_warn "No release found, will build from source"
        return 1
    fi

    local url="https://github.com/${REPO}/releases/download/${tag}/sockstoall-${tag}.tar.gz"
    log_info "Downloading release ${tag}..."

    local tmp=$(mktemp -d)
    if ! wget -q -O "$tmp/sockstoall.tar.gz" "$url"; then
        log_warn "Release download failed, will build from source"
        rm -rf "$tmp"
        return 1
    fi

    log_info "Extracting release..."
    mkdir -p "$INSTALL_DIR"
    tar -xzf "$tmp/sockstoall.tar.gz" -C "$INSTALL_DIR"
    rm -rf "$tmp"

    log_info "Installing native dependencies..."
    cd "$INSTALL_DIR"
    npm install --omit=dev --build-from-source=better-sqlite3

    log_info "Release ${tag} installed"
    return 0
}

build_from_source() {
    log_info "Building from source (this may take a few minutes)..."

    if [ -d "$INSTALL_DIR/.git" ]; then
        cd "$INSTALL_DIR"
        git pull
    else
        rm -rf "$INSTALL_DIR"
        git clone "https://github.com/${REPO}.git" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi

    npm config unset production 2>/dev/null || true
    npm install --include=dev

    export NODE_OPTIONS="--max-old-space-size=1024"
    npm run build:release
}

init_data() {
    local data_dir="$INSTALL_DIR/data"
    mkdir -p "$data_dir"
    [ ! -f "$data_dir/nodes.json" ] && echo "[]" > "$data_dir/nodes.json"
    [ ! -f "$data_dir/routes.json" ] && echo "[]" > "$data_dir/routes.json"
    log_info "Data directory initialized"
}

setup_systemd() {
    cat > /etc/systemd/system/sockstoall.service << 'EOF'
[Unit]
Description=SocksToAll Proxy Manager
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sockstoall
ExecStart=/usr/bin/node /opt/sockstoall/dist/server.mjs
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3456

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable sockstoall
}

start_service() {
    log_info "Starting service..."
    systemctl restart sockstoall
    sleep 2
    systemctl status sockstoall --no-pager
}

main() {
    echo -e "${BLUE}"
    echo "==========================================================="
    echo "   SocksToAll Installer"
    echo "   https://github.com/${REPO}"
    echo "==========================================================="
    echo -e "${NC}"

    detect_os
    install_base_deps
    install_nodejs

    if ! download_release; then
        build_from_source
    fi

    install_xray
    init_data
    setup_systemd
    start_service

    local ip=$(get_ipv4 || echo "localhost")
    echo ""
    echo -e "${GREEN}===========================================================${NC}"
    echo -e "${GREEN}  Installation Complete!${NC}"
    echo -e "${GREEN}===========================================================${NC}"
    echo ""
    echo -e "  URL:    ${BLUE}http://${ip}:3456${NC}"
    echo -e "  User:   ${YELLOW}admin${NC}"
    echo -e "  Pass:   ${YELLOW}admin123${NC}"
    echo ""
    echo -e "  Commands:"
    echo -e "    systemctl start|stop|restart sockstoall"
    echo -e "    journalctl -u sockstoall -f"
    echo ""
}

main "$@"
