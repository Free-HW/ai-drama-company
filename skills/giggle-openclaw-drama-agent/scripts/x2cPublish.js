/**
 * x2cPublish.js
 * 封装 X2C Distribution API 调用，供 server.js 在项目完成后自动发布
 */

const X2C_API = 'https://ukbyfmmerxhlghlhbxtz.supabase.co/functions/v1/open-api';
const path = require('path');
const fs = require('fs');

const DOT_ENV_PATH = path.join(__dirname, '..', '..', '..', '.env');

function reloadEnv() {
  try { require('dotenv').config({ path: DOT_ENV_PATH, override: true }); } catch (_) {}
}

function getApiKey() {
  // 每次调用时重读 .env，解决写入后不重启也能生效
  reloadEnv();
  if (process.env.X2C_API_KEY) return process.env.X2C_API_KEY;
  // 其次从 credentials/default.json
  const credPath = path.join(__dirname, '../../x2c-publish/credentials/default.json');
  if (fs.existsSync(credPath)) {
    const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    if (cred.x2cApiKey) return cred.x2cApiKey;
  }
  throw new Error('X2C_API_KEY 未配置，请在 .env 中添加 X2C_API_KEY');
}

async function x2cApi(action, params = {}) {
  const apiKey = getApiKey();
  const resp = await fetch(X2C_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ action, ...params }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await resp.json();
  if (!data.success && data.error) throw new Error(data.error);
  return data;
}

/**
 * 获取分类列表（带缓存，每24小时刷新）
 */
let _categoriesCache = null;
let _categoriesCacheAt = 0;
async function getCategories() {
  if (_categoriesCache && Date.now() - _categoriesCacheAt < 86400000) return _categoriesCache;
  const res = await x2cApi('distribution/categories', { lang: 'zh-CN' });
  _categoriesCache = res.categories || [];
  _categoriesCacheAt = Date.now();
  return _categoriesCache;
}

/**
 * 根据项目 idea 自动匹配最合适的分类
 */
async function matchCategory(idea) {
  const cats = await getCategories();
  if (!cats.length) throw new Error('No categories available');
  // 关键词映射
  // 关键词优先级：越靠前优先级越高，匹配到第一个即停止
  // 古装历史比玄幻优先（穿越到古代 = 古装，不是玄幻）
  const keywords = {
    '古装': ['古装','历史','宫廷','皇宫','古代','朝代','大唐','皇帝','大秦','汉朝','宋朝','明朝','清朝','穿越到','穿越回','穿越成为','穿越大秦','穿越唐','穿越宋','穿越明','穿越清'],
    '玄幻': ['玄幻','仙侠','修仙','魔法','异能','穿越','重生','修炼','灵气'],
    '都市': ['都市','职场','现代','霸总','总裁','逆袭','豪门','婚姻'],
    '悬疑': ['悬疑','惊悚','侦探','破案','谋杀','恐怖'],
    '爱情': ['爱情','甜宠','宠文','恋爱','婚恋','契约'],
    '科幻': ['科幻','末世','星际','机器人','未来'],
    '热门': [],
  };
  // catNameMap：优先精确匹配，找不到时做模糊匹配（分类名改变也能对上）
  const catNameCandidates = {
    '玄幻': ['玄幻异能', '玄幻'],
    '都市': ['都市复仇', '都市'],
    '古装': ['仙侠古装', '古装历史', '古装'],
    '悬疑': ['悬疑惊悚', '悬疑'],
    '爱情': ['霸总甜宠', '爱情甜宠', '爱情'],
    '科幻': ['科幻末世', '科幻'],
    '热门': ['热门综合', '热门'],
  };
  for (const [key, words] of Object.entries(keywords)) {
    if (words.some(w => idea.includes(w))) {
      const candidates = catNameCandidates[key] || [];
      for (const name of candidates) {
        const match = cats.find(c => c.name === name);
        if (match) return match;
      }
      // 模糊匹配：分类名包含 key 的第一个字
      const fuzzy = cats.find(c => c.name.includes(candidates[0]?.slice(0,2) || key));
      if (fuzzy) return fuzzy;
    }
  }
  // 默认返回热门综合（兜底：name_key 或名字匹配）
  return cats.find(c => c.name_key === 'generalMixed') || cats.find(c => c.name.includes('热门')) || cats[0];
}

