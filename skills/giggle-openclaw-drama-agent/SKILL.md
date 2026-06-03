# SKILL: giggle-openclaw-drama-agent

> **AI 短剧全自动制作 + 发布 Agent**  
> 用户输入一句创意 → AI 命名 → 剧本生成 → Giggle 分镜/视频制作 → X2C 平台发布 → 收益追踪

---

## 快速上手

```bash
# 1. 克隆仓库
git clone https://github.com/Free-HW/ai-drama-company.git
cd ai-drama-company

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 GIGGLE_API_KEY、X2C_API_KEY、OPENCLAW_GATEWAY_PASSWORD 等

# 4. 初始化数据库
node skills/giggle-openclaw-drama-agent/scripts/init_db.js

# 5. 启动服务
node skills/giggle-openclaw-drama-agent/scripts/server.js
# 或使用 systemd（推荐生产环境）
sudo systemctl enable --now ai-drama-company.service

# 6. 访问 Dashboard
open http://localhost:3000
```

---

## 目录结构

```
ai-drama-company/
├── skills/
│   ├── giggle-openclaw-drama-agent/    ← 核心 Agent
│   │   ├── SKILL.md                    ← 本文件
│   │   ├── assets/
│   │   │   ├── dashboard.html          # 前端大屏（单文件 SPA）
│   │   │   └── app.js                  # 前端逻辑（轮询/控制台/弹窗）
│   │   └── scripts/
│   │       ├── server.js               # Express HTTP 服务 + API 路由
│   │       ├── agent.js                # 核心制作 Agent（Phase1/Phase2）
│   │       ├── giggleClient.js         # Giggle API 封装
│   │       ├── x2cPublish.js           # X2C 发布 + 钱包 API 封装
│   │       ├── db.js                   # SQLite 数据库操作
│   │       ├── generate_script.js      # 剧本生成子进程（独立运行）
│   │       └── init_db.js              # 初始化数据库表结构
│   └── x2c-publish/                    ← X2C 发布辅助 Skill
│       ├── SKILL.md
│       ├── README.md
│       ├── config.json
│       └── scripts/x2c-publish.js
├── outputs/
│   ├── drama_agent.db                  # SQLite 数据库（本地存储）
│   └── logs/
├── .env.example                        ← 环境变量模板
├── ai-drama-company.service            ← systemd 服务文件
├── package.json
└── README.md
```

---

## 环境变量（.env）

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `PORT` | — | 服务端口，默认 `3000` | `3000` |
| `GIGGLE_BASE_URL` | ✅ | Giggle API 地址 | `https://giggle.pro` |
| `GIGGLE_API_KEY` | ✅ | Giggle 平台 API Key | `gig_sk_xxx` |
| `GIGGLE_AUTH_MODE` | — | 认证方式，默认 `x-auth` | `x-auth` |
| `OPENCLAW_GATEWAY_URL` | ✅ | OpenClaw Gateway 地址 | `http://localhost:18789` |
| `OPENCLAW_GATEWAY_PASSWORD` | ✅ | Gateway 认证密码 | `xxxxx` |
| `X2C_API_KEY` | ✅ | X2C 平台 API Key | `x2c_sk_xxx` |
| `X2C_API_URL` | — | X2C API 地址 | `https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api` |
| `STORYCLAW_API_KEY` | ✅ | StoryClaw LLM API Key（用于 AI 命名） | `xxx` |
| `STORYCLAW_API_URL` | — | StoryClaw LLM API 地址 | `https://llm-ap.gqapi.com` |
| `POLL_INTERVAL_MS` | — | 轮询间隔，默认 `5000` | `5000` |
| `POLL_TIMEOUT_MS` | — | 全局轮询超时，默认 `3600000`（60分钟） | `3600000` |

---

## systemd 部署（Linux 生产环境）

```bash
# 复制服务文件
sudo cp ai-drama-company.service /etc/systemd/system/

# 启用并启动
sudo systemctl daemon-reload
sudo systemctl enable ai-drama-company
sudo systemctl start ai-drama-company

# 查看状态
sudo systemctl status ai-drama-company

# 查看日志
tail -f ~/.claw/ai-drama.log
```

服务文件内容见仓库根目录 `ai-drama-company.service`。

---

## Dashboard 访问

### 本地访问
服务启动后，访问 `http://localhost:3000`。

### 外网访问（ClawLN 隧道，推荐）

本系统通过 **StoryClaw ClawLN** 内置隧道提供外网访问，无需任何额外配置：

