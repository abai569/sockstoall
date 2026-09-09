# SocksToAll

多协议代理节点管理 + SOCKS 转发面板

## 功能特性

- **节点管理**：创建本地代理节点（Shadowsocks / VMess / VLESS / SOCKS5）
- **链接导入**：支持 ss:// vmess:// vless:// 分享链接一键解析
- **转发规则**：选择节点作为入站，配置远程 SOCKS5 作为出站
- **Xray 管理**：一键启停 Xray-core，实时日志查看
- **用户认证**：JWT 登录，密码修改
- **Web 面板**：响应式 UI，支持桌面和移动端

## 快速开始

### 一键安装

```bash
# Linux / macOS
git clone https://github.com/your-repo/sockstoall.git
cd sockstoall
./install.sh

# Windows PowerShell
git clone https://github.com/your-repo/sockstoall.git
cd sockstoall
.\install.ps1
```

安装脚本会自动：
- 安装 Node.js 依赖
- 下载 Xray-core 到 bin/ 目录
- 初始化默认数据
- 构建前端

### 手动安装

```bash
# 1. 安装依赖
npm install

# 2. 下载 Xray-core
# 从 https://github.com/XTLS/Xray-core/releases 下载
# 放到 bin/ 目录

# 3. 构建
npm run build

# 4. 启动
npm start
```

### 开发模式

```bash
npm run dev
```

前端: http://localhost:5173
后端: http://localhost:3456

## 默认登录

- 用户名: `admin`
- 密码: `admin123`

**请登录后立即修改密码！**

## 使用流程

1. **创建节点**：在「节点管理」创建本地代理节点
   - 选择协议（SS / VMess / VLESS / SOCKS）
   - 配置端口、密码等参数
   - 或粘贴分享链接快速导入

2. **创建规则**：在「转发规则」创建转发规则
   - 选择入站节点
   - 配置出站 SOCKS5 服务器

3. **启动转发**：在规则列表点击「启动」
   - Xray 将按配置运行
   - 客户端连接本地节点即可转发到远程 SOCKS

## 技术栈

- **前端**: React 18 + Vite + Ant Design 5
- **后端**: Node.js + Hono
- **核心**: Xray-core
- **认证**: JWT + bcrypt

## 目录结构

```
sockstoall/
├── src/
│   ├── server/          # 后端
│   │   ├── auth/        # 认证模块
│   │   ├── node/        # 节点管理
│   │   ├── route/       # 转发规则
│   │   └── xray/        # Xray 管理
│   ├── client/          # 前端
│   │   ├── pages/       # 页面
│   │   ├── hooks/       # Hooks
│   │   └── api/         # API 客户端
│   └── shared/          # 共享类型
├── bin/                 # Xray 二进制
├── data/                # 运行时数据
└── scripts/             # 安装脚本
```

## License

MIT
