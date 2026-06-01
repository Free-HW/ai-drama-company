/**
 * x2cPublish.js
 * 封装 X2C Distribution API 调用，供 server.js 在项目完成后自动发布
 */

const X2C_API = 'https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api';
const path = require('path');
const fs = require('fs');

function getApiKey() {
  // 优先从环境变量读取
  if (process.env.X2C_API_KEY) return process.env.X2C_API_KEY;
  // 其次从 credentials/default.json
  const credPath = path.join(__dirname, '../../x2c-publish/credentials/default.json');
  if (fs.existsSync(credPath)) {
    const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    if (cred.x2cApiKey) return cred.x2cApiKey;
  }
  throw new Error('X2C API Key not configured');
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
  const keywords = {
    '玄幻': ['玄幻','仙侠','修仙','魔法','异能','穿越','重生'],
    '都市': ['都市','职场','现代','霸总','总裁','逆袭','豪门','婚姻'],
    '古装': ['古装','历史','宫廷','皇宫','古代','朝代','大唐','皇帝'],
    '悬疑': ['悬疑','惊悚','侦探','破案','谋杀','恐怖'],
    '爱情': ['爱情','甜宠','宠文','恋爱','婚恋','契约'],
    '科幻': ['科幻','末世','星际','机器人','未来'],
    '热门': [],
  };
  const catNameMap = {
    '玄幻': '玄幻异能', '都市': '都市复仇', '古装': '古装历史',
    '悬疑': '悬疑惊悚', '爱情': '爱情甜宠', '科幻': '科幻末世', '热门': '热门综合',
  };
  for (const [key, words] of Object.entries(keywords)) {
    if (words.some(w => idea.includes(w))) {
      const targetName = catNameMap[key];
      const match = cats.find(c => c.name === targetName);
      if (match) return match;
    }
  }
  // 默认返回热门综合
  return cats.find(c => c.name_key === 'generalMixed') || cats[0];
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
 * 主发布函数：将一个已完成的 story project 发布到 X2C
 * @param {object} params
 *   - projectName: 项目名
 *   - idea: 项目想法（用于匹配分类和生成描述）
 *   - episodes: [{export_url, cover_url, episode_no}]
 * @returns {object} { ok, x2cProjectId, status, message }
 */
async function publishToX2C({ projectName, idea, episodes }) {
  // 过滤出有视频的集
  const validEps = episodes.filter(e => e.export_url);
  if (!validEps.length) throw new Error('No valid episodes with export_url');

  const category = await matchCategory(idea || projectName);
  const coverUrl = validEps[0].cover_url || '';
  const videoUrls = validEps.map(e => e.export_url);
  const title = projectName.slice(0, 50);
  const description = (idea || projectName).slice(0, 500);

  const res = await x2cApi('distribution/publish', {
    title,
    description,
    category_id: category.id,
    cover_url: coverUrl,
    video_urls: videoUrls,
    enable_prediction: false,
  });

  return {
    ok: true,
    x2cProjectId: res.project_id || res.id || '',
    status: res.status || 'pending_review',
    category: category.name,
    message: `已发布到 X2C（${category.name}），等待审核`,
    raw: res,
  };
}

module.exports = { publishToX2C, getWalletBalance, listPublished, queryPublished, getCategories, matchCategory };