1. 安装并启动 [OpenClaw](https://openclaw.ai)
2. 运行 `node setup.js`，脚本自动读取你的设备 ID 并输出外网链接
3. 访问链接格式：`https://device-{你的设备ID}.clawln.app`

```bash
node setup.js
# 输出示例：
# ✓ 外网访问：https://device-sco1s33iohwj.clawln.app
```

**前提**：OpenClaw Gateway 保持运行（`openclaw gateway status` 查看状态）。

> **原理**：OpenClaw 为每台设备分配唯一的 `fqdn`（存储在 `~/.openclaw/device-info.json`），  
> ClawLN 云代理自动将 `device-{fqdn}.clawln.app` 反向代理到你本机的 Gateway 端口。  
> 设备 ID 固定不变，链接永久有效，无需配置 DNS 或防火墙。

---

## 完整制作流程

```
用户输入创意
    ↓
POST /api/agent/projects
    ├── [Step 0] 立刻创建 script_run_id（前端控制台即时响应）
    ├── [Step 1] AI 智能命名（claude-sonnet-4-6，约3秒）
    ├── [Step 2] LLM 智能匹配 Giggle 风格（7种）
    └── [Step 3] 后台子进程：generate_script.js（逐集生成剧本）

剧本生成完成（status=planned）→ 自动触发流水线：

POST /api/agent/projects/:uuid/auto-run
    ├── Phase 1（串行 EP1→EP2→...→EPn）
    │   ├── Giggle 创建项目（giggle_project_id）
    │   ├── 剧本扩写（storyExpansion）
    │   ├── 角色生成（新角色上传，同名角色复用）
    │   └── 分镜列表 + 分镜图（失败自动重试）
    │
    ├── Phase 2（串行 EP1→EP2→...→EPn）
    │   ├── 提示词优化
    │   ├── 批量视频生成（失败自动重试，最多3轮）
    │   ├── 视频导出（export_url + cover_url 写入 DB）
    │   └── 清理 Giggle 角色库
    │
    └── X2C 自动发布
        ├── 获取 S3 预签名上传 URL（1 cover + N videos）
        ├── 流式上传视频到 X2C S3
        └── 提交发布（distribution/publish）
```

---

## 核心 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `GET` | `/` | Dashboard 前端 |
| `POST` | `/api/agent/projects` | 创建项目（异步生成剧本） |
| `GET` | `/api/agent/projects` | 项目列表 |
| `GET` | `/api/agent/projects/:uuid` | 项目详情（含集列表） |
| `DELETE` | `/api/agent/projects/:uuid` | 删除项目 |
| `POST` | `/api/agent/projects/:uuid/auto-run` | **全自动流水线** |
| `POST` | `/api/agent/projects/:uuid/episodes/:no/run` | 单集手动触发/重试 |
| `POST` | `/api/agent/projects/:uuid/regenerate-script` | 重新生成剧本 |
| `POST` | `/api/agent/projects/:uuid/publish-x2c` | 手动发布到 X2C（异步） |
| `GET` | `/api/agent/projects/:uuid/video-stats` | X2C 视频分发统计 |
| `GET` | `/api/agent/status/:runId?since_id=N` | 制作进度 + 增量日志 |
| `GET` | `/api/agent/projects/:uuid/shots?episode_no=N` | 分镜列表（实时） |
| `GET` | `/api/x2c/balance` | X2C 钱包余额 |
| `GET` | `/api/x2c/wallet/transactions` | 钱包交易记录（收益/消费） |
| `GET` | `/api/x2c/projects` | X2C 已发布项目列表 |

---

## 数据库表结构

| 表名 | 说明 |
|------|------|
| `story_projects` | 项目主表，含 `x2c_project_id`、`x2c_status`、`style_id` |
| `project_episodes` | 各集，含 `giggle_project_id`、`script_text`、`export_url`、`cover_url` |
| `story_characters` | 全剧角色（按 `project_uuid + name` 唯一，EP2+ 复用） |
| `project_characters` | 集级角色展示 |
| `character_mappings` | Giggle 角色映射 |
| `runs` | 制作任务记录 |
| `run_logs` | 实时日志（前端控制台增量轮询） |
| `project_bibles` | 项目世界观/风格设定 |

---

## 关键设计决策

| 决策 | 说明 |
|------|------|
| 角色一致性 | `story_characters` 按 `(project_uuid, name)` 唯一，EP2+ 同名角色复用 EP1 形象 |
| 分镜不缓存 | 分镜从 Giggle 实时拉取，避免同步问题 |
| 全剧风格统一 | 新建项目时 LLM 智能匹配 7 种 Giggle 风格，存 `style_id`，全剧复用 |
| 串行命名再生成 | AI 命名（Claude，约3秒）完成后才触发剧本生成，确保项目名称正确 |
| 失败重试 | 分镜图/视频：自动重试，最多 3 轮 |
| 角色库清理 | 全剧完成后自动删除 Giggle 角色库中该剧角色，防跨项目污染 |
| S3 上传 | X2C 发布走完整上传流程（upload-url → HTTP PUT → publish），不直接传 Giggle 临时链接 |
| 即时日志 | 项目创建后立刻创建 runId，所有阶段（命名/剧本/制作/发布）日志连续写入同一 run |

---

## 技术栈

| 组件 | 说明 |
|------|------|
| Node.js ≥ 18 | 运行时 |
| Express 5 | HTTP 服务 |
| better-sqlite3 | 本地 SQLite（同步 API） |
| OpenClaw Gateway | LLM 接口（剧本/风格匹配） |
| StoryClaw LLM API | 项目 AI 命名（claude-sonnet-4-6） |
| Giggle API | 角色/分镜/视频制作 |
| X2C API | 视频发布 + 钱包管理 |