/**
 * 检查项目是否已在 X2C 发布（通过 x2c_project_id 判断）
 */
async function queryPublished(x2cProjectId) {
  try {
    const res = await x2cApi('distribution/query', { project_id: x2cProjectId });
    return res;
  } catch (e) {
    return null;
  }
}

/**
 * 获取钱包余额
 */
async function getWalletBalance() {
  return x2cApi('wallet/balance');
}

/**
 * 获取已发布项目列表
 */
async function listPublished({ page = 1, pageSize = 20, status = 'all' } = {}) {
  return x2cApi('distribution/list', { page, page_size: pageSize, status });
}

/**
 * 从 URL 流式获取内容并 PUT 上传到 S3 预签名地址
 * @param {string} sourceUrl  - 源文件 URL（Giggle 签名链接）
 * @param {string} uploadUrl  - S3 预签名 PUT URL
 * @param {object} headers    - X2C 返回的 upload_headers
 * @param {string} contentType
 */
async function uploadStreamToS3(sourceUrl, uploadUrl, headers, contentType) {
  // 1. 从源地址下载
  const srcResp = await fetch(sourceUrl, { signal: AbortSignal.timeout(120000) });
  if (!srcResp.ok) throw new Error(`下载源文件失败 ${srcResp.status}: ${sourceUrl.slice(0, 80)}`);

  // 2. 读取为 Buffer（Node.js fetch 返回 Web ReadableStream，转 ArrayBuffer）
  const buffer = Buffer.from(await srcResp.arrayBuffer());

  // 3. PUT 上传到 S3
  const putResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': contentType },
    body: buffer,
    signal: AbortSignal.timeout(300000), // 视频最多 5 分钟
  });
  if (!putResp.ok) {
    const errText = await putResp.text().catch(() => '');
    throw new Error(`S3 上传失败 ${putResp.status}: ${errText.slice(0, 200)}`);
  }
}

/**
 * 主发布函数：将一个已完成的 story project 发布到 X2C
 * 正确流程：
 *   1. 获取每集 cover + video 的 S3 预签名上传 URL
 *   2. 流式下载 Giggle 文件 → PUT 上传到 X2C S3
 *   3. 用 S3 public_url 调用 distribution/publish
 *
 * @param {object} params
 *   - projectName: 项目名
 *   - idea: 项目想法（用于匹配分类和生成描述）
 *   - episodes: [{export_url, cover_url, episode_no}]
 * @returns {object} { ok, x2cProjectId, status, message }
 */
