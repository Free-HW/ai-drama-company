# SKILL: giggle-openclaw-drama-agent

## 简介

**AI 短剧制作 Agent** — 用户输入一句创意，系统自动完成多集短剧从剧本到成片的全流程生产，输出可直接发布的视频文件。

依托 OpenClaw Gateway（LLM）生成剧本，调用 Giggle API 完成角色、分镜、视频制作。

---

## 技术栈

| 组件 | 说明 |
|------|------|
| Node.js ≥ 18 | 运行时 |
| Express 5 | HTTP 服务 |
| better-sqlite3 | 本地数据库（同步 API） |
| OpenClaw Gateway | LLM 接口（剧本生成） |
| Giggle API | 角色/分镜/视频制作 |

---

## 目录结构

```
skills/giggle-openclaw-drama-agent/
├── assets/
│   ├── dashboard.html     # 前端大屏（单文件 SPA）
│   └── app.js             # 前端逻辑（轮询、控制台、弹窗）
└── scripts/
    ├── server.js           # Express HTTP 服务 + 所有 API 路由
    ├── agent.js            # 核心制作 Agent（Phase1/Phase2）
    ├── giggleClient.js     # Giggle API 封装
    ├── db.js               # SQLite 数据库操作
    ├── generate_script.js  # 剧本生成子进程（独立运行）
    └── init_db.js          # 初始化数据库表结构
```

---

## 核心架构

```
用户输入创意
    ↓
POST /api/agent/projects
    ├── LLM 智能匹配 Giggle 风格（7 种）
    ├── 解析每集时长（支持"120秒/120分钟/s/min"）
    └── 后台子进程：generate_script.js（逐集生成剧本，写 DB）

剧本生成完成后（status=planned）：
    ↓
POST /api/agent/projects/:uuid/auto-run   ← 全自动流水线
    ├── Phase 1（串行，EP1→EP2→...→EPn）
    │   ├── Step 1: Giggle 创建项目  → 立即写 giggle_project_id
    │   ├── Step 2: 扩写剧本（storyExpansion）
    │   ├── Step 3: 生成角色图 + 角色一致性
    │   │   ├── 同名角色：add_by_library（复用已有形象）
    │   │   └── 新角色：upload → story_characters 表（只写一次）
    │   └── Step 4: 生成分镜列表 + 分镜图（失败自动重试）
    │
    └── Phase 2（串行，EP1→EP2→...→EPn）
        ├── Step 5: 优化视频提示词（轮询 prompt_status=completed）
        ├── Step 6: 批量生成分镜视频（失败分镜自动重试）
        ├── Step 7: 导出完整视频
        └── 全剧完成：删除角色库中该剧角色（防止跨项目污染）

也支持单集手动触发：
POST /api/agent/projects/:uuid/episodes/:no/run
    └── 调用 agent.run()（Phase1 + Phase2 顺序执行）
```

---

## 数据库表结构

| 表名 | 说明 |
|------|------|
| `story_projects` | 项目主表，含 `style_id`、`video_duration`、`episode_count` |
| `project_episodes` | 各集信息，含 `giggle_project_id`、`script_text`、`export_url`、`cover_url` |
| `story_characters` | 全剧角色表，`(story_project_uuid, name)` 唯一，存 `library_character_id` |
| `project_characters` | 集级角色展示表 |
| `character_mappings` | Giggle 角色映射 |
| `runs` | 每次制作任务记录 |
| `run_logs` | 实时日志（前端控制台轮询） |

---

## API 接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `POST` | `/api/agent/projects` | 创建项目，异步生成剧本 |
| `GET` | `/api/agent/projects` | 列出所有项目 |
| `GET` | `/api/agent/projects/:uuid` | 获取项目详情（含集列表） |
| `POST` | `/api/agent/projects/:uuid/auto-run` | **全剧自动流水线**（推荐） |
| `POST` | `/api/agent/projects/:uuid/episodes/:no/run` | 单集手动触发 |
| `POST` | `/api/agent/projects/:uuid/regenerate-script` | 重新生成剧本 |
| `GET` | `/api/agent/projects/:uuid/shots?episode_no=N` | 获取某集分镜（实时从 Giggle 拉取） |
| `GET` | `/api/agent/status/:runId?since_id=N` | 查询制作进度 + 增量日志 |

---

## 关键设计决策

| 决策 | 说明 |
|------|------|
| 角色一致性 | `story_characters` 表按 `(project_uuid, name)` 唯一，EP2+ 同名角色复用 EP1 形象 |
| 分镜不缓存 | 分镜从 Giggle 实时拉取，避免同步问题 |
| 全剧风格统一 | 新建项目时 LLM 智能匹配 7 种 Giggle 风格，存 `style_id`，全剧复用 |
| 时长解析 | 支持从创意文本提取时长（`120秒`/`120s`/`120分钟`/`120min`），有效值：60/120/180/240/300 |
| 失败重试 | 分镜图失败：自动重新生成；分镜视频失败：先优化提示词再重新生成 |
| 角色库清理 | 全剧完成后自动删除该项目在 Giggle 角色库中的角色，防止跨项目同名角色污染 |
| 逐集写 DB | 每步完成后立即写入（`giggle_project_id`/角色/导出 URL），中途失败不丢数据 |

---

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `GIGGLE_BASE_URL` | ✅ | `https://giggle.pro` |
| `GIGGLE_API_KEY` | ✅ | Giggle 平台 API Key |
| `GIGGLE_AUTH_MODE` | — | 默认 `x-auth` |
| `OPENCLAW_GATEWAY_URL` | ✅ | OpenClaw Gateway 地址（LLM） |
| `OPENCLAW_GATEWAY_PASSWORD` | ✅ | Gateway 认证密码 |
| `PORT` | — | 默认 `3000` |
| `POLL_INTERVAL_MS` | — | 轮询间隔，默认 `5000` |
| `POLL_TIMEOUT_MS` | — | 全局轮询超时，默认 `3600000`（60分钟） |

---

## 轮询超时说明

| 步骤 | 超时时间 |
|------|---------|
| 分镜列表生成 | 20 分钟 |
| 分镜图生成 | 20 分钟（失败重试同） |
| 提示词优化 | 20 分钟 |
| 视频生成 | 60 分钟（`POLL_TIMEOUT_MS`） |
| 视频导出 | 60 分钟（`POLL_TIMEOUT_MS`） |

---

## 前端功能

- 项目列表（左侧栏，可滚动）
- 实时控制台（braille spinner 动画，可滚动）
- 剧集卡片（封面图、状态徽标，4列布局）
- 剧集详情弹窗（剧本 / 角色 / 分镜 / 视频 四个 Tab）
- 页面刷新后自动恢复 running 任务的轮询
