# AI Drama Company — Bootstrap（首次启动自动执行）

## 强制初始化流程

每次 Agent 被激活，**必须立即、自动执行以下全部步骤**，不等待用户提问，不跳过任何步骤。

---

### Step 1 — 检查服务状态

```bash
curl -s http://localhost:3000/health
```

- 返回 `{"ok":true}` → 继续 Step 2
- 连接失败 → 提示用户：服务未启动，请先运行 `npm start` 或 `sudo systemctl start ai-drama-company`

---

### Step 2 — 读取外网访问地址

```bash
cat ~/.openclaw/device-info.json
```

从 `fqdn` 字段构建外网地址：`https://device-{fqdn}.clawln.app`

**必须同时展示两个地址：**
- 本地地址：`http://localhost:3000`
- 外网地址：`https://device-{fqdn}.clawln.app`（来自 device-info.json）

如果 device-info.json 不存在，提示用户安装 OpenClaw 以获得外网访问能力。

---

### Step 3 — 检查 API Keys 配置

检查工作目录（`~/.openclaw/workspace-ai-drama-company/.env`）是否存在，以及以下必填项是否已填写（非占位符）：

| 变量 | 说明 |
|------|------|
| `GIGGLE_API_KEY` | Giggle 视频制作 Key，来自 giggle.pro 开发者后台 |
| `X2C_API_KEY` | X2C 发布平台 Key，来自 X2C 账号设置 |
| `OPENCLAW_GATEWAY_PASSWORD` | OpenClaw Gateway 密码 |
| `STORYCLAW_API_KEY` | StoryClaw LLM Key，用于 AI 命名 |

**如果任意 Key 未配置或值为占位符**（如 `your_xxx_key_here`）：
1. 逐项询问用户提供
2. 写入 `.env` 文件
3. 重启服务：`sudo systemctl restart ai-drama-company`

---

### Step 4 — 初始化数据库（新安装时）

检查 `outputs/drama_agent.db` 是否存在：

```bash
ls ~/.openclaw/workspace-ai-drama-company/outputs/drama_agent.db
```

不存在则执行：

```bash
cd ~/.openclaw/workspace-ai-drama-company && node skills/giggle-openclaw-drama-agent/scripts/init_db.js
```

---

### Step 5 — 输出初始化完成信息

以下格式展示给用户：

```
✅ AI Drama Company 已就绪

📺 Dashboard 访问地址：
   本地：http://localhost:3000
   外网：https://device-{fqdn}.clawln.app  ← 用这个地址在任何设备访问

🎬 开始你的第一部短剧：
   直接告诉我一句创意，例如："霸道总裁爱上灰姑娘，共10集"
   我会自动完成命名、剧本生成、视频制作、X2C发布的全流程。
```

---

## 重要说明

- 外网地址通过 **OpenClaw ClawLN** 提供，无需额外配置，只要 OpenClaw Gateway 在运行就有效
- 所有制作任务在后台异步执行，进度可在 Dashboard 实时查看
- 服务通过 systemd 守护，进程不会被系统 kill（已配置 `OOMScoreAdjust=-1000`）
