# AI Drama Company Agent — BOOTSTRAP.md

## 概述

AI Drama Company 是一个基于 OpenClaw 的 AI 短剧生产 Agent。用户输入一句创意，系统自动调用 LLM 生成完整多集剧本，并通过 Giggle API 完成角色、分镜、视频制作全流程。

---

## 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 18 | 运行 server.js |
| OpenClaw Gateway | 任意 | 提供 LLM 接口 |
| Giggle API Key | — | 视频制作平台 |

---

## 安装步骤

### 1. 克隆仓库

```bash
git clone https://github.com/Free-HW/ai-drama-company.git
cd ai-drama-company
npm install
```

> ⚠️ 系统自带的 `sqlite3` 包可能与 glibc 版本不兼容，安装脚本已自动替换为 `better-sqlite3`。
> 如遇 `GLIBC_2.38 not found` 错误，手动执行：
> ```bash
> npm install better-sqlite3
> ```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入以下字段：

```env
PORT=3001
GIGGLE_BASE_URL=https://giggle.pro
GIGGLE_API_KEY=你的_Giggle_API_Key
GIGGLE_AUTH_MODE=x-auth

# OpenClaw Gateway（用于 AI 剧本生成）
OPENCLAW_GATEWAY_URL=http://localhost:18789
OPENCLAW_GATEWAY_PASSWORD=你的_Gateway_密码
```

**获取 Gateway 密码：**
```bash
cat ~/.openclaw/openclaw.json | python3 -c "import json,sys; print(json.load(sys.stdin)['gateway']['auth']['password'])"
```

### 3. 启用 OpenClaw Gateway LLM 接口

在 `~/.openclaw/openclaw.json` 中添加：

```json
{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  }
}
```

然后重启 Gateway：
```bash
openclaw gateway restart
```

验证：
```bash
curl http://localhost:18789/v1/models -H "Authorization: Bearer 你的密码"
```

### 4. 初始化数据库

```bash
npm run db:init
```

### 5. 启动服务

```bash
npm start
# 或开发模式（需安装 nodemon）
npm run dev
```

访问 `http://localhost:3001`

### 6. 配置 systemd 自动重启（推荐）

```bash
sudo tee /etc/systemd/system/ai-drama-company.service << 'EOF'
[Unit]
Description=AI Drama Company Agent
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/ai-drama-company
EnvironmentFile=/path/to/ai-drama-company/.env
ExecStart=/usr/bin/node skills/giggle-openclaw-drama-agent/scripts/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ai-drama-company.service
```

### 7. 公网访问（可选）

使用 Cloudflare Tunnel 暴露服务：

```bash
# 临时隧道（地址每次重启会变）
cloudflared tunnel --url http://localhost:3001

# 永久隧道（需要 Cloudflare 账号）
cloudflared tunnel create ai-drama
cloudflared tunnel route dns ai-drama your-domain.com
```

---

## 已知问题与修复记录

| 问题 | 根因 | 修复方案 |
|------|------|---------|
| `sqlite3` GLIBC 不兼容 | 预编译包依赖 glibc 2.38 | 替换为 `better-sqlite3`，`db.js` 已适配同步 API |
| `GET /` 返回 404 | Express 5 `sendFile` 需要 `root` 选项 | 改为 `res.sendFile('dashboard.html', { root: assetsDir })` |
| 剧本生成为模板占位内容 | 原 `buildEpisodePlan` 为硬编码模板 | 改为调用 OpenClaw Gateway LLM 生成真实剧本 |
| Giggle `storyExpansion` 只支持单集 | API 限制 | 不使用该接口，改用本地 LLM |

---

## 核心架构

```
用户输入创意
    ↓
POST /api/agent/projects
    ↓ 立即返回 status=generating
后台异步调用 buildEpisodePlanAI()
    ↓
调用 OpenClaw Gateway /v1/chat/completions
    ↓ LLM 生成完整多集剧本（JSON 格式）
写入 SQLite project_episodes 表
    ↓ status=planned
前端每 5 秒轮询，自动刷新显示剧本
```

### 剧本生成降级策略

1. **优先**：调用 OpenClaw Gateway LLM（`openclaw` 模型）
2. **降级**：`buildLocalScriptFallback()` 生成结构化占位剧本

---

## API 接口说明

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/api/agent/projects` | 创建项目，异步生成剧本 |
| GET | `/api/agent/projects` | 列出所有项目 |
| GET | `/api/agent/projects/:uuid` | 获取项目详情（含集列表） |
| POST | `/api/agent/projects/:uuid/auto-run` | **全剧自动流水线**（推荐） |
| POST | `/api/agent/projects/:uuid/episodes/:no/run` | 单集手动触发 |
| POST | `/api/agent/projects/:uuid/regenerate-script` | 重新生成剧本 |
| GET | `/api/agent/projects/:uuid/shots?episode_no=N` | 获取某集分镜（实时从 Giggle 拉取） |
| GET | `/api/agent/status/:runId?since_id=N` | 查询制作进度 + 增量日志 |

---

## 前端功能

- 创建项目后自动轮询剧本生成状态
- 每个分集卡片支持点击「📄 查看剧本」弹窗展示完整剧本
- 剧本生成中显示等待提示，完成后自动刷新

---

## 当前功能状态

- [x] LLM 智能生成多集剧本（逐集写 DB，实时进度）
- [x] 全自动流水线（Phase1 串行分镜图 → Phase2 串行视频导出）
- [x] 角色跨集一致性（story_characters 表复用）
- [x] 全剧风格统一（LLM 智能匹配 Giggle 7 种风格）
- [x] 失败重试（分镜图/分镜视频均自动重试）
- [x] 全剧完成后清理角色库
- [x] 前端实时控制台 + 剧集详情弹窗
