---
name: x2c-publish
description: "X2C Distribution & Wallet API - Publish video to X2C platform, manage assets (balance, claim X2C, swap to USDC, withdraw, transactions)."
version: "0.0.1"
---

# X2c-Publish - X2C Distribution API

Publish video content to X2C platform using the Distribution API.

---

## 🔐 账号绑定流程

**在发布视频之前，用户必须先绑定X2C账号。**

### 绑定步骤：

1. 打开 https://www.x2creel.ai 注册/登录账号
2. 进入 **个人中心 → API管理**
3. 创建并复制 **API Key**
4. 将 API Key 发送给我

**示例对话：**
```
用户：我想发布视频
助手：好的，需要先绑定X2C账号。请打开 https://www.x2creel.ai 登录，然后在个人中心获取API Key发给我。
用户：x2c_sk_xxx...
助手：验证通过！你的账号已绑定，现在可以发布视频了～
```

### Agent 自动验证

Agent 收到 API Key 后，直接调用 X2C API 验证：
- 验证成功 → 保存到 `credentials/{USER_ID}.json`
- 验证失败 → 提示用户检查Key是否正确

---

## ⚠️ 重要规则

**在用户提供有效的 X2C API Key 之前，禁止执行任何发布操作！**

---

## ⚠️ 用户发布视频时的交互流程

当用户说"发布视频"或类似意图时，**必须按以下流程执行**：

### Step 1: 立即获取并展示支持的分类
调用 `distribution/categories` API 获取支持的分类，**直接展示给用户选择**。

### Step 2: 展示完整参数列表
告诉用户需要准备的信息：

| 参数 | 说明 | 示例 |
|------|------|------|
| 视频链接 | 视频的URL (mp4) | https://v.arkfs.co/.../video.mp4 |
| 封面图 | 视频封面URL (jpg/png/webp) **必填** | https://.../cover.jpg |
| 标题 | 作品名称 (最长10字) | 《重生千金》 |
| 简介 | 剧情简介 (最长200字) | 女主重生归来复仇... |
| 分类 | 从Step 1获取的分类中选择 | 都市复仇 |

### Step 3: 收集完成后执行发布
用户确认所有参数后，调用 `distribution/publish` 执行发布。

---

## ⚠️ CRITICAL RULES - MUST FOLLOW THIS WORKFLOW

**You MUST complete ALL steps in order. Never skip steps!**

**ALWAYS add timeout to curl commands:** Use `-m 60` (60 seconds max)

```
Step 1: distribution/categories → Get categories
Step 2: distribution/upload-url → Get S3 upload URLs (for cover + videos)
Step 3: Upload files to S3 via HTTP PUT (cover + videos)
Step 4: distribution/publish → Submit with the public_url from Step 3
```

**Two ways to provide videos:**
1. **S3 Upload** - Use upload-url workflow (for local files)
2. **External URL** - Use existing video URLs directly in publish (e.g., from AI Director)

**NEVER retry failed requests!** If a request fails, report the error to user and ask what to do. Do NOT automatically retry. 

## ⚠️ 发布限制规则 (Publishing Restrictions)

1. **不重复发布 (No Duplicate Publishing)**
   - 发布前必须先查询项目状态，确认未发布过
   - 使用 `distribution/query` 检查项目是否已发布
   - 如果已发布，不要再次调用 `distribution/publish`

2. **封面图片要求 (Cover Image Requirements)**
   - `cover_url` 必须是图片链接 (jpg/png/webp)
   - 不能使用视频链接作为封面
   - 必须先获取视频的缩略图或上传封面图片

3. **API 超时处理 (Timeout Handling)**
   - 添加超时参数 `-m 60` 到 curl 命令
   - 超时后不要自动重试，询问用户如何处理

4. **已发布项目的后续集数 (Adding Episodes)**
   - 如果项目已发布，需要添加新集数
   - 使用 `distribution/add-episodes` 而不是重新发布整个项目 

## API Endpoint

```
POST https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api
```

Headers:
- `Content-Type: application/json`
- `X-API-Key: x2c_sk_xxx...`

## Workflow

```
1. distribution/categories → Get available categories
2. distribution/upload-url → Get S3 presigned upload URLs
3. Upload files to S3 via HTTP PUT
4. distribution/publish → Submit project with metadata
5. distribution/query → Check review status
6. distribution/add-episodes → Add more episodes
7. distribution/list → List all projects
```

## Commands

### 1. Get Categories

```bash
curl -X POST https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api \
  -H "Content-Type: application/json" \
  -H "X-API-Key: x2c_sk_xxx" \
  -d '{
    "action": "distribution/categories",
    "lang": "zh-CN"
  }'
```

**⚠️ 必须使用 API 返回的分类！发布前必须先调用此 API 获取支持的分类列表，用户只能从返回的分类中选择。**

### 2. Get Upload URLs

```bash
curl -X POST https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api \
  -H "Content-Type: application/json" \
  -H "X-API-Key: x2c_sk_xxx" \
  -d '{
    "action": "distribution/upload-url",
    "files": [
      {"file_type": "cover", "file_name": "cover.jpg", "content_type": "image/jpeg"},
      {"file_type": "video", "file_name": "ep1.mp4", "content_type": "video/mp4"}
    ]
  }'
```

**Response includes:**
- `upload_url` - S3 URL to upload to
- `upload_headers` - Headers for PUT request
- `public_url` - URL after upload completes

### 3. Upload to S3