async function publishToX2C({ projectName, idea, episodes }) {
  // 过滤出有视频的集，按集数升序
  const validEps = episodes.filter(e => e.export_url).sort((a, b) => a.episode_no - b.episode_no);
  if (!validEps.length) throw new Error('No valid episodes with export_url');

  const category = await matchCategory(idea || projectName);
  const title = projectName.slice(0, 50);
  const description = (idea || projectName).slice(0, 500);

  // ── Step 1: 获取上传 URL ──
  // upload-url 接口限制：只允许 1 个 cover + N 个 video
  // 只用第 1 集的封面作为项目封面
  const firstEp = validEps[0];
  const fileRequests = [];

  // 仅添加 1 个 cover（第1集封面）
  if (firstEp.cover_url) {
    fileRequests.push({
      file_type: 'cover',
      file_name: 'cover.jpg',
      content_type: 'image/jpeg',
      _epNo: firstEp.episode_no,
      _kind: 'cover',
    });
  }
  // 所有集的视频
  for (const ep of validEps) {
    fileRequests.push({
      file_type: 'video',
      file_name: `ep${ep.episode_no}.mp4`,
      content_type: 'video/mp4',
      _epNo: ep.episode_no,
      _kind: 'video',
    });
  }

  // upload-url 接口不接受私有字段，去掉 _epNo/_kind 再发
  const uploadUrlResp = await x2cApi('distribution/upload-url', {
    files: fileRequests.map(({ _epNo, _kind, ...rest }) => rest),
  });
  if (!uploadUrlResp.success || !Array.isArray(uploadUrlResp.uploads)) {
    throw new Error('获取 S3 上传 URL 失败: ' + JSON.stringify(uploadUrlResp).slice(0, 200));
  }

  const uploads = uploadUrlResp.uploads;
  if (uploads.length !== fileRequests.length) {
    throw new Error(`upload-url 返回数量不匹配: 期望 ${fileRequests.length}，实际 ${uploads.length}`);
  }

  // ── Step 2: 依次上传 cover + 所有视频到 S3 ──
  let coverPublicUrl = '';
  const videoPublicUrls = [];

  for (let i = 0; i < fileRequests.length; i++) {
    const req = fileRequests[i];
    const slot = uploads[i];
    const ep = validEps.find(e => e.episode_no === req._epNo);
    const sourceUrl = req._kind === 'cover' ? ep.cover_url : ep.export_url;

    console.log(`[X2C Upload] EP${req._epNo} ${req._kind} → ${(slot.public_url || '').slice(0, 70)}...`);
    await uploadStreamToS3(sourceUrl, slot.upload_url, slot.upload_headers, req.content_type);
    console.log(`[X2C Upload] EP${req._epNo} ${req._kind} ✓`);

    if (req._kind === 'cover') {
      coverPublicUrl = slot.public_url;
    } else {
      videoPublicUrls.push(slot.public_url);
    }
  }

  if (!videoPublicUrls.length) throw new Error('所有视频上传后无 public_url，终止发布');
  // cover 无法上传时用第1集视频的 public_url 兜底
  if (!coverPublicUrl) coverPublicUrl = videoPublicUrls[0];

  const res = await x2cApi('distribution/publish', {
    title,
    description,
    category_id: category.id,
    cover_url: coverPublicUrl,
    video_urls: videoPublicUrls,
    enable_prediction: false,
  });

  return {
    ok: true,
    x2cProjectId: res.project_id || res.id || '',
    status: res.status || 'pending_review',
    category: category.name,
    message: `已发布到 X2C（${category.name}），${validEps.length} 集视频已上传到 S3`,
    raw: res,
  };
}

/**
 * 查询已发布项目的各平台分发数据（含每集链接和播放量）
 * @param {string|string[]} projectIds - 单个或多个 X2C project_id
 */
async function getVideoStats(projectIds) {
  const ids = Array.isArray(projectIds) ? projectIds : [projectIds];
  if (!ids.length) return [];
  const res = await x2cApi('video/stats', { published_project_ids: ids });
  return res.data || [];
}

/**
 * 带进度回调的发布函数（供 server.js 调用，进度写入 run_logs 供前端轮询）
 * @param {object} params - 同 publishToX2C，额外接受 onProgress(tagClass, tagText, payload)
 */
