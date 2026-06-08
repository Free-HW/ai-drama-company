# AI Drama Company — Agent 操作规范

## 🚀 启动初始化（每次对话开始必须立即执行，不等用户提问）

### Step 1 — 检查服务
```bash
curl -s http://localhost:3000/health
```
返回 `{"ok":true}` 继续；失败则提示用户启动服务。

### Step 2 — 读取外网地址（必须输出）
```bash
cat ~/.openclaw/device-info.json
```
从 `fqdn` 构建外网地址：`https://device-{fqdn}.clawln.app`

**必须同时展示：**
- 本地地址：`http://localhost:3000`
- 外网地址：`https://device-{fqdn}.clawln.app`

### Step 3 — 检查 API Keys
检查 `~/.openclaw/workspace-ai-drama-company/.env` 中以下变量是否已填写（非占位符）：
- `GIGGLE_BASE_URL`（Giggle API 地址，例如 https://api.giggle.pro）
- `GIGGLE_API_KEY`（Giggle 视频制作，来自 giggle.pro 开发者后台）
- `X2C_API_KEY`（X2C 平台发布，来自 X2C 账号设置）
- `OPENCLAW_GATEWAY_PASSWORD`（OpenClaw Gateway 密码）
- `STORYCLAW_API_KEY`（StoryClaw LLM，用于 AI 命名）

任意未配置则逐项询问用户填写，写入 `.env`，重启服务。

### Step 4 — 检查数据库
```bash
ls ~/.openclaw/workspace-ai-drama-company/outputs/drama_agent.db
```
不存在则执行：`node skills/giggle-openclaw-drama-agent/scripts/init_db.js`

### Step 5 — 输出就绪信息
```
✅ AI Drama Company 已就绪

📺 Dashboard 访问地址：
   本地：http://localhost:3000
   外网：https://device-{fqdn}.clawln.app  ← 任何设备均可访问

🎬 直接告诉我一句创意开始制作，例如："霸道总裁爱上灰姑娘，共10集"
```

---

## Agent 定位

AI Drama Company 是一个 AI 短剧一站式生产 Agent，核心能力：
- 用户输入一句创意 → LLM 生成完整多集剧本
- 通过 Giggle API 完成角色、分镜、视频制作
- 自动发布到 X2C 短剧平台，追踪收益

---

## ⚠️ 首次使用必读

### 必须配置的 API Keys

| 变量 | 来源 | 必填 |
|------|------|------|
| `GIGGLE_BASE_URL` | Giggle 文档（例: https://api.giggle.pro） | ✅ |
| `GIGGLE_API_KEY` | [giggle.pro](https://giggle.pro) 开发者后台 | ✅ |
| `X2C_API_KEY` | https://x2creel.ai/ → 个人中心 | ✅ |
| `OPENCLAW_GATEWAY_PASSWORD` | OpenClaw 设置页 | ✅ |
| `STORYCLAW_API_KEY` | StoryClaw 账号设置（AI命名） | ✅ |

**初次对话时 Agent 会自动引导你填写，无需手动编辑 `.env`**

### 服务启动

安装完成后，需要手动启动服务（或通过 systemd 开机自启）：

```bash
# 方式一：直接启动
cd ~/.openclaw/workspace-ai-drama-company
npm install
node skills/giggle-openclaw-drama-agent/scripts/server.js

# 方式二：systemd（Linux 推荐，防止进程被 kill）
sudo cp ai-drama-company.service /etc/systemd/system/
# 编辑服务文件，把 storyclaw 替换为你的用户名，路径改为实际安装路径
sudo nano /etc/systemd/system/ai-drama-company.service
sudo systemctl daemon-reload
sudo systemctl enable --now ai-drama-company.service
```

### 数据库初始化

```bash
node skills/giggle-openclaw-drama-agent/scripts/init_db.js
```

---

## ⚠️ 关键约束

1. **剧本生成调用 OpenClaw Gateway LLM**，降级时使用内置模板
2. **Giggle 接口以开发者提供的文档为准**，不自行猜测接口参数
3. **数据库操作使用 `better-sqlite3`**，不得切换回 `sqlite3`（glibc 兼容性问题）
4. **服务使用 systemd 部署**，必须配置 `OOMScoreAdjust=-1000` 防止进程被 kill

---

## 技术栈

| 层 | 技术 |
|----|------|
| 运行时 | Node.js ≥ 18 |
| Web 框架 | Express 5 |
| 数据库 | SQLite（better-sqlite3） |
| LLM | OpenClaw Gateway / StoryClaw API |
| 视频制作 | Giggle Open API |
| 前端 | 原生 HTML/JS（dashboard.html + app.js） |
| 外网穿透 | OpenClaw ClawLN（`device-{fqdn}.clawln.app`） |

---

## 核心文件说明

```
skills/giggle-openclaw-drama-agent/
├── scripts/
│   ├── server.js          # Express 服务主入口，所有 API 路由
│   ├── db.js              # SQLite 数据库操作（better-sqlite3）
│   ├── agent.js           # DramaAgent：Giggle 工作流执行器
│   ├── giggleClient.js    # Giggle API 封装客户端
│   ├── generate_script.js # 剧本生成独立进程
│   ├── x2cPublish.js      # X2C 发布流程
│   └── init_db.js         # 数据库初始化脚本
└── assets/
    ├── dashboard.html     # 前端主页面
    └── app.js             # 前端逻辑
```

---

## 外网访问

服务通过 **OpenClaw ClawLN** 提供外网穿透，无需额外配置：

- 外网地址：`https://device-{fqdn}.clawln.app`
- `fqdn` 来自 `~/.openclaw/device-info.json`
- 需要 OpenClaw Gateway 运行中才有效

---

## 系统稳定性配置

视频制作是长时间运行任务（每集 10-30 分钟），必须确保进程不被系统 kill：

**systemd 服务必须包含：**
```ini
OOMScoreAdjust=-1000    # 防止 OOM Killer 杀进程
MemoryMax=infinity       # 不限制内存
LimitNOFILE=65536        # 提高文件描述符上限
TimeoutStopSec=300       # 停止前等待 5 分钟
```

**如果进程频繁被 SIGKILL**：
1. 检查内存使用：`free -h`
2. 检查 OOM 日志：`dmesg | grep -i "killed process"`
3. 确认服务文件包含上述配置

---

## 已知问题与修复记录

| 日期 | 问题 | 修复 |
|------|------|------|
| 2026-05 | `sqlite3` 安装失败（GLIBC_2.38） | 改用 `better-sqlite3` |
| 2026-05 | Giggle `storyExpansion` 不可用 | 改用 OpenClaw Gateway LLM |
| 2026-06 | X2C 发布需要 S3 上传流程 | 完整实现：upload-url → PUT → publish |
| 2026-06 | AI 命名 API Key 硬编码 | 改为读取 `STORYCLAW_API_KEY` 环境变量 |
| 2026-06 | 进程被 OOM Killer kill | systemd 加 `OOMScoreAdjust=-1000` |
