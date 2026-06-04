# USER — 使用说明

## 适合人群
- 短剧内容创作者
- 希望低成本批量生产 AI 短剧的独立创业者（OPC）
- 需要将短剧自动分发到 X2C 平台获得收益的运营者

---

## 快速开始

### 1. 环境准备
```bash
# 安装依赖
npm install

# 复制环境变量模板并填写
cp .env.example .env
```

### 2. `.env` 必填项

| 变量名 | 说明 | 获取方式 |
|--------|------|----------|
| `GIGGLE_API_KEY` | Giggle 视频制作 API Key | Giggle 开发者后台 |
| `X2C_API_KEY` | X2C 平台发布 API Key | X2C 平台设置 |
| `OPENCLAW_GATEWAY_PASSWORD` | OpenClaw Gateway 密码 | OpenClaw 配置 |
| `OPENCLAW_GATEWAY_URL` | Gateway WebSocket 地址 | OpenClaw 配置 |
| `ANTHROPIC_API_KEY` | Claude LLM API Key（可选，有 StoryClaw 则留空） | Anthropic Console |

### 3. 初始化并启动
```bash
# 初始化数据库
npm run db:init

# 启动服务
npm start

# 访问 Dashboard
open http://localhost:3000
```

### 4. 生产环境（systemd）
```bash
# 复制服务文件
sudo cp ai-drama-company.service /etc/systemd/system/
# 修改 WorkingDirectory 为实际路径
sudo nano /etc/systemd/system/ai-drama-company.service

sudo systemctl daemon-reload
sudo systemctl enable --now ai-drama-company.service
```

---

## 使用流程

1. 打开 Dashboard（`http://localhost:3000`）
2. 点击「新建项目」，输入一句创意描述（如："霸道总裁爱上平凡女孩"）
3. Agent 自动开始：命名 → 剧本生成 → 视频制作
4. 制作完成后点击「发布到 X2C」，或开启自动发布
5. 在右侧「收益明细」面板查看 X2C 平台收益

---

## 注意事项
- 视频制作耗时较长（每集约 10–30 分钟），请耐心等待控制台日志
- 服务重启会中断进行中的任务，需手动在 Dashboard 重新触发
- X2C 发布审核通常需要 1–3 个工作日
- `.env` 文件包含私钥，**请勿提交到 Git**（已加入 `.gitignore`）
