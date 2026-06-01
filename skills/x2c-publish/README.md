# X2C Publish - 视频发布与资产管理

X2C 平台的视频发布和资产管理工具，支持将视频发布到 X2C Pool 并管理 X2C/USDC 资产。

## 功能

### 📹 视频发布 (Distribution API)
- 获取分类列表
- 获取 S3 上传链接
- 发布视频项目
- 查询项目状态
- 添加集数
- 列出所有项目

### 💰 资产管理 (Wallet API)
- 查询钱包余额 (credits, X2C, USDC)
- 领取 X2C 到链上钱包
- 兑换 X2C 为 USDC
- 提现 USDC 到外部地址
- 查看交易历史

## 使用方法

### 方式 1: 直接运行脚本

```bash
cd ~/.openclaw/workspace/skills/x2c-publish
USER_ID=5470522468 node scripts/x2c-publish.js <command> [options]
```

### 方式 2: 在 OpenClaw 中调用

通过对话式 API 调用，agent 会自动读取用户凭证。

## 命令列表

### 发行命令

```bash
# 查看可用分类
node scripts/x2c-publish.js categories

# 获取上传链接
node scripts/x2c-publish.js upload-url

# 发布项目
node scripts/x2c-publish.js publish "标题" "描述" category_id 封面URL 视频URL...

# 查询项目状态
node scripts/x2c-publish.js query <project_id>

# 添加集数
node scripts/x2c-publish.js add-episodes <project_id> <video_url>...

# 列出项目
node scripts/x2c-publish.js list [页码] [每页数量] [状态]
```

### 钱包命令

```bash
# 查询余额
node scripts/x2c-publish.js balance

# 领取 X2C
node scripts/x2c-publish.js claim-x2c 100

# 兑换 USDC
node scripts/x2c-publish.js swap-x2c 50

# 提现 USDC
node scripts/x2c-publish.js withdraw 10 <solana_address>

# 交易历史
node scripts/x2c-publish.js transactions
```

## 多用户支持

每个用户需要配置 `credentials/{USER_ID}.json`：

```json
{
  "x2cApiKey": "x2c_sk_xxx..."
}
```

API Key 获取：https://www.x2creel.ai

## 凭证路径

- **开发/测试**: `credentials/5470522468.json` (Stone)
- **生产**: `credentials/{USER_ID}.json`

## 注意事项

1. 所有 curl 请求必须添加 `-m 60` 超时参数
2. 发布前检查项目是否已发布，避免重复
3. 封面必须是图片链接，不能用视频链接
4. 失败后不要自动重试，询问用户

## 相关文档

- [SKILL.md](./SKILL.md) - 完整 API 文档
- [X2C API Requirements](../ai-director/references/X2C-API-REQUIREMENTS.md)
