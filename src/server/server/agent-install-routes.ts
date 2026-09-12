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
set -e

PANEL_URL="${panelUrl}"
AGENT_TOKEN="${token}"
AGENT_DIR="${AGENT_DIR}"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

echo "[INFO] Installing SocksToAll Agent..."

# 1. base deps
if command -v apt-get &>/dev/null; then
  apt-get update -y
  apt-get install -y curl wget unzip ca-certificates
elif command -v dnf &>/dev/null; then
  dnf install -y curl wget unzip ca-certificates
else
  yum install -y curl wget unzip ca-certificates
fi

# 2. Node.js 20+
if ! command -v node &>/dev/null; then
  echo "[INFO] Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

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
  unzip -q -o "$TMP/xray.zip" xray -d "$TMP"
  mv "$TMP/xray" "$AGENT_DIR/bin/xray"
  chmod +x "$AGENT_DIR/bin/xray"
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
ExecStart=/usr/bin/node $AGENT_DIR/agent.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable --now sockstoall-agent
systemctl restart sockstoall-agent
sleep 2
systemctl status sockstoall-agent --no-pager || true

echo "[INFO] SocksToAll Agent installed"
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