```bash
curl -X PUT "<upload_url>" \
  -H "Content-Type: image/jpeg" \
  -H "Host: s3api.arkfs.co" \
  -H "x-amz-content-sha256: UNSIGNED-PAYLOAD" \
  -H "x-amz-date: 20260214T120000Z" \
  -H "Authorization: AWS4-HMAC-SHA256 ..." \
  --data-binary @cover.jpg
```

### 4. Publish Project

```bash
curl -X POST https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api \
  -H "Content-Type: application/json" \
  -H "X-API-Key: x2c_sk_xxx" \
  -d '{
    "action": "distribution/publish",
    "title": "My Drama",
    "description": "A story about...",
    "category_id": "uuid",
    "cover_url": "https://v.arkfs.co/.../cover.jpg",
    "video_urls": ["https://v.arkfs.co/.../1.mp4"],
    "enable_prediction": false
  }'
```

**Parameters:**
| Param | Required | Description |
|-------|----------|-------------|
| title | Yes | Project name (max 100 chars) |
| description | Yes | Synopsis (max 2000 chars) |
| category_id | Yes | Category UUID (**必须从 distribution/categories API 获取**) |
| cover_url | Yes | Cover image URL |
| video_urls | Yes | Array of video URLs (1-10) |
| enable_prediction | No | Enable prediction market |

**⚠️ 发布前必须先调用 `distribution/categories` 获取支持的分类，用户只能从中选择。**

### 5. Query Status

```bash
curl -X POST https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api \
  -H "Content-Type: application/json" \
  -H "X-API-Key: x2c_sk_xxx" \
  -d '{
    "action": "distribution/query",
    "project_id": "uuid"
  }'
```

**Status values:**
- `draft` - Created but not submitted
- `pending_review` - Awaiting review
- `approved` - Live
- `rejected` - Rejected

### 6. Add Episodes

```bash
curl -X POST https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api \
  -H "Content-Type: application/json" \
  -H "X-API-Key: x2c_sk_xxx" \
  -d '{
    "action": "distribution/add-episodes",
    "project_id": "uuid",
    "video_urls": ["https://v.arkfs.co/.../3.mp4"]
  }'
```

### 7. List Projects

```bash
curl -X POST https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api \
  -H "Content-Type: application/json" \
  -H "X-API-Key: x2c_sk_xxx" \
  -d '{
    "action": "distribution/list",
    "page": 1,
    "page_size": 20,
    "status": "approved"
  }'
```

## Multi-User Support

**API Key:** Get from https://storyclaw.com/ (not alpaca.markets!)

Store in:
- `credentials/{USER_ID}.json`

```json
{
  "x2cApiKey": "x2c_sk_xxx"
}
```

When calling, set `USER_ID` environment variable or pass via TELEGRAM_USER_ID.

---

# Wallet API (Asset Management)

Query balances, claim X2C, swap to USDC, withdraw, and view transaction history.

## Workflow

```
1. wallet/balance → Check all balances (credits, X2C, USDC)
2. wallet/claim-x2c → Claim released X2C to on-chain wallet
3. wallet/swap-x2c → Swap X2C tokens for USDC
4. wallet/withdraw-usdc → Withdraw USDC to external address
5. wallet/transactions → View earnings & purchase history
```

## Commands

### 1. Get Wallet Balance

```bash
curl -X POST https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api \
  -H "Content-Type: application/json" \
  -H "X-API-Key: x2c_sk_xxx" \
  -d '{"action": "wallet/balance"}'
```

**Response:**
| Field | Type | Description |
|-------|------|-------------|
| credits | number | Platform credit balance |
| x2c_wallet_balance | number | On-chain X2C wallet balance |
| x2c_pending_claim | number | Released X2C available to claim |
| x2c_pending_release | number | Locked X2C not yet released |
| usdc_balance | number | USDC balance |
| wallet_address | string | Solana wallet address |

### 2. Claim X2C

```bash
curl -X POST https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api \
  -H "Content-Type: application/json" \
  -H "X-API-Key: x2c_sk_xxx" \
  -d '{
    "action": "wallet/claim-x2c",
    "amount": 50.0
  }'
```

**Parameters:**
| Param | Required | Description |
|-------|----------|-------------|
| amount | Yes | Amount of X2C to claim |

### 3. Swap X2C to USDC

```bash
curl -X POST https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api \
  -H "Content-Type: application/json" \
  -H "X-API-Key: x2c_sk_xxx" \
  -d '{
    "action": "wallet/swap-x2c",
    "amount": 100.0
  }'
```

### 4. Withdraw USDC

```bash
curl -X POST https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api \
  -H "Content-Type: application/json" \
  -H "X-API-Key: x2c_sk_xxx" \
  -d '{
    "action": "wallet/withdraw-usdc",
    "amount": 10.0,
    "to_address": "ExternalSolanaAddress..."
  }'
```

**Parameters:**
| Param | Required | Description |
|-------|----------|-------------|
| amount | Yes | USDC amount to withdraw |
| to_address | Yes | Destination Solana wallet address |

### 5. Transaction History

```bash
curl -X POST https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api \
  -H "Content-Type: application/json" \
  -H "X-API-Key: x2c_sk_xxx" \
  -d '{
    "action": "wallet/transactions",
    "page": 1,
    "page_size": 20,
    "type": "all"
  }'
```

**Parameters:**
| Param | Required | Description |
|-------|----------|-------------|
| page | No | Page number (default: 1) |
| page_size | No | Items per page (default: 20, max: 100) |
| type | No | "earnings", "purchases", or "all" (default) |

**Earnings types:** mining, distribution, referral, commission, copyright, x2c_release, x2c_claim

**Purchase types:** consume, ai_clone, drama_purchase, purchase, pre_charge, script_generate, preview_regen, ai_consume, swap, withdrawal
