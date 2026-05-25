# AI Drama Company — Agent 操作规范

## Agent 定位

AI Drama Company 是一个 AI 短剧一站式生产 Agent，核心能力：
- 用户输入一句创意 → LLM 生成完整多集剧本
- 通过 Giggle API 完成角色、分镜、视频制作
- Dashboard 实时展示生产进度

---

## ⚠️ 关键约束

1. **剧本生成必须调用 OpenClaw Gateway LLM**，不得使用 Giggle `storyExpansion`（该接口仅支持单集且存在问题）
2. **Giggle 接口以开发者提供的文档为准**，不得自行猜测接口参数
3. **数据库操作使用 `better-sqlite3`**，不得切换回 `sqlite3`（glibc 兼容性问题）
4. **所有修改必须同步更新本文档**，确保其他用户安装后可直接使用

---

## 技术栈

| 层 | 技术 |
|----|------|
| 运行时 | Node.js ≥ 18 |
| Web 框架 | Express 5 |
| 数据库 | SQLite（better-sqlite3） |
| LLM | OpenClaw Gateway `/v1/chat/completions` |
| 视频制作 | Giggle Open API |
| 前端 | 原生 HTML/JS（dashboard.html + app.js） |

---

## 核心文件说明

```
skills/giggle-openclaw-drama-agent/
├── scripts/
│   ├── server.js        # Express 服务主入口，所有 API 路由
│   ├── db.js            # SQLite 数据库操作（better-sqlite3 适配版）
│   ├── agent.js         # DramaAgent：Giggle 工作流执行器
│   ├── giggleClient.js  # Giggle API 封装客户端
│   └── init_db.js       # 数据库初始化脚本
└── assets/
    ├── dashboard.html   # 前端主页面
    └── app.js           # 前端逻辑（项目列表、剧本弹窗、进度轮询）
```

---

## 剧本生成逻辑（server.js）

### `buildEpisodePlanAI({ idea, episodeCount })`

调用 OpenClaw Gateway LLM 生成真实剧本：

```
POST http://localhost:18789/v1/chat/completions
Authorization: Bearer {OPENCLAW_GATEWAY_PASSWORD}
model: "openclaw"
```

Prompt 要求 LLM 输出严格 JSON：
```json
{"episodes":[{"episode_no":1,"title":"...","outline":"...","script":"完整剧本"},...]}
```

**降级策略**：LLM 调用失败时，`buildLocalScriptFallback()` 生成结构化占位剧本。

### `POST /api/agent/projects` 异步流程

1. 立即创建项目记录，`status=generating`，返回响应
2. 后台 `(async()=>{})()` 调用 `buildEpisodePlanAI`
3. 生成完成后写入 `project_episodes`，`status=planned`
4. 前端每 5 秒轮询 `/api/agent/projects/:uuid` 自动刷新

---

## 前端剧本弹窗（app.js）

- `window._currentEpisodes`：当前项目的分集数据缓存
- `showScriptModal(e, epNo)`：弹出全屏 Modal 展示完整 `script_text`
- 每个 EP 卡片有「📄 查看剧本」和「▶ 生产」两个按钮

---

## 环境变量说明（.env）

| 变量 | 必填 | 说明 |
|------|------|------|
| `PORT` | 否 | 服务端口，默认 3001（避免与 x2creel 的 3000 冲突） |
| `GIGGLE_BASE_URL` | ✅ | Giggle API 地址，如 `https://giggle.pro` |
| `GIGGLE_API_KEY` | ✅ | Giggle API Key |
| `GIGGLE_AUTH_MODE` | 否 | 认证方式，默认 `x-auth` |
| `OPENCLAW_GATEWAY_URL` | ✅ | OpenClaw Gateway 地址，如 `http://localhost:18789` |
| `OPENCLAW_GATEWAY_PASSWORD` | ✅ | Gateway 密码，用于 LLM 调用 |

---

## 已知问题与修复记录

### 2026-05-25

| 问题 | 根因 | 修复 |
|------|------|------|
| `sqlite3` 安装失败（GLIBC_2.38） | 预编译包依赖新版 glibc | `db.js` 全量重写为 `better-sqlite3` 同步 API，对外保持异步接口不变 |
| `GET /` 返回 500 Not Found | Express 5 `sendFile` 行为变更 | 改为 `res.sendFile(file, { root: dir })` |
| 剧本为硬编码模板 | `buildEpisodePlan` 使用固定文案 | 替换为 `buildEpisodePlanAI`，调用 OpenClaw Gateway LLM |
| Giggle `storyExpansion` 不可用 | 接口仅支持单集，且存在问题 | 完全弃用，改用本地 LLM |
| Gateway chatCompletions 未启用 | 默认关闭 | `openclaw.json` 加 `gateway.http.endpoints.chatCompletions.enabled=true` |

---

## Giggle API 接口状态（持续更新）

> ⚠️ Giggle 接口由开发者逐步提供和验证，以下为当前已知状态：

| 接口 | 状态 | 备注 |
|------|------|------|
| `POST /api/v1/project/create` | ✅ 可用 | 创建项目 |
| `POST /api/v1/script/storyExpansion` | ❌ 问题 | 仅支持单集，不使用 |
| `POST /api/v1/character/generate` | 待验证 | — |
| `POST /api/v1/storyboard/auto-generate` | 待验证 | — |
| `POST /api/v1/storyboard/auto-generate-video` | 待验证 | — |
| `POST /api/v1/video-edit/export-entire-film` | 待验证 | — |

---

## 上架市场 Checklist

- [x] `BOOTSTRAP.md` 完整安装文档
- [x] `.env.example` 配置模板
- [x] `db.js` 兼容性修复（better-sqlite3）
- [x] AI 剧本生成（OpenClaw Gateway LLM）
- [x] 剧本弹窗查看功能
- [ ] Giggle 视频制作完整工作流验证
- [ ] README.md 更新截图
- [ ] 一键安装脚本
