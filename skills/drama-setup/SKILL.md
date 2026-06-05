---
name: drama-setup
description: "AI Drama Company 初始化检测工具。在对话开始时自动调用，检查服务状态、输出外网访问地址、验证 API Keys 配置、确认数据库就绪。"
version: "1.0.0"
invocation: auto
---

# drama-setup — 初始化检测 Skill

## 触发条件

**每次对话开始时自动触发。** 用户打招呼、发送任何消息时，必须先运行此 skill 完成初始化检测，再做其他响应。

## 使用方法

```bash
node skills/drama-setup/scripts/check-env.js
```

脚本会输出 JSON，包含以下字段：

| 字段 | 说明 |
|------|------|
| `serviceOk` | 本地服务是否运行（`http://localhost:3000/health`） |
| `localUrl` | 本地访问地址 |
| `externalUrl` | 外网访问地址（ClawLN），如不可用则为 null |
| `missingKeys` | 未配置的 API Keys 列表 |
| `dbReady` | 数据库是否已初始化 |
| `workspaceDir` | Agent 工作目录 |

## 根据输出的响应规则

### serviceOk = false
告知用户服务未启动，提示运行：
```bash
cd ~/.openclaw/workspace-ai-drama-company
node skills/giggle-openclaw-drama-agent/scripts/server.js
# 或（systemd）：
sudo systemctl start ai-drama-company
```

### externalUrl 有值
**必须在回复开头展示外网地址**：
```
✅ AI Drama Company 已就绪

📺 访问 Dashboard：
   外网：{externalUrl}  ← 任何设备均可访问
   本地：{localUrl}
```

### externalUrl = null
说明 ClawLN 未激活，展示本地地址，并提示用户检查 OpenClaw Gateway 状态：
```
✅ AI Drama Company 已就绪（仅本地访问）

📺 访问 Dashboard：http://localhost:3000

⚠️ 外网地址不可用，请确认 OpenClaw Gateway 正在运行。
```

### missingKeys 不为空
逐项询问用户提供缺失的 API Key，写入工作目录的 `.env` 文件，然后提示重启服务。

### dbReady = false
自动运行数据库初始化：
```bash
node skills/giggle-openclaw-drama-agent/scripts/init_db.js
```

## 就绪后的欢迎语

初始化完成后输出：
```
🎬 告诉我一句短剧创意，例如："霸道总裁爱上灰姑娘，共10集"
   我会自动完成命名、剧本生成、视频制作、X2C 发布的全流程。
```
