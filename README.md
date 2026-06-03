# AI Drama Company — AI 全自动短剧制作系统

> 一句创意 → AI 命名 → 剧本生成 → Giggle 分镜/视频制作 → X2C 平台发布 → 收益追踪

## 一键安装

```bash
git clone https://github.com/Free-HW/ai-drama-company.git
cd ai-drama-company
npm install
node setup.js   # 交互式配置 API Keys，自动输出 Dashboard 外网链接
```

安装完成后输出示例：

```
✓ 外网访问：https://device-xxxxxxxx.clawln.app
```

打开链接即可使用，无需任何额外网络配置。

## 前提条件

- Node.js ≥ 18
- [OpenClaw](https://openclaw.ai) 已安装并运行（提供 ClawLN 外网隧道 + LLM）
- Giggle API Key（[giggle.pro](https://giggle.pro)）
- X2C API Key（[x2creel.ai](https://www.x2creel.ai)）

## 手动启动

```bash
# 开发模式
node skills/giggle-openclaw-drama-agent/scripts/server.js

# 生产模式（systemd，Linux）
sudo cp ai-drama-company.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now ai-drama-company
```

## 目录说明

| 路径 | 说明 |
|------|------|
| `skills/giggle-openclaw-drama-agent/` | 核心制作 Agent（Express + SQLite） |
| `skills/x2c-publish/` | X2C 发布辅助 Skill |
| `outputs/drama_agent.db` | 本地 SQLite 数据库 |
| `.env.example` | 环境变量模板 |
| `setup.js` | 一键安装配置脚本 |
| `ai-drama-company.service` | systemd 服务文件 |

详细文档 → [skills/giggle-openclaw-drama-agent/SKILL.md](skills/giggle-openclaw-drama-agent/SKILL.md)
