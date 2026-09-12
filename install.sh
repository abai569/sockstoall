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
COMPOSE_FILE="/opt/sockstoall/docker-compose.yml"
DOCKER_COMPOSE_COMMAND=""

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
            apt-get update -y && apt-get install -y curl ca-certificates
            ;;
        centos|rhel|fedora|almalinux|rocky)
            dnf install -y curl ca-certificates 2>/dev/null || yum install -y curl ca-certificates
            ;;
        *)
            apt-get update -y && apt-get install -y curl ca-certificates
            ;;
    esac
}

ensure_docker() {
    if ! command -v docker &>/dev/null; then
        log_info "Docker not found, installing Docker Engine..."
        case $OS in
            ubuntu|debian)
                apt-get update -y
                apt-get install -y docker.io
                apt-get install -y docker-compose-plugin 2>/dev/null || apt-get install -y docker-compose-v2 2>/dev/null || apt-get install -y docker-compose
                ;;
            centos|rhel|fedora|almalinux|rocky)
                if command -v dnf &>/dev/null; then
                    dnf install -y docker
                    dnf install -y docker-compose-plugin 2>/dev/null || dnf install -y docker-compose
                else
                    yum install -y docker
                    yum install -y docker-compose-plugin 2>/dev/null || yum install -y docker-compose
                fi
                ;;
            *)
                apt-get update -y
                apt-get install -y docker.io
                apt-get install -y docker-compose-plugin 2>/dev/null || apt-get install -y docker-compose-v2 2>/dev/null || apt-get install -y docker-compose
                ;;
        esac
    else
        log_info "Docker $(docker --version) already installed"
    fi

    if docker compose version &>/dev/null; then
        DOCKER_COMPOSE_COMMAND="docker compose"
        log_info "Docker Compose plugin is available"
    elif command -v docker-compose &>/dev/null; then
        DOCKER_COMPOSE_COMMAND="docker-compose"
        log_info "Docker Compose legacy command is available"
    else
        log_info "Docker Compose not found, installing Compose plugin..."
        case $OS in
            ubuntu|debian)
                apt-get update -y
                apt-get install -y docker-compose-plugin 2>/dev/null || apt-get install -y docker-compose-v2
                ;;
            centos|rhel|fedora|almalinux|rocky)
                if command -v dnf &>/dev/null; then
                    dnf install -y docker-compose-plugin 2>/dev/null || dnf install -y docker-compose
                else
                    yum install -y docker-compose-plugin 2>/dev/null || yum install -y docker-compose
                fi
                ;;
            *)
                apt-get update -y
                apt-get install -y docker-compose-plugin 2>/dev/null || apt-get install -y docker-compose-v2
                ;;
        esac
    fi

    if ! command -v docker &>/dev/null; then
        log_error "Docker installation failed"
        exit 1
    fi

    if docker compose version &>/dev/null; then
        DOCKER_COMPOSE_COMMAND="docker compose"
    elif command -v docker-compose &>/dev/null; then
        DOCKER_COMPOSE_COMMAND="docker-compose"
    else
        log_error "Docker Compose installation failed"
        exit 1
    fi

    systemctl enable --now docker
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

init_data() {
    local data_dir="$INSTALL_DIR/data"
    mkdir -p "$data_dir"
    [ ! -f "$data_dir/nodes.json" ] && echo "[]" > "$data_dir/nodes.json"
    [ ! -f "$data_dir/routes.json" ] && echo "[]" > "$data_dir/routes.json"
    log_info "Data directory initialized"
}

setup_compose() {
    mkdir -p "$INSTALL_DIR/data"
    curl -fsSL "https://raw.githubusercontent.com/${REPO}/master/docker-compose.yml" -o "$COMPOSE_FILE"
}

setup_systemd() {
    local compose_executable
    if [ "$DOCKER_COMPOSE_COMMAND" = "docker-compose" ]; then
        compose_executable="/usr/bin/docker-compose"
        if [ ! -x "$compose_executable" ]; then
            compose_executable="$(command -v docker-compose)"
        fi
        cat > /etc/systemd/system/sockstoall.service << EOF
[Unit]
Description=SocksToAll Proxy Manager
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sockstoall
ExecStart=$compose_executable -f /opt/sockstoall/docker-compose.yml up
ExecStop=$compose_executable -f /opt/sockstoall/docker-compose.yml down
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3456

[Install]
WantedBy=multi-user.target
EOF
    else
        compose_executable="/usr/bin/docker"
        cat > /etc/systemd/system/sockstoall.service << EOF
[Unit]
Description=SocksToAll Proxy Manager
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sockstoall
ExecStart=$compose_executable compose -f /opt/sockstoall/docker-compose.yml up
ExecStop=$compose_executable compose -f /opt/sockstoall/docker-compose.yml down
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3456

[Install]
WantedBy=multi-user.target
EOF
    fi
    systemctl daemon-reload
    systemctl enable sockstoall
}

start_service() {
    log_info "Starting service..."
    cd "$INSTALL_DIR"
    $DOCKER_COMPOSE_COMMAND -f "$COMPOSE_FILE" pull
    $DOCKER_COMPOSE_COMMAND -f "$COMPOSE_FILE" up -d
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
    ensure_docker
    init_data
    setup_compose
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
