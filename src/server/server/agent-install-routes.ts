import { Hono } from 'hono';
import { db } from '../db/index.js';
import { servers } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { readFileSync, existsSync } from 'fs';

export const agentInstallRoutes = new Hono();

const AGENT_DIR = '/opt/sockstoall-agent';

function getPanelBaseUrl(c: any): string {
  const host = c.req.header('host') || 'localhost:3456';
  const proto = c.req.header('x-forwarded-proto') || 'http';
  return `${proto}://${host}`;
}

function renderInstallScript(panelUrl: string, token: string): string {
  return `#!/bin/bash

PANEL_URL="${panelUrl}"
AGENT_TOKEN="${token}"
AGENT_DIR="${AGENT_DIR}"
NODE_DIR="$AGENT_DIR/node"
NODE_VERSION="v20.18.1"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

if [ "$1" = "uninstall" ]; then
  echo "[INFO] Uninstalling SocksToAll Agent..."
  systemctl disable --now sockstoall-agent 2>/dev/null || true
  rm -f /etc/systemd/system/sockstoall-agent.service
  systemctl daemon-reload 2>/dev/null || true
  systemctl reset-failed sockstoall-agent 2>/dev/null || true
  rm -rf "$AGENT_DIR"
  echo "[INFO] SocksToAll Agent uninstalled"
  exit 0
fi

echo "[INFO] Installing SocksToAll Agent..."

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    armv7l) echo "armv7l" ;;
    *) echo "x64" ;;
  esac
}

extract_zip() {
  if command -v unzip &>/dev/null; then
    unzip -q -o "$1" -d "$2"
  elif command -v python3 &>/dev/null; then
    python3 -m zipfile -e "$1" "$2"
  else
    return 1
  fi
}

# 1. base tools（已存在则跳过 apt，避免受宿主机 dpkg 状态影响）
MISSING_TOOLS=""
for cmd in curl wget; do
  command -v "$cmd" &>/dev/null || MISSING_TOOLS="$MISSING_TOOLS $cmd"
done
if [ -n "$MISSING_TOOLS" ]; then
  echo "[INFO] Installing base tools:$MISSING_TOOLS"
  if command -v apt-get &>/dev/null; then
    DEBIAN_FRONTEND=noninteractive apt-get update -y || true
    DEBIAN_FRONTEND=noninteractive apt-get install -y curl wget unzip ca-certificates || true
  elif command -v dnf &>/dev/null; then
    dnf install -y curl wget unzip ca-certificates || true
  elif command -v yum &>/dev/null; then
    yum install -y curl wget unzip ca-certificates || true
  fi
fi

for cmd in curl wget; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "[ERROR] 缺少命令 $cmd，且自动安装失败。请先修复系统包管理器（如 dpkg --configure -a）后重试"
    exit 1
  fi
done

# 2. Node.js（官方预编译包，不走 apt）
if ! command -v node &>/dev/null; then
  ARCH=$(detect_arch)
  echo "[INFO] Installing Node.js $NODE_VERSION ($ARCH)..."
  mkdir -p "$NODE_DIR"
  TMP_NODE=$(mktemp -d)
  NODE_TARBALL="node-\${NODE_VERSION}-linux-\${ARCH}.tar.gz"
  if wget -q -O "$TMP_NODE/node.tar.gz" "https://nodejs.org/dist/\${NODE_VERSION}/\${NODE_TARBALL}"; then
    tar -xzf "$TMP_NODE/node.tar.gz" -C "$NODE_DIR" --strip-components=1
    ln -sf "$NODE_DIR/bin/node" /usr/local/bin/node
    ln -sf "$NODE_DIR/bin/npm" /usr/local/bin/npm 2>/dev/null || true
    ln -sf "$NODE_DIR/bin/npx" /usr/local/bin/npx 2>/dev/null || true
  fi
  rm -rf "$TMP_NODE"
fi

if ! command -v node &>/dev/null; then
  echo "[ERROR] Node.js 安装失败，请手动安装 Node.js 20 后重试"
  exit 1
fi
NODE_BIN="$(command -v node)"

# 3. Xray
mkdir -p "$AGENT_DIR/bin" "$AGENT_DIR/data"
if [ ! -f "$AGENT_DIR/bin/xray" ]; then
  case "$(uname -m)" in
    x86_64)  XRAY_ARCH="64" ;;
    aarch64) XRAY_ARCH="arm64-v8a" ;;
    armv7l)  XRAY_ARCH="arm32-v7a" ;;
    *)       XRAY_ARCH="64" ;;
  esac
  TMP=$(mktemp -d)
  wget -q -O "$TMP/xray.zip" "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-\${XRAY_ARCH}.zip"
  if extract_zip "$TMP/xray.zip" "$TMP"; then
    mv "$TMP/xray" "$AGENT_DIR/bin/xray"
    chmod +x "$AGENT_DIR/bin/xray"
  else
    echo "[ERROR] 解压工具缺失（unzip/python3），无法解压 Xray"
    rm -rf "$TMP"
    exit 1
  fi
  rm -rf "$TMP"
fi

# 4. Agent bundle
wget -q -O "$AGENT_DIR/agent.mjs" "$PANEL_URL/api/agent/agent.mjs"

# 5. config
cat > "$AGENT_DIR/config.json" <<JSON
{
  "panelUrl": "$PANEL_URL",
  "token": "$AGENT_TOKEN"
}
JSON

# 6. systemd
cat > /etc/systemd/system/sockstoall-agent.service <<SERVICE
[Unit]
Description=SocksToAll Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$AGENT_DIR
ExecStart=$NODE_BIN $AGENT_DIR/agent.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable --now sockstoall-agent
systemctl restart sockstoall-agent

# 7. uninstall script
cat > "$AGENT_DIR/uninstall.sh" <<'UNINSTALL'
#!/bin/bash
systemctl disable --now sockstoall-agent 2>/dev/null || true
rm -f /etc/systemd/system/sockstoall-agent.service
systemctl daemon-reload 2>/dev/null || true
systemctl reset-failed sockstoall-agent 2>/dev/null || true
rm -rf /opt/sockstoall-agent
echo "SocksToAll Agent uninstalled"
UNINSTALL
chmod +x "$AGENT_DIR/uninstall.sh"

sleep 2
systemctl status sockstoall-agent --no-pager || true

echo "[INFO] SocksToAll Agent installed"
echo "[INFO] Uninstall: bash $AGENT_DIR/uninstall.sh"
`;
}

// 安装脚本（公开，凭 token 访问）
agentInstallRoutes.get('/install.sh', (c) => {
  const token = c.req.query('token') || '';
  const server = token
    ? db.query.servers.findFirst({ where: eq(servers.agentToken, token) }).sync()
    : null;

  if (!server) {
    return c.text('echo "invalid token"; exit 1', 401);
  }

  const panelUrl = getPanelBaseUrl(c).replace(/\/$/, '');
  const script = renderInstallScript(panelUrl, token);
  return c.text(script, 200, { 'Content-Type': 'text/x-shellscript; charset=utf-8' });
});

// Agent 运行包（公开）
agentInstallRoutes.get('/agent.mjs', (c) => {
  try {
    const agentPath = new URL('./agent.mjs', import.meta.url);
    if (!existsSync(agentPath)) {
      return c.text('// agent.mjs not built', 404);
    }
    const content = readFileSync(agentPath, 'utf-8');
    return c.text(content, 200, { 'Content-Type': 'text/javascript; charset=utf-8' });
  } catch (error) {
    return c.text('// agent.mjs not available', 404);
  }
});
