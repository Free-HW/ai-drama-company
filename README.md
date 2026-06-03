# AI Drama Company — AI 全自动短剧制作系统

> 一句创意 → AI 命名 → 剧本生成 → Giggle 分镜/视频制作 → X2C 平台发布 → 收益追踪

## 快速开始

```bash
git clone https://github.com/Free-HW/ai-drama-company.git
cd ai-drama-company
npm install
cp .env.example .env   # 填入 API Keys
node skills/giggle-openclaw-drama-agent/scripts/init_db.js
node skills/giggle-openclaw-drama-agent/scripts/server.js
# 访问 http://localhost:3000
```

## 生产部署（systemd）

```bash
sudo cp ai-drama-company.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ai-drama-company
```

## 目录说明

- `skills/giggle-openclaw-drama-agent/` — 核心制作 Agent（Express + SQLite）
- `skills/x2c-publish/` — X2C 发布辅助 Skill
- `outputs/` — 数据库 + 日志
- `.env.example` — 环境变量模板
- `ai-drama-company.service` — systemd 服务文件

详细文档见 [skills/giggle-openclaw-drama-agent/SKILL.md](skills/giggle-openclaw-drama-agent/SKILL.md)
