# Xray 独立升级实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans（内联执行）。

**目标：** 为管理员提供 Xray 新版本检测与安全升级入口，并保证升级失败自动回滚。

**架构：** Xray 继续作为 SocksToAll 进程管理的本地二进制运行。升级服务从 GitHub Releases 获取版本信息，下载到临时目录，校验版本后原子替换 `bin/xray`，启动失败自动恢复备份。前端仅对管理员展示更新状态和升级按钮。

**技术栈：** Hono、Node.js `fetch`、文件原子替换、React、Ant Design、GitHub Releases API。

---

### 任务 1：修复发布包中的 better-sqlite3 部署方式

**文件：**
- 修改：`.github/workflows/release.yml`
- 修改：`install.sh`
- 修改：`package.json`

- [ ] 删除 CI 生成的原生 `better-sqlite3` 文件复制逻辑，避免宿主机 ABI 不匹配。
- [ ] 安装脚本安装 `build-essential` 和 `python3`，并在服务器执行 `npm install --omit=dev --build-from-source=better-sqlite3`。
- [ ] 版本更新至 `1.5.5`。
- [ ] 运行 `git diff --check`、`npx tsc --noEmit`、`npm run build:release`。
- [ ] 提交 `fix(发布): 修复 better-sqlite3 原生依赖部署`。

### 任务 2：实现 Xray 版本检测与安全升级服务

**文件：**
- 修改：`src/server/xray/service.ts`
- 修改：`src/server/xray/routes.ts`

- [ ] 增加 GitHub Releases API 查询，解析当前平台架构对应的 `Xray-linux-*.zip` 资产。
- [ ] 增加版本比较、短时缓存和升级互斥锁。
- [ ] 下载到临时目录，解压并执行新二进制的 `version` 校验。
- [ ] 停止运行中的 Xray，备份旧二进制，原子替换并启动。
- [ ] 启动失败时恢复备份并重新启动旧版本。
- [ ] 新增管理员保护的 `GET /xray/update` 和 `POST /xray/update`。
- [ ] 非管理员请求返回 `403`。

### 任务 3：增加管理员升级入口

**文件：**
- 修改：`src/client/api/client.ts`
- 修改：`src/client/pages/Dashboard.tsx`
- 修改：`src/client/hooks/useAuth.tsx`

- [ ] 从 `/auth/me` 获取管理员身份，不以普通用户可控的前端字段作为权限依据。
- [ ] 管理员加载 Dashboard 时查询更新状态。
- [ ] 仅在 `updateAvailable` 为真时显示升级按钮。
- [ ] 升级期间禁用按钮，成功后刷新版本与运行状态。
- [ ] 普通用户不显示升级状态和升级按钮。

### 任务 4：验证与发布

**文件：**
- 修改：`package.json`

- [ ] 运行 `git diff --check`。
- [ ] 运行 `npx tsc --noEmit`。
- [ ] 运行 `npm run build:release`。
- [ ] 检查工作区只包含本次文件。
- [ ] 发布新版本并推送对应 tag。