async function publishToX2CWithProgress({ projectName, idea, episodes, onProgress }) {
  const emit = onProgress || (() => {});

  const validEps = episodes.filter(e => e.export_url).sort((a, b) => a.episode_no - b.episode_no);
  if (!validEps.length) throw new Error('No valid episodes with export_url');

  const category = await matchCategory(idea || projectName);
  emit('agent-e', 'AGENT-E', `[X2C] 分类匹配完成：${category.name}`);

  const title = projectName.slice(0, 50);
  const description = (idea || projectName).slice(0, 500);

  // Step 1: 获取上传 URL（1 cover + N videos）
  const firstEp = validEps[0];
  const fileRequests = [];
  if (firstEp.cover_url) {
    fileRequests.push({ file_type: 'cover', file_name: 'cover.jpg', content_type: 'image/jpeg', _epNo: firstEp.episode_no, _kind: 'cover' });
  }
  for (const ep of validEps) {
    fileRequests.push({ file_type: 'video', file_name: `ep${ep.episode_no}.mp4`, content_type: 'video/mp4', _epNo: ep.episode_no, _kind: 'video' });
  }

  emit('agent-e', 'AGENT-E', `[X2C] 申请上传地址（1 封面 + ${validEps.length} 视频）...`);
  const uploadUrlResp = await x2cApi('distribution/upload-url', {
    files: fileRequests.map(({ _epNo, _kind, ...rest }) => rest),
  });
  if (!uploadUrlResp.success || !Array.isArray(uploadUrlResp.uploads)) {
    throw new Error('获取 S3 上传 URL 失败: ' + JSON.stringify(uploadUrlResp).slice(0, 200));
  }
  const uploads = uploadUrlResp.uploads;
  if (uploads.length !== fileRequests.length) {
    throw new Error(`upload-url 返回数量不匹配: 期望 ${fileRequests.length}，实际 ${uploads.length}`);
  }
  emit('agent-e', 'AGENT-E', `[X2C] 上传地址获取成功，开始上传文件...`);

  // Step 2: 逐个上传
  let coverPublicUrl = '';
  const videoPublicUrls = [];

  for (let i = 0; i < fileRequests.length; i++) {
    const req = fileRequests[i];
    const slot = uploads[i];
    const ep = validEps.find(e => e.episode_no === req._epNo);
    const sourceUrl = req._kind === 'cover' ? ep.cover_url : ep.export_url;
    const label = req._kind === 'cover' ? `封面` : `EP${req._epNo} 视频`;
    const progress = req._kind === 'cover' ? '' : ` (${videoPublicUrls.length + 1}/${validEps.length})`;

    emit('agent-e', 'AGENT-E', `[X2C] 上传中 ${label}${progress}...`);
    await uploadStreamToS3(sourceUrl, slot.upload_url, slot.upload_headers, req.content_type);
    emit('agent-e', 'AGENT-E', `[X2C] ✓ ${label}${progress} 上传完成`);

    if (req._kind === 'cover') {
      coverPublicUrl = slot.public_url;
    } else {
      videoPublicUrls.push(slot.public_url);
    }
  }

  if (!videoPublicUrls.length) throw new Error('所有视频上传后无 public_url，终止发布');
  if (!coverPublicUrl) coverPublicUrl = videoPublicUrls[0];

  // Step 3: 发布
  emit('agent-e', 'AGENT-E', `[X2C] 全部上传完成，正在提交发布请求...`);
  const res = await x2cApi('distribution/publish', {
    title,
    description,
    category_id: category.id,
    cover_url: coverPublicUrl,
    video_urls: videoPublicUrls,
    enable_prediction: false,
  });

  return {
    ok: true,
    x2cProjectId: res.project_id || res.id || '',
    status: res.status || 'pending_review',
    category: category.name,
    message: `已发布到 X2C（${category.name}），${validEps.length} 集视频已上传到 S3`,
    raw: res,
  };
}

/**
 * 获取钱包交易记录（收益/消费明细）
 * @param {object} params - { page, pageSize, type }
 * @returns {object} { success, transactions[], total, page, page_size }
 */
async function getWalletTransactions({ page = 1, pageSize = 20, type = 'all' } = {}) {
  const res = await x2cApi('wallet/transactions', {
    page: Number(page) || 1,
    page_size: Math.min(Number(pageSize) || 20, 100),
    type: type || 'all',
  });
  return {
    success: res.success ?? false,
    transactions: res.transactions || [],
    total: res.total || 0,
    page: res.page || 1,
    page_size: res.page_size || 20,
  };
}

module.exports = { publishToX2C, publishToX2CWithProgress, getWalletBalance, getWalletTransactions, listPublished, queryPublished, getCategories, matchCategory, getVideoStats };
