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
| `STORYCLAW_API_KEY` | StoryClaw LLM Key | StoryClaw 账号设置 |

### 3. 初始化并启动
```bash
# 初始化数据库
npm run db:init

# 启动服务
npm start
```

### 4. 访问 Dashboard
**请查看 Agent 启动时的实时输出，获取您的专属外网访问地址（ClawLN）。**

---

## 注意事项
- 视频制作耗时较长（每集约 10–30 分钟）
- 服务重启会中断进行中的任务
- X2C 发布审核通常需要 1–3 个工作日
