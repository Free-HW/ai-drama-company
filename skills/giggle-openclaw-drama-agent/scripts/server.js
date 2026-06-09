const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });
const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');
const { GiggleClient } = require('./giggleClient');
const { DramaAgent } = require('./agent');
const {
  openDb,
  initSchema,
  createRun,
  setProjectId,
  saveScript,
  replaceCharacters,
  replaceStoryboards,
  addLog,
  finishRun,
  getLatestSnapshot,
  getProjectList,
  getProjectEpisodes,
  getRunByRunId,
  getRunLogsSince,
  createStoryProject,
  upsertProjectBible,
  setStoryProjectStatus,
  getStoryProject,
  listStoryProjects,
  replaceProjectEpisodes,
  listProjectEpisodesByUuid,
  getProjectEpisodeByNo,
  updateProjectEpisode,
  upsertProjectCharacter,
  listProjectCharacters,
  upsertCharacterMapping,
  listCharacterMappings,
} = require('./db');
const { publishToX2C, publishToX2CWithProgress, getWalletBalance, getWalletTransactions, listPublished, queryPublished, getVideoStats } = require('./x2cPublish');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'assets')));


const X2C_API_ENDPOINT = 'https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api';
const DOT_ENV_PATH = path.join(__dirname, '..', '..', '..', '.env');

// 动态重读 .env，解决「写入 .env 后不重启服务就生效」的问题
function reloadEnv() {
  require('dotenv').config({ path: DOT_ENV_PATH, override: true });
}

async function x2cCall(payload) {
  reloadEnv();
  const apiKey = process.env.X2C_API_KEY;
  if (!apiKey) throw new Error('X2C_API_KEY 未配置，请在 .env 中添加 X2C_API_KEY 并重启服务');

  const resp = await fetch(X2C_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json.success === false) {
    throw new Error(json.error || json.message || json.msg || 'X2C API request failed');
  }
  return json;
}

const db = openDb();
const GIGGLE_BASE_URL = process.env.GIGGLE_BASE_URL || 'https://giggle.pro';
initSchema(db).catch((e) => {
  console.error('DB init error:', e.message);
  process.exit(1);
});

app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/local/latest', async (req, res) => {
  try {
    const snap = await getLatestSnapshot(db);
    res.json({ ok: true, data: snap });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/local/projects', async (req, res) => {
  try {
    const projects = await getProjectList(db);
    res.json({ ok: true, data: projects });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/local/projects/:runId/episodes', async (req, res) => {
  try {
    const episodes = await getProjectEpisodes(db, req.params.runId);
    res.json({ ok: true, data: episodes });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/x2c/projects', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const pageSize = Math.min(100, Number(req.query.page_size || 20));
    const payload = {
      action: 'project/performance',
      page,
      page_size: pageSize,
    };
    if (req.query.production_source) payload.production_source = req.query.production_source;
    if (req.query.project_style) payload.project_style = req.query.project_style;

    const data = await x2cCall(payload);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/x2c/projects/:id', async (req, res) => {
  try {
    const data = await x2cCall({ action: 'project/performance', project_id: req.params.id });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

async function buildEpisodePlanAI({ idea, episodeCount }) {
  const total = Math.max(1, Number(episodeCount || 1));
  const GATEWAY = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';
  const PASS = process.env.OPENCLAW_GATEWAY_PASSWORD || '';

  const prompt = `你是专业短剧编剧。根据以下创意,生成一部完整的${total}集短剧剧本。

创意:${idea}

严格按照以下格式输出每一集,不要有任何额外说明文字:

### 🎬 第1集(目标:120秒)
【剧情概要】
(100-150字,描述本集核心剧情,交代人物关系和冲突)

【角色表】
角色名:角色描述(每行一个)

【Shot-by-Shot脚本·15-17镜头·每镜5-8秒】
Shot 1(7s)
画面/事件:(具体场景描述)
台词:角色名:"台词内容"
镜头调度:(镜头运动描述)
画面Prompt:(英文风格的画面描述,用于AI生图)
音频:(音效和背景音乐描述,结尾加"高通滤波,干净静音背景,无背景噪音,无低频隆隆声")

(继续Shot 2到Shot 15-17,格式相同)

【高能台词】
1. 角色名:"台词"
2. 角色名:"台词"
3. 角色名:"台词"

【音频设计】
(整集音频风格描述,50字左右)

【下集预告】
(一句话预告下集内容)

要求:
- 剧情连续,每集有完整的起承转合
- 每集15-17个Shot,每个Shot 5-8秒
- 台词自然口语化,符合人物性格
- 画面Prompt用中文描述,简洁有画面感
- 所有${total}集按顺序输出,集与集之间用空行分隔`;

  // 最多重试 3 次,每次间隔 5 秒
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(`${GATEWAY}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PASS}`,
        },
        body: JSON.stringify({
          model: 'openclaw',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.85,
        }),
      });
      const json = await resp.json();
      const text = json?.choices?.[0]?.message?.content || '';
      if (text && text.includes('Shot')) {
        const episodes = parseScriptText(text, total);
        if (episodes.length > 0) return episodes;
      }
      break; // 请求成功但内容不符,不重试
    } catch (e) {
      console.warn(`[AI Script] LLM attempt ${attempt}/3 failed: ${e.message}`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 5000));
    }
  }

  return buildLocalScriptFallback(idea, total);
}

function parseScriptText(text, total) {
  // 按 "### 🎬 第X集" 分割
  const parts = text.split(/(?=###\s*🎬\s*第\d+集)/);
  const episodes = parts
    .filter(p => p.trim().startsWith('###'))
    .slice(0, total)
    .map((part, i) => {
      const titleMatch = part.match(/###\s*🎬\s*(第\d+集[^\n]*)/);
      const title = titleMatch ? titleMatch[1].trim() : `第${i + 1}集`;

      const outlineMatch = part.match(/【剧情概要】\s*([\s\S]*?)(?=【|$)/);
      const outline = outlineMatch ? outlineMatch[1].trim().slice(0, 200) : '';

      return {
        episode_no: i + 1,
        title,
        outline,
        script_text: part.trim(),
        status: 'scripted',
      };
    });
  return episodes;
}

function splitRawStory(raw, total) {
  const parts = raw.split(/第[一二三四五六七八九十\d]+集/);
  if (parts.length > 1) {
    return parts.slice(1, total + 1).map((text, i) => ({
      title: `第${i + 1}集`, outline: text.slice(0, 100), script_text: text.trim(),
    }));
  }
  const lines = raw.split('\n').filter(Boolean);
  const perEp = Math.ceil(lines.length / total);
  return Array.from({ length: total }, (_, i) => {
    const chunk = lines.slice(i * perEp, (i + 1) * perEp).join('\n');
    return { title: `第${i + 1}集`, outline: chunk.slice(0, 100), script_text: chunk };
  });
}

function buildLocalScriptFallback(idea, total) {
  const arcs = [
    { name: '相遇', hook: '命运安排两人意外相遇,产生强烈的第一印象。' },
    { name: '误解', hook: '一场误会让关系急转直下,双方各执一词。' },
    { name: '靠近', hook: '共同面对危机,两人不得不携手合作。' },
    { name: '心动', hook: '细节中的温柔让对方心防松动,情愫暗生。' },
    { name: '阻碍', hook: '外部势力介入,强行拆散两人。' },
    { name: '表白', hook: '压抑已久的情感在关键时刻爆发。' },
    { name: '危机', hook: '最大的考验来临,感情面临终极抉择。' },
    { name: '和解', hook: '真相大白,误会消除,两人重归于好。' },
    { name: '升华', hook: '经历磨难后感情更加坚定,共同面对未来。' },
    { name: '圆满', hook: '所有伏笔收束,以温暖结局收尾。' },
  ];
  return Array.from({ length: total }, (_, i) => {
    const arc = arcs[Math.min(i, arcs.length - 1)];
    const epNo = i + 1;
    const isLast = epNo === total;
    const nextHook = isLast ? '全剧终,留下温暖余韵。' : `下集预告:${arcs[Math.min(i + 1, arcs.length - 1)].hook}`;
    const script = [
      `【第${epNo}集·${arc.name}】`,
      ``,
      `■ 主题:${arc.hook}`,
      `■ 核心创意:${idea}`,
      ``,
      `【场景一:开场(0-15秒)】`,
      `画面:特写镜头,环境音渐入。`,
      `动作:主角出现,状态暗示本集情绪基调。`,
      ``,
      `【场景二:冲突(15-60秒)】`,
      `对白:`,
      `  主角A:(${arc.name}情绪)「......」`,
      `  主角B:(反应)「......」`,
      `动作:${arc.hook}`,
      ``,
      `【场景三:转折(60-90秒)】`,
      `画面:情绪爆点,节奏加快。`,
      `动作:局势发生意外变化,观众情绪被调动。`,
      ``,
      `【场景四:结尾钩子(90-120秒)】`,
      `画面:定格或慢镜头。`,
      `${nextHook}`,
    ].join('\n');
    return {
      episode_no: epNo,
      title: `第${epNo}集·${arc.name}`,
      outline: arc.hook,
      script_text: script,
      status: 'scripted',
    };
  });
}


// 用 AI 从 idea 中智能提取项目名称
/**
 * 本地快速提取名称（从 idea 里取前 10 个实词）
 */
function quickExtractName(idea) {
  if (!idea) return null;
  // 去掉集数描述、常见无效词
  const cleaned = idea
    .replace(/(共|总共|大约|一共)?\d+\s*(集|话|期|部)/g, '')
    .replace(/(共|单|只有|仅)?一集/g, '')
    .replace(/[，。！？,.!?\n\r]/g, ' ')
    .trim();
  // 取前 10 个字符作为名称候选
  const name = cleaned.slice(0, 12).trim();
  return name.length >= 2 ? name : null;
}

/**
 * 调用 Gateway LLM 智能生成项目名称（20秒超时），失败则本地快速提取
 */
async function aiGenerateProjectName(idea) {
  // 直接调用 storyclaw anthropic API（绕过 Gateway，速度快稳定）
  const BASE_URL = process.env.STORYCLAW_API_URL || 'https://llm-ap.gqapi.com';
  const API_KEY = process.env.STORYCLAW_API_KEY || '';
  if (!API_KEY) {
    console.warn('[AIName] STORYCLAW_API_KEY not set, falling back to quickExtract');
    return quickExtractName(idea);
  }
  try {
    const resp = await fetch(`${BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 30,
        system: '你是短剧命名专家。根据用户描述，提炼一个简洁有力的短剧名称，4-10个汉字，只输出名称本身，不加书名号和标点。',
        messages: [{ role: 'user', content: idea.slice(0, 300) }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const data = await resp.json();
    const raw = (data.content?.[0]?.text || '').trim();
    const name = raw.replace(/[《》「」【】""''<>\n\r]/g, '').replace(/\s+/g, '').trim();
    if (name && name.length >= 2 && name.length <= 20) {
      console.log(`[AIName] claude generated: ${name}`);
      return name;
    }
    console.warn('[AIName] claude returned invalid name:', JSON.stringify(raw));
  } catch (e) {
    console.warn('[AIName] claude failed:', e.message);
  }
  // fallback 本地快速提取
  const fallback = quickExtractName(idea);
  console.warn('[AIName] fallback to quickExtract:', fallback);
  return fallback;
}

// 集数配置
const EPISODE_COUNT_DEFAULT = 10;  // 用户未指定集数时的默认值
const EPISODE_COUNT_MAX = 60;       // 最大允许集数(超出自动截断为60)

// 从 idea 文本中解析集数:支持阿拉伯数字和中文数字,支持"一集/单集"等表达,未匹配返回默认值
function parseEpisodeCountFromIdea(idea) {
  const str = String(idea);
  // 阿拉伯数字:10集、共10集、10期、10话
  const m1 = str.match(/(?:共|全|约|只|制作|做|拍)?\s*(\d+)\s*(?:集|期|话|章|个视频|条视频|个短片)/);
  if (m1) return Math.min(Math.max(parseInt(m1[1]), 1), EPISODE_COUNT_MAX);
  // 中文数字映射
  const cnMap = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,
                  '十一':11,'十二':12,'十五':15,'二十':20,'三十':30,'五十':50,'六十':60 };
  const m2 = str.match(/(?:共|全|约|只|制作|做|拍)?\s*([一二三四五六七八九十]{1,3})\s*(?:集|期|话|章|个视频|条视频|个短片)/);
  if (m2 && cnMap[m2[1]]) return Math.min(cnMap[m2[1]], EPISODE_COUNT_MAX);
  // 单集/一集特殊匹配
  if (/制作一集|一集短|单集|只有一集|一个视频|一条视频|一个短片/.test(str)) return 1;
  // 默认集数
  return EPISODE_COUNT_DEFAULT;
}

app.post('/api/agent/projects', async (req, res) => {
  try {
    const { name, idea, language, aspect, style, episodeCount, videoDuration, bible, characters } = req.body || {};
    if (!idea || !idea.trim()) return res.status(400).json({ ok: false, error: 'idea is required' });
    const VALID_DURATIONS = [60, 120, 180, 240, 300];
    // 从请求参数取,如果没有则从创意文本解析(支持"120秒/120分钟/s"格式)
    const m = String(idea).match(/(\d+)\s*(秒|分钟|min|s|secs?)/i);
    let parsedDuration = VALID_DURATIONS.includes(Number(videoDuration)) ? Number(videoDuration) : 60;
    if (parsedDuration === 60 && m) {
      const val = parseInt(m[1]);
      const isMinute = /分钟|min/i.test(m[2]);
      const seconds = isMinute ? val * 60 : val;
      if (VALID_DURATIONS.includes(seconds)) parsedDuration = seconds;
    }
    // 解析集数:前端传则用,否则从 idea 解析,默认 10 集
    const finalEpisodeCount = episodeCount ? Math.min(Math.max(Number(episodeCount), 1), EPISODE_COUNT_MAX)
                                            : parseEpisodeCountFromIdea(idea);
    // 项目名:用户输入优先,否则先用临时名,后台 AI 异步命名
    const userInputName = (name && name.trim()) ? name.trim() : '';
    const tempName = userInputName || `生成中-${new Date().toISOString().slice(0, 10)}`;
    const projectUuid = randomUUID();
    await createStoryProject(db, {
      projectUuid,
      name: tempName,
      idea: idea.trim(),
      language: language || 'zh-CN',
      aspect: aspect || '16:9',
      style: style || '',
      episodeCount: finalEpisodeCount,
      styleId: 146,
      videoDuration: parsedDuration,
    });
    await upsertProjectBible(db, {
      projectUuid,
      worldSetting: bible?.worldSetting || '',
      tone: bible?.tone || '',
      styleRules: bible?.styleRules || '',
      relationshipNotes: bible?.relationshipNotes || '',
      rawJson: bible || {},
    });

    // 先返回项目创建成功,后台异步生成 AI 剧本
    await setStoryProjectStatus(db, { projectUuid, status: 'generating' });
    const project0 = await getStoryProject(db, projectUuid);
    res.json({ ok: true, data: { project: project0, episodes: [], generating: true } });

    // 异步：① 立刻创建 script_run_id 供前端轮询 → ② AI命名 → ③ 剧本生成 + 风格匹配
    (async () => {
      // Step0: 立刻创建 script_run_id，写入 DB，前端从此刻起就能看到日志
      const { randomUUID } = require('crypto');
      const earlyRunId = randomUUID();
      await createRun(db, { runId: earlyRunId, idea: idea.trim(), projectName: `[生成中] ${projectUuid.slice(0,8)}` });
      db.prepare('UPDATE story_projects SET script_run_id=?, updated_at=? WHERE project_uuid=?')
        .run(earlyRunId, new Date().toISOString(), projectUuid);
      await addLog(db, { runId: earlyRunId, stage: 'system', tagClass: 'system', tagText: 'SYSTEM', payload: '正在匹配风格、AI智能命名、准备生成剧本，请稍候...' });

      // Step1: AI 命名（串行，命名完成后再生成剧本）
      if (!userInputName) {
        try {
          await addLog(db, { runId: earlyRunId, stage: 'system', tagClass: 'system', tagText: 'SYSTEM', payload: '[AIName] 正在分析内容，AI 智能命名中...' });
          const aiName = await aiGenerateProjectName(idea.trim());
          if (aiName) {
            db.prepare('UPDATE story_projects SET name=?, updated_at=? WHERE project_uuid=?')
              .run(aiName, new Date().toISOString(), projectUuid);
            console.log('[AIName] project name set to:', aiName);
            await addLog(db, { runId: earlyRunId, stage: 'system', tagClass: 'system', tagText: 'SYSTEM', payload: `[AIName] 项目命名完成：${aiName}` });
          }
        } catch (e) {
          console.warn('[AIName] failed:', e.message);
          await addLog(db, { runId: earlyRunId, stage: 'system', tagClass: 'system', tagText: 'SYSTEM', payload: `[AIName] 命名失败，使用原始内容：${e.message}` }).catch(() => {});
        }
      }

      // Step2: 命名完成后，并行触发剧本生成 + 风格匹配
      // triggerScriptGeneration 内部会创建新的 script_run_id 并覆盖写入 DB
      // 这里先把 earlyRunId 传给它，让剧本日志继续写到同一个 run
      triggerScriptGeneration(projectUuid, idea.trim(), finalEpisodeCount, earlyRunId);

      matchStyleId(idea.trim()).then(styleId => {
        db.prepare('UPDATE story_projects SET style_id=?, updated_at=? WHERE project_uuid=?')
          .run(styleId, new Date().toISOString(), projectUuid);
        console.log('[StyleMatch] style_id updated to', styleId, 'for', projectUuid);
      }).catch(e => console.warn('[StyleMatch] failed:', e.message));
    })();
    return; // already responded
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/agent/projects', async (req, res) => {
  try {
    const projects = await listStoryProjects(db, Number(req.query.limit || 50));
    res.json({ ok: true, data: projects });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/agent/projects/:projectUuid', async (req, res) => {
  try {
    const project = await getStoryProject(db, req.params.projectUuid);
    if (!project) return res.status(404).json({ ok: false, error: 'project not found' });
    const episodes = await listProjectEpisodesByUuid(db, req.params.projectUuid);
    const characters = await listProjectCharacters(db, req.params.projectUuid);
    const mappings = await listCharacterMappings(db, req.params.projectUuid);
    // 从 character_mappings 的 raw_json 提取角色图片
    const charsWithImages = characters.map(c => {
      const m = mappings.find(m => m.project_character_key === c.character_key);
      let image_url = '', asset_id = '', voice_name = '';
      if (m?.raw_json) { try { const r = JSON.parse(m.raw_json); image_url = r.image_url || r.image_signed_url || ''; asset_id = r.asset_id || ''; voice_name = r.voice_name || ''; } catch {} }
      return { ...c, image_url, asset_id, voice_name };
    });
    res.json({ ok: true, data: { project, episodes, characters: charsWithImages, mappings, shots: [], scriptRunId: project.script_run_id || '',
      pipelineRunId: (() => { try { return db.prepare('SELECT run_id FROM runs WHERE project_id=? ORDER BY id DESC LIMIT 1').get(req.params.projectUuid)?.run_id || ''; } catch{ return ''; } })() } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/agent/projects/:projectUuid/episodes/:episodeNo/run', async (req, res) => {
  const { projectUuid, episodeNo } = req.params;
  try {
    const missing = [];
    if (!process.env.GIGGLE_API_KEY) missing.push('GIGGLE_API_KEY');
    if (missing.length) return res.status(400).json({ ok: false, error: `Missing env: ${missing.join(', ')}` });

    const project = await getStoryProject(db, projectUuid);
    if (!project) return res.status(404).json({ ok: false, error: 'project not found' });
    const episode = await getProjectEpisodeByNo(db, { projectUuid, episodeNo: Number(episodeNo) });
    if (!episode) return res.status(404).json({ ok: false, error: 'episode not found' });

    // 清理旧 run 数据,保持本地数据完整性
    if (episode.run_id) {
      const oldRunId = episode.run_id;
      for (const tbl of ['run_logs','scripts','storyboards','characters']) {
        db.prepare(`DELETE FROM ${tbl} WHERE run_id=?`).run(oldRunId);
      }
      db.prepare('DELETE FROM runs WHERE run_id=?').run(oldRunId);
      // character_mappings 不删除,重新生成时 saveGlobalCharacter 会用 is_active=0 停用旧映射再插入新的
    }

    const runId = randomUUID();
    await createRun(db, {
      runId,
      idea: episode.outline || project.idea,
      projectName: `${project.name}-EP${String(episodeNo).padStart(2, '0')}`,
    });
    await updateProjectEpisode(db, { projectUuid, episodeNo: Number(episodeNo), status: 'running', runId });
    await setStoryProjectStatus(db, { projectUuid, status: 'running' });

    const emit = (tagClass, tagText, payload, stage) => {
      addLog(db, { runId, stage, tagClass, tagText, payload }).catch(() => {});
    };

    res.json({ ok: true, data: { projectUuid, episodeNo: Number(episodeNo), runId, status: 'running' } });

    (async () => {
      try {
        const giggle = new GiggleClient({
          baseUrl: GIGGLE_BASE_URL,
          apiKey: process.env.GIGGLE_API_KEY,
          authMode: process.env.GIGGLE_AUTH_MODE || 'x-auth',
        });
        const agent = new DramaAgent({
          giggle,
          pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 5000),
          pollTimeoutMs: Number(process.env.POLL_TIMEOUT_MS || 3600000), // 默认60分钟
        });
        // 风格参数:优先用 DB 存储的(创建项目时已智能匹配),其次前端传参,最后默认值
        const styleId = project.style_id || req.body?.styleId || 146;
        const videoDuration = project.video_duration || req.body?.videoDuration || 60;

        const result = await agent.run({
          idea: episode.script_text || episode.outline || project.idea,
          projectName: `${project.name}-EP${String(episodeNo).padStart(2, '0')}`,
          aspect: project.aspect || '16:9',
          language: project.language || 'zh-CN',
          videoDuration,
          styleId,
          videoModel: req.body?.videoModel || 'seedance-2.0-pro',
          secondModel: req.body?.secondModel || 'seedance-2.0-pro',
          shotDuration: req.body?.shotDuration || 5,
          db,
          storyProjectUuid: projectUuid,
          runId,
          episodeNo: episodeNo,
        }, emit);

        // giggle_project_id 和角色数据已在 agent.js 各步骤完成后实时写入
        const giggleProjectId = result.projectId || '';
        const exportUrl = result.export?.videoDownloadUrl || result.export?.videoSignedUrl || '';
        const thumbMatch = exportUrl.match(/(https:\/\/assets\.giggle\.pro\/public\/ai_director\/[^\/]+\/[^.?]+)\.mp4/);
        const coverUrl = result.export?.videoThumbnailUrl || (thumbMatch ? thumbMatch[1] + '.thumb.jpg' : '');

        await finishRun(db, { runId, status: 'completed', exportUrl });
        await updateProjectEpisode(db, {
          projectUuid,
          episodeNo: Number(episodeNo),
          status: 'completed',
          runId,
          giggleProjectId,
          exportUrl,
          coverUrl,
        });
        await addLog(db, { runId, stage: 'distribute', tagClass: 'system', tagText: 'SYSTEM', payload: exportUrl ? `Final video: ${exportUrl}` : 'Final video exported.' });

        // 单集完成时不在此决定项目整体状态（race condition：下一集可能还没设为 running）
        // 整体状态由 runAutoRun 末尾统一设置；这里只确保还有 running 时不误设 completed
        const episodes = await listProjectEpisodesByUuid(db, projectUuid);
        const hasRunning = episodes.some((ep) => ep.status === 'running');
        const hasFailed = episodes.some((ep) => ep.status === 'failed' || ep.status === 'partial_failed');
        if (hasRunning) {
          await setStoryProjectStatus(db, { projectUuid, status: 'running' });
        } else if (hasFailed) {
          await setStoryProjectStatus(db, { projectUuid, status: 'partial_failed' });
        }
        // 不在这里设 completed，runAutoRun 末尾会统一处理
      } catch (error) {
        await addLog(db, { runId, stage: 'distribute', tagClass: 'system', tagText: 'SYSTEM', payload: `Pipeline failed: ${error.message || 'agent failed'}` });
        await finishRun(db, { runId, status: 'failed', exportUrl: '' });
        await updateProjectEpisode(db, { projectUuid, episodeNo: Number(episodeNo), status: 'failed', runId });
        await setStoryProjectStatus(db, { projectUuid, status: 'partial_failed' });
      }
    })();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/agent/run', async (req, res) => {
  const { idea, projectName, aspect, language, videoDuration, styleId, videoModel, secondModel, shotDuration } = req.body || {};
  if (!idea || !idea.trim()) {
    return res.status(400).json({ ok: false, error: 'idea is required' });
  }

  const missing = [];
  if (!process.env.GIGGLE_API_KEY) missing.push('GIGGLE_API_KEY');
  if (missing.length) {
    return res.status(400).json({ ok: false, error: `Missing env: ${missing.join(', ')}` });
  }

  const runId = randomUUID();
  await createRun(db, { runId, idea: idea.trim(), projectName: projectName || '' });

  const emit = (tagClass, tagText, payload, stage) => {
    addLog(db, { runId, stage, tagClass, tagText, payload }).catch(() => {});
  };

  res.json({ ok: true, runId, status: 'running' });

  (async () => {
    try {
      const giggle = new GiggleClient({
        baseUrl: GIGGLE_BASE_URL,
        apiKey: process.env.GIGGLE_API_KEY,
        authMode: process.env.GIGGLE_AUTH_MODE || 'x-auth',
      });

      const agent = new DramaAgent({
        giggle,
        pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 5000),
        pollTimeoutMs: Number(process.env.POLL_TIMEOUT_MS || 3600000), // 默认60分钟
      });

      const result = await agent.run({
        idea: idea.trim(),
        projectName,
        aspect,
        language,
        videoDuration,
        styleId,
        videoModel,
        secondModel,
        shotDuration,
      }, emit);

      const projectId = result.projectId || '';
      if (projectId) await setProjectId(db, { runId, projectId });

      const scriptStep = result.steps.find((s) => s.step === 'script.expand');
      if (scriptStep) {
        await saveScript(db, { runId, projectId, taskId: scriptStep.taskId, storyData: scriptStep.storyData || {} });
      }

      const charactersStep = result.steps.find((s) => s.step === 'character.generate');
      if (charactersStep) {
        await replaceCharacters(db, { runId, projectId, characters: charactersStep.characterList || [] });
      }

      const storyboardStep = result.steps.find((s) => s.step === 'storyboard.generate');
      if (storyboardStep) {
        await replaceStoryboards(db, { runId, projectId, shots: storyboardStep.shots || [] });
      }

      const exportUrl = result.export?.videoDownloadUrl || result.export?.videoSignedUrl || '';
      await finishRun(db, { runId, status: 'completed', exportUrl });
      await addLog(db, { runId, stage: 'distribute', tagClass: 'system', tagText: 'SYSTEM', payload: exportUrl ? `Final video: ${exportUrl}` : 'Final video exported.' });
    } catch (error) {
      await addLog(db, { runId, stage: 'distribute', tagClass: 'system', tagText: 'SYSTEM', payload: `Pipeline failed: ${error.message || 'agent failed'}` });
      await finishRun(db, { runId, status: 'failed', exportUrl: '' });
    }
  })();
});

app.get('/api/agent/status/:runId', async (req, res) => {
  try {
    const runId = req.params.runId;
    const sinceId = Number(req.query.since_id || 0);
    const run = await getRunByRunId(db, runId);
    if (!run) return res.status(404).json({ ok: false, error: 'run not found' });
    const logs = await getRunLogsSince(db, runId, sinceId, 200);
    const lastLogId = logs.length ? logs[logs.length - 1].id : sinceId;
    res.json({
      ok: true,
      run: {
        run_id: run.run_id,
        project_id: run.project_id,
        status: run.status,
        export_url: run.export_url,
        updated_at: run.updated_at,
      },
      logs: logs.map((l) => ({
        id: l.id,
        stage: l.stage,
        tagClass: l.tag_class,
        tagText: l.tag_text,
        payload: l.payload,
        at: l.created_at,
      })),
      last_log_id: lastLogId,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const DASHBOARD_HTML = path.resolve(__dirname, '..', 'assets', 'dashboard.html');

app.get('/', (req, res) => {
  res.sendFile('dashboard.html', { root: path.resolve(__dirname, '..', 'assets') });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, error: err.message || 'internal error' });
});

// ── 查询当前隧道地址 ──
app.get('/api/tunnel-url', (req, res) => {
  const { execSync } = require('child_process');
  try {
    const log = execSync("grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /home/storyclaw/.claw/ai-drama-tunnel.log 2>/dev/null | tail -1", { encoding: 'utf8' }).trim();
    res.json({ ok: true, url: log || null });
  } catch {
    res.json({ ok: true, url: null });
  }
});


// ── 重新生成剧本接口 ──
app.post('/api/agent/projects/:projectUuid/regenerate-script', async (req, res) => {
  try {
    const { projectUuid } = req.params;
    const project = await getStoryProject(db, projectUuid);
    if (!project) return res.status(404).json({ ok: false, error: 'project not found' });
    await setStoryProjectStatus(db, { projectUuid, status: 'generating' });
    res.json({ ok: true, message: 'regenerating' });
    triggerScriptGeneration(projectUuid, project.idea, project.episode_count || 1);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const _generatingSet = new Set();
const { spawn } = require('child_process');

// Giggle 支持的风格列表(缓存,避免重复请求)
const GIGGLE_STYLES = [
  { id: 142, name: '3D古风', desc: '3D国风仙侠,史诗幻想,适合古装、修仙、宫廷' },
  { id: 143, name: '2D漫剧', desc: '日漫国漫二次元,适合青春、校园、轻喜剧' },
  { id: 144, name: '吉卜力', desc: '治愈手绘,温暖生活气息,适合温情、家庭、治愈' },
  { id: 145, name: '皮克斯', desc: '3D卡通动画,情绪强烈,适合喜剧、奇幻、儿童' },
  { id: 146, name: '写实风格', desc: '电影级写实,真实光影,适合都市、商战、悬疑、爱情' },
  { id: 147, name: '二次元', desc: '标准动漫画风,适合二次元、恋爱、热血' },
  { id: 148, name: '国风水墨', desc: '中国水墨,意境留白,适合古风、诗意、历史' },
];

async function matchStyleId(idea) {
  try {
    const styleList = GIGGLE_STYLES.map(s => s.id + '. ' + s.name + ':' + s.desc).join('\n');
    const prompt = '根据以下短剧创意,从风格列表中选择最合适的一个风格,只返回风格ID数字,不要任何其他内容。\n\n创意:' + idea + '\n\n风格列表:\n' + styleList;
    const GATEWAY = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';
    const PASS = process.env.OPENCLAW_GATEWAY_PASSWORD || '';
    const resp = await fetch(GATEWAY + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + PASS },
      body: JSON.stringify({ model: 'openclaw', messages: [{ role: 'user', content: prompt }], temperature: 0.1 }),
    });
    const json = await resp.json();
    const text = (json?.choices?.[0]?.message?.content || '').trim();
    const matched = parseInt(text.match(/\d+/)?.[0] || '0');
    const valid = GIGGLE_STYLES.find(s => s.id === matched);
    if (valid) {
      console.log('[StyleMatch] idea matched style:', valid.id, valid.name);
      return valid.id;
    }
  } catch (e) {
    console.warn('[StyleMatch] failed:', e.message);
  }
  return 146; // 默认写实风格(都市剧最常见)
}

function triggerScriptGeneration(projectUuid, idea, episodeCount, existingRunId) {
  if (_generatingSet.has(projectUuid)) {
    console.log(`[AI Script] already generating ${projectUuid}, skip`);
    return;
  }
  _generatingSet.add(projectUuid);

  // 复用已有 runId（命名阶段提前创建），或新建
  const scriptRunId = existingRunId || randomUUID();
  if (!existingRunId) {
    createRun(db, { runId: scriptRunId, idea, projectName: `[剧本生成] ${projectUuid.slice(0,8)}` }).catch(() => {});
    db.prepare('UPDATE story_projects SET script_run_id=? WHERE project_uuid=?').run(scriptRunId, projectUuid);
  }

  const scriptPath = require('path').join(__dirname, 'generate_script.js');
  const child = spawn(process.execPath, [scriptPath, projectUuid, idea, String(episodeCount || 1), scriptRunId], {
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
    cwd: process.cwd(),
  });
  child.unref();

  child.on('exit', (code) => {
    _generatingSet.delete(projectUuid);
    console.log(`[AI Script] subprocess exited code=${code} for ${projectUuid}`);
    if (code === 0) {
      // 剧本生成成功,直接在主进程触发全剧流水线
      console.log(`[AI Script] triggering auto-run for ${projectUuid}`);
      runAutoRun(projectUuid).catch(e => console.error('[AutoRun] failed:', e.message));
    }
  });
  child.on('error', (e) => {
    _generatingSet.delete(projectUuid);
    console.error(`[AI Script] subprocess error: ${e.message}`);
  });
}

// ── 启动时恢复 generating / running 状态的项目 ──
(async () => {
  await new Promise(r => setTimeout(r, 15000));
  try {
    const stalled = await listStoryProjects(db, 50);
    for (const p of stalled) {
      if (!p.status) continue;

      // 剧本生成未完成：恢复剧本生成
      if (p.status.startsWith('generating')) {
        const eps = await listProjectEpisodesByUuid(db, p.project_uuid);
        if (eps.length >= (p.episode_count || 1)) {
          await setStoryProjectStatus(db, { projectUuid: p.project_uuid, status: 'planned' });
          continue;
        }
        console.log(`[startup] resuming script generation for ${p.project_uuid}`);
        triggerScriptGeneration(p.project_uuid, p.idea, p.episode_count || 1);
        continue;
      }

      // 流水线运行中（running）：将各集 running 状态重置为 planned，重新触发全剧流水线
      if (p.status === 'running') {
        const eps = await listProjectEpisodesByUuid(db, p.project_uuid);
        const allDone = eps.length > 0 && eps.every(e =>
          e.status === 'completed' || e.status === 'failed' || e.status === 'partial_failed'
        );
        if (allDone) {
          // 实际已全部完成，修正项目状态
          const hasAnyFailed = eps.some(e => e.status === 'failed' || e.status === 'partial_failed');
          await setStoryProjectStatus(db, { projectUuid: p.project_uuid, status: hasAnyFailed ? 'failed' : 'completed' });
          continue;
        }
        // 将 running 状态的集重置为 planned，避免 Phase1 重跑时被跳过
        for (const ep of eps) {
          if (ep.status === 'running') {
            db.prepare('UPDATE project_episodes SET status=?,updated_at=? WHERE project_uuid=? AND episode_no=?')
              .run('planned', new Date().toISOString(), p.project_uuid, ep.episode_no);
            console.log(`[startup] reset EP${ep.episode_no} running->planned for ${p.project_uuid}`);
          }
        }
        console.log(`[startup] resuming pipeline for running project ${p.project_uuid}`);
        runAutoRun(p.project_uuid).catch(e => console.error('[startup] runAutoRun failed:', e.message));
        continue;
      }
    }
  } catch (e) {
    console.warn('[startup] resume check failed:', e.message);
  }
})();


// 从 Giggle 实时拉取分镜列表
app.get('/api/agent/projects/:projectUuid/shots', async (req, res) => {
  try {
    const ep = await getProjectEpisodeByNo(db, { projectUuid: req.params.projectUuid, episodeNo: Number(req.query.episode_no || 1) });
    if (!ep?.giggle_project_id) return res.json({ ok: true, data: [] });
    const giggle = new GiggleClient({
      baseUrl: GIGGLE_BASE_URL,
      apiKey: process.env.GIGGLE_API_KEY,
      authMode: process.env.GIGGLE_AUTH_MODE || 'x-auth',
    });
    const r = await giggle.listShots(ep.giggle_project_id);
    res.json({ ok: true, data: r.data?.shot_list || [] });
  } catch (e) {
    res.json({ ok: false, error: e.message, data: [] });
  }
});

// ── 全剧流水线核心函数(供 HTTP 接口和子进程回调共用)──
async function runAutoRun(projectUuid) {
    const project = await getStoryProject(db, projectUuid);
    if (!project) throw new Error('project not found: ' + projectUuid);

    // 开始前检查必要环境变量，避免初始化平台后才报错导致状态脱节
    if (!process.env.GIGGLE_API_KEY) {
      await setStoryProjectStatus(db, { projectUuid, status: 'failed' });
      console.error(`[runAutoRun] GIGGLE_API_KEY 未配置，無法启动流水线 (project: ${projectUuid})`);
      throw new Error('GIGGLE_API_KEY is not configured. Please set it in .env and restart.');
    }

    const episodes = await listProjectEpisodesByUuid(db, projectUuid);
    if (!episodes.length) throw new Error('no episodes found for ' + projectUuid);

    // 为整个流水线创建一个顶层 run(用于状态展示)
    const pipelineRunId = require('crypto').randomUUID();
    await createRun(db, {
      runId: pipelineRunId,
      idea: project.idea,
      projectName: `${project.name} 全剧自动流水线`,
    });
    // 将 pipeline run 关联到 story_project
    await setProjectId(db, { runId: pipelineRunId, projectId: projectUuid });
    const pipelineEmit = (tagClass, tagText, payload, stage) => {
      addLog(db, { runId: pipelineRunId, stage, tagClass, tagText, payload }).catch(() => {});
    };

    // 更新项目状态
    await setStoryProjectStatus(db, { projectUuid, status: 'running' });
    await updateProjectEpisode(db, { projectUuid, status: 'running' });

    const giggle = new GiggleClient({
      baseUrl: GIGGLE_BASE_URL,
      apiKey: process.env.GIGGLE_API_KEY,
      authMode: process.env.GIGGLE_AUTH_MODE || 'x-auth',
    });
    const agent = new DramaAgent({
      giggle,
      pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 5000),
      pollTimeoutMs: Number(process.env.POLL_TIMEOUT_MS || 3600000),
    });

    const styleId = project.style_id || 146;
    const videoDuration = project.video_duration || 60;

    // ── Phase 1:串行跑完所有集的分镜图 ──
    pipelineEmit('system', 'SYSTEM', `[Pipeline] Phase 1 开始:生成分镜图(${episodes.length} 集)`, 'system');
    for (const ep of episodes) {
      // 已完成 Phase1 或已完成的集直接跳过
      if (ep.status === 'phase1_done' || ep.status === 'completed') {
        pipelineEmit('system', 'SYSTEM', `[Pipeline] EP${ep.episode_no} Phase 1 已完成，跳过`, 'system');
        continue;
      }
      // 正在运行的集（服务重启后恢复）也跳过 Phase1，让 Phase2 处理
      if (ep.status === 'running' && ep.giggle_project_id) {
        pipelineEmit('system', 'SYSTEM', `[Pipeline] EP${ep.episode_no} Phase 1 进行中（恢复），跳过重跑`, 'system');
        continue;
      }
      pipelineEmit('system', 'SYSTEM', `[Pipeline] Phase 1 - EP${ep.episode_no} 开始`, 'system');

      // 清理旧数据
      if (ep.run_id) {
        for (const tbl of ['run_logs', 'scripts', 'storyboards', 'characters']) {
          db.prepare(`DELETE FROM ${tbl} WHERE run_id=?`).run(ep.run_id);
        }
        db.prepare('DELETE FROM runs WHERE run_id=?').run(ep.run_id);
      }
      const runId = require('crypto').randomUUID();
      await createRun(db, { runId, idea: project.idea, projectName: `${project.name}-EP${String(ep.episode_no).padStart(2, '0')}` });
      await updateProjectEpisode(db, { projectUuid, episodeNo: ep.episode_no, status: 'running', runId });
      const emit = (tagClass, tagText, payload, stage) => {
        addLog(db, { runId, stage, tagClass, tagText, payload }).catch(() => {});
      };

      try {
        const phase1Result = await agent.runPhase1({
          idea: ep.script_text || ep.outline || project.idea,
          projectName: `${project.name}-EP${String(ep.episode_no).padStart(2, '0')}`,
          aspect: project.aspect || '16:9',
          language: project.language || 'zh-CN',
          videoDuration,
          styleId,
          videoModel: 'seedance-2.0-pro',
          secondModel: 'seedance-2.0-pro',
          shotDuration: 5,
          db,
          storyProjectUuid: projectUuid,
          runId,
          episodeNo: ep.episode_no,
        }, emit);
        // Phase1 完成:标记集状态为 phase1_done,方便前端区分阶段
        db.prepare('UPDATE project_episodes SET status=?,updated_at=? WHERE project_uuid=? AND episode_no=?')
          .run('phase1_done', new Date().toISOString(), projectUuid, ep.episode_no);
        db.prepare('UPDATE runs SET status=?,updated_at=? WHERE run_id=?')
          .run('phase1_done', new Date().toISOString(), runId);
        pipelineEmit('system', 'SYSTEM', `[Pipeline] EP${ep.episode_no} Phase 1 完成`, 'system');
      } catch (e) {
        pipelineEmit('system', 'SYSTEM', `[Pipeline] EP${ep.episode_no} Phase 1 失败: ${e.message}`, 'system');
        await finishRun(db, { runId, status: 'failed', exportUrl: '' });
        await updateProjectEpisode(db, { projectUuid, episodeNo: ep.episode_no, status: 'failed', runId });
        continue; // Phase 1 失败直接跳过该集的 Phase 2
      }
    }
    pipelineEmit('system', 'SYSTEM', `[Pipeline] Phase 1 全部完成,开始 Phase 2`, 'system');

    // ── Phase 2:串行跑完所有集的视频+导出 ──
    // 重新从 DB 读取最新 episodes(Phase1 已写入新的 run_id 和 giggle_project_id)
    const updatedEpisodes = await listProjectEpisodesByUuid(db, projectUuid);
    for (const ep of updatedEpisodes) {
      // 已完成的集跳过 Phase2，避免重跑时覆盖 completed 状态
      if (ep.status === 'completed' && ep.export_url) {
        pipelineEmit('system', 'SYSTEM', `[Pipeline] EP${ep.episode_no} Phase 2 已完成，跳过`, 'system');
        continue;
      }
      // 失败的集跳过 Phase2（不自动重试，让用户手动触发）
      if (ep.status === 'failed' || ep.status === 'partial_failed') {
        pipelineEmit('system', 'SYSTEM', `[Pipeline] EP${ep.episode_no} 已失败，跳过 Phase 2`, 'system');
        continue;
      }
      pipelineEmit('system', 'SYSTEM', `[Pipeline] Phase 2 - EP${ep.episode_no} 开始`, 'system');

      // 从最新 DB 读取 Phase1 写入的 runId 和 giggle_project_id
      let runId = ep.run_id;
      const giggleProjectId = ep.giggle_project_id;
      // giggle_project_id 是 Phase2 的必要条件，没有则跳过
      if (!giggleProjectId) {
        pipelineEmit('system', 'SYSTEM', `[Pipeline] EP${ep.episode_no} 缺少 giggle_project_id，跳过`, 'system');
        continue;
      }
      // run_id 为空时自动创建（避免因手动修复导致 run_id=NULL 而跳过）
      if (!runId) {
        runId = require('crypto').randomUUID();
        await createRun(db, { runId, idea: project.idea, projectName: `${project.name}-EP${String(ep.episode_no).padStart(2,'0')}` });
        db.prepare('UPDATE project_episodes SET run_id=?,updated_at=? WHERE project_uuid=? AND episode_no=?')
          .run(runId, new Date().toISOString(), projectUuid, ep.episode_no);
        pipelineEmit('system', 'SYSTEM', `[Pipeline] EP${ep.episode_no} 自动创建 runId`, 'system');
      }
      // Phase2 开始:把 episode 和 run 状态改回 running
      db.prepare('UPDATE project_episodes SET status=?,updated_at=? WHERE project_uuid=? AND episode_no=?')
        .run('running', new Date().toISOString(), projectUuid, ep.episode_no);
      db.prepare('UPDATE runs SET status=?,updated_at=? WHERE run_id=?')
        .run('running', new Date().toISOString(), runId);
      const emit = (tagClass, tagText, payload, stage) => {
        addLog(db, { runId, stage, tagClass, tagText, payload }).catch(() => {});
      };

      try {
        const phase1Result = { projectId: giggleProjectId, steps: [] };
        const phase2Result = await agent.runPhase2(
          {
            idea: ep.script_text || ep.outline || project.idea,
            projectName: `${project.name}-EP${String(ep.episode_no).padStart(2, '0')}`,
            aspect: project.aspect || '16:9',
            language: project.language || 'zh-CN',
            videoDuration,
            styleId,
            videoModel: 'seedance-2.0-pro',
            secondModel: 'seedance-2.0-pro',
            db,
            storyProjectUuid: projectUuid,
            runId,
            episodeNo: ep.episode_no,
          },
          emit,
          phase1Result,
        );

        // 写入导出结果
        const exportUrl = phase2Result.export?.videoDownloadUrl || phase2Result.export?.videoSignedUrl || '';
        const thumbMatch = exportUrl.match(/(https:\/\/assets\.giggle\.pro\/public\/ai_director\/[^\/]+\/[^.?]+)\.mp4/);
        const coverUrl = thumbMatch ? thumbMatch[1] + '.thumb.jpg' : '';
        await finishRun(db, { runId, status: 'completed', exportUrl });
        await updateProjectEpisode(db, {
          projectUuid, episodeNo: ep.episode_no, status: 'completed',
          runId, giggleProjectId, exportUrl, coverUrl,
        });
        await addLog(db, { runId, stage: 'distribute', tagClass: 'system', tagText: 'SYSTEM', payload: `Final video: ${exportUrl}` });
        pipelineEmit('system', 'SYSTEM', `[Pipeline] EP${ep.episode_no} Phase 2 完成`, 'system');
      } catch (e) {
        pipelineEmit('system', 'SYSTEM', `[Pipeline] EP${ep.episode_no} Phase 2 失败: ${e.message}`, 'system');
        await finishRun(db, { runId, status: 'failed', exportUrl: '' });
        await updateProjectEpisode(db, { projectUuid, episodeNo: ep.episode_no, status: 'failed', runId });
      }
    }

    // ── 全剧完成:清理角色库 ──
    pipelineEmit('system', 'SYSTEM', `[Pipeline] 全剧完成,清理角色库...`, 'system');
    const chars = db.prepare('SELECT library_character_id FROM story_characters WHERE story_project_uuid=?').all(projectUuid);
    const deleted = [];
    for (const c of chars) {
      if (!c.library_character_id) continue;
      try {
        const r = await giggle.deleteCharacterFromLibrary(c.library_character_id);
        pipelineEmit('agent-b', 'AGENT-B', `[CastingAgent] 删除角色 library_character_id=${c.library_character_id} 完成`, 'casting');
        deleted.push(c.library_character_id);
      } catch (e) {
        pipelineEmit('agent-b', 'AGENT-B', `[CastingAgent] 删除角色失败 library_character_id=${c.library_character_id}: ${e.message}`, 'casting');
      }
    }
    // 从本地 story_characters 表删除(可选,保留记录也可以)

    // 更新项目状态
    const finalEps = await listProjectEpisodesByUuid(db, projectUuid);
    const hasFailed = finalEps.some((e) => e.status === 'failed');
    await setStoryProjectStatus(db, { projectUuid, status: hasFailed ? 'partial_failed' : 'completed' });
    await finishRun(db, { runId: pipelineRunId, status: 'completed', exportUrl: '' });
    pipelineEmit('system', 'SYSTEM', `[Pipeline] 全剧流水线完成,已删除 ${deleted.length} 个角色`, 'system');

    // ── X2C 自动发布(异步,不阻塞主流程,不影响现有功能)──
    if (!hasFailed) {
      const project = await getStoryProject(db, projectUuid);
      // 检查是否已发布
      if (!project?.x2c_project_id) {
        pipelineEmit('system', 'SYSTEM', '[X2C] 开始自动发布到 X2C 平台...', 'system');
        try {
          // 需求3：按集数升序排列，只发布有 export_url 的集
          const episodesForPublish = finalEps
            .filter(e => e.export_url)
            .sort((a, b) => a.episode_no - b.episode_no)
            .map(e => ({
              episode_no: e.episode_no,
              export_url: e.export_url,
              cover_url: e.cover_url || '',
            }));
          if (!episodesForPublish.length) throw new Error('没有可发布的视频');
          const result = await publishToX2CWithProgress({
            projectName: project.name,
            idea: project.idea,
            episodes: episodesForPublish,
            onProgress: (tagClass, tagText, payload) =>
              pipelineEmit(tagClass, tagText, payload, 'distribute'),
          });
          // 写入 DB
          db.prepare('UPDATE story_projects SET x2c_project_id=?,x2c_status=?,x2c_published_at=?,updated_at=? WHERE project_uuid=?')
            .run(result.x2cProjectId, result.status, new Date().toISOString(), new Date().toISOString(), projectUuid);
          pipelineEmit('system', 'SYSTEM', `[X2C] 发布成功!分类:${result.category},项目ID:${result.x2cProjectId},状态:${result.status}`, 'system');
        } catch (e) {
          pipelineEmit('system', 'SYSTEM', `[X2C] 发布失败(不影响制作结果):${e.message}`, 'system');
          console.error('[X2C] publish error:', e.message);
        }
      } else {
        pipelineEmit('system', 'SYSTEM', `[X2C] 已发布,跳过(x2c_project_id=${project.x2c_project_id})`, 'system');
      }
    }

    return { pipelineRunId, phase1Count: episodes.length, deletedCharacters: deleted };
}

// 防重入：同一项目同时只允许一个 pipeline 在跑
const _autoRunSet = new Set();

// HTTP 接口:触发全剧流水线(立即返回,后台异步执行)
app.post('/api/agent/projects/:projectUuid/auto-run', async (req, res) => {
  const { projectUuid } = req.params;
  try {
    if (_autoRunSet.has(projectUuid)) {
      return res.json({ ok: true, data: { projectUuid, status: 'already_running' } });
    }
    const project = await getStoryProject(db, projectUuid);
    if (!project) return res.status(404).json({ ok: false, error: 'project not found' });
    const episodes = await listProjectEpisodesByUuid(db, projectUuid);
    if (!episodes.length) return res.status(400).json({ ok: false, error: 'no episodes found' });
    // 立即返回,后台异步执行
    res.json({ ok: true, data: { projectUuid, status: 'pipeline_started' } });
    _autoRunSet.add(projectUuid);
    runAutoRun(projectUuid)
      .catch(e => console.error('[AutoRun] failed:', e.message))
      .finally(() => _autoRunSet.delete(projectUuid));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── X2C 钉包余额查询 ──
app.get('/api/x2c/balance', async (req, res) => {
  try {
    const data = await getWalletBalance();
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, data: {} });
  }
});

// ── Dashboard Overview KPI ──
app.get('/api/x2c/dashboard/overview', async (req, res) => {
  try {
    const data = await x2cCall({ action: 'dashboard/overview' });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, data: {} });
  }
});

// ── Dashboard Platform Breakdown ──
app.get('/api/x2c/dashboard/platform-breakdown', async (req, res) => {
  try {
    const data = await x2cCall({ action: 'dashboard/platform-breakdown' });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, data: {} });
  }
});

// ── X2C 钱包交易记录（收益/消费明细）──
app.get('/api/x2c/wallet/transactions', async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Math.min(Number(req.query.pageSize) || 20, 100);
    const type = req.query.type || 'all'; // 'all' | 'earnings' | 'purchases'
    const data = await getWalletTransactions({ page, pageSize, type });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── X2C 状态手动同步（前端可调）──
app.post('/api/x2c/sync', async (req, res) => {
  try {
    await syncX2cStatus();
    res.json({ ok: true, message: 'X2C 状态同步完成' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 单集重试（从失败点继续，不走完整流程）──
const _retryingSet = new Set(); // 防重入

app.post('/api/agent/projects/:projectUuid/episodes/:episodeNo/retry', async (req, res) => {
  const { projectUuid, episodeNo } = req.params;
  const epNo = Number(episodeNo);
  const retryKey = `${projectUuid}-${epNo}`;
  try {
    if (_retryingSet.has(retryKey)) {
      return res.json({ ok: true, data: { status: 'already_retrying' } });
    }
    const project = await getStoryProject(db, projectUuid);
    if (!project) return res.status(404).json({ ok: false, error: 'project not found' });
    const ep = await getProjectEpisodeByNo(db, { projectUuid, episodeNo: epNo });
    if (!ep) return res.status(404).json({ ok: false, error: 'episode not found' });
    if (ep.status === 'completed' && ep.export_url) {
      return res.status(400).json({ ok: false, error: '该集已完成，无需重试' });
    }
    if (ep.status === 'running') {
      return res.status(400).json({ ok: false, error: '该集正在制作中' });
    }

    res.json({ ok: true, data: { projectUuid, episodeNo: epNo, status: 'retry_started' } });
    _retryingSet.add(retryKey);

    // 后台异步重试
    (async () => {
      try {
        // 更新状态为 running
        const runId = ep.run_id || require('crypto').randomUUID();
        if (!ep.run_id) {
          await createRun(db, { runId, idea: project.idea, projectName: `${project.name}-EP${String(epNo).padStart(2,'0')}` });
          db.prepare('UPDATE project_episodes SET run_id=?,updated_at=? WHERE project_uuid=? AND episode_no=?')
            .run(runId, new Date().toISOString(), projectUuid, epNo);
        }
        db.prepare('UPDATE project_episodes SET status=?,updated_at=? WHERE project_uuid=? AND episode_no=?')
          .run('running', new Date().toISOString(), projectUuid, epNo);
        db.prepare('UPDATE runs SET status=?,updated_at=? WHERE run_id=?')
          .run('running', new Date().toISOString(), runId);
        db.prepare('UPDATE story_projects SET status=?,updated_at=? WHERE project_uuid=?')
          .run('running', new Date().toISOString(), projectUuid);

        const emit = (tagClass, tagText, payload, stage) => {
          addLog(db, { runId, stage, tagClass, tagText, payload }).catch(() => {});
        };
        emit('system', 'SYSTEM', `[Retry] EP${epNo} 开始重试`, 'system');

        const giggle = new GiggleClient({
          baseUrl: GIGGLE_BASE_URL,
          apiKey: process.env.GIGGLE_API_KEY,
          authMode: process.env.GIGGLE_AUTH_MODE || 'x-auth',
        });
        const agent = new DramaAgent({
          giggle,
          pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 5000),
          pollTimeoutMs: Number(process.env.POLL_TIMEOUT_MS || 3600000),
        });

        const styleId = project.style_id || 146;
        const videoDuration = project.video_duration || 60;

        const retryResult = await agent.runRetry({
          idea: ep.script_text || ep.outline || project.idea,
          projectName: `${project.name}-EP${String(epNo).padStart(2,'0')}`,
          aspect: project.aspect || '16:9',
          language: project.language || 'zh-CN',
          videoDuration,
          styleId,
          videoModel: 'seedance-2.0-pro',
          secondModel: 'seedance-2.0-pro',
          db,
          storyProjectUuid: projectUuid,
          runId,
          episodeNo: epNo,
          giggleProjectId: ep.giggle_project_id || null,
        }, emit);

        const exportUrl = retryResult.export?.videoDownloadUrl || retryResult.export?.videoSignedUrl || '';
        const giggleProjectId = retryResult.projectId || ep.giggle_project_id || '';
        const thumbMatch = exportUrl.match(/(https:\/\/assets\.giggle\.pro\/public\/ai_director\/[^\/]+\/[^.?]+)\.mp4/);
        const coverUrl = thumbMatch ? thumbMatch[1] + '.thumb.jpg' : (ep.cover_url || '');

        await finishRun(db, { runId, status: 'completed', exportUrl });
        await updateProjectEpisode(db, { projectUuid, episodeNo: epNo, status: 'completed', runId, giggleProjectId, exportUrl, coverUrl });
        emit('system', 'SYSTEM', `[Retry] EP${epNo} 重试成功，视频: ${exportUrl}`, 'system');

        // 检查是否所有集都完成了，更新项目状态
        const allEps = await listProjectEpisodesByUuid(db, projectUuid);
        const hasFailed = allEps.some(e => e.status === 'failed');
        const allDone = allEps.every(e => e.status === 'completed' || e.status === 'failed');
        if (allDone) {
          await setStoryProjectStatus(db, { projectUuid, status: hasFailed ? 'partial_failed' : 'completed' });
        }
      } catch (e) {
        console.error(`[Retry] EP${epNo} failed:`, e.message);
        const ep2 = await getProjectEpisodeByNo(db, { projectUuid, episodeNo: epNo });
        if (ep2?.run_id) {
          await finishRun(db, { runId: ep2.run_id, status: 'failed', exportUrl: '' });
          addLog(db, { runId: ep2.run_id, stage: 'system', tagClass: 'system', tagText: 'SYSTEM', payload: `[Retry] EP${epNo} 重试失败: ${e.message}` }).catch(() => {});
        }
        db.prepare('UPDATE project_episodes SET status=?,updated_at=? WHERE project_uuid=? AND episode_no=?')
          .run('failed', new Date().toISOString(), projectUuid, epNo);
        // 检查其他集状态决定项目状态
        const allEps = await listProjectEpisodesByUuid(db, projectUuid);
        const allDone2 = allEps.every(ep => ep.status === 'completed' || ep.status === 'failed');
        if (allDone2) {
          await setStoryProjectStatus(db, { projectUuid, status: 'partial_failed' });
        }
      } finally {
        _retryingSet.delete(retryKey);
      }
    })();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── 手动发布到 X2C ──
app.post('/api/agent/projects/:projectUuid/publish-x2c', async (req, res) => {
  try {
    const { projectUuid } = req.params;
    const project = await getStoryProject(db, projectUuid);
    if (!project) return res.status(404).json({ ok: false, error: 'project not found' });
    if (project.x2c_project_id) return res.json({ ok: false, error: '已发布，请勿重复发布' });

    const episodes = await listProjectEpisodesByUuid(db, projectUuid);
    const validEps = episodes
      .filter(e => e.export_url)
      .sort((a, b) => a.episode_no - b.episode_no);
    if (!validEps.length) return res.status(400).json({ ok: false, error: '没有可发布的视频，请等待制作完成' });

    const allTerminal = episodes.every(e =>
      e.status === 'completed' || e.status === 'failed' || e.status === 'partial_failed'
    );
    if (!allTerminal) return res.status(400).json({ ok: false, error: '还有集正在制作中，请等待全部完成后再发布' });

    // 创建一个 publish run，用于前端通过 /api/agent/status/:runId 拉取日志
    const publishRunId = require('crypto').randomUUID();
    await createRun(db, { runId: publishRunId, idea: project.idea, projectName: `${project.name} · X2C 发布` });
    await setProjectId(db, { runId: publishRunId, projectId: projectUuid });

    const emit = (tagClass, tagText, payload) =>
      addLog(db, { runId: publishRunId, stage: 'distribute', tagClass, tagText, payload }).catch(() => {});

    // 立即返回 publishRunId，前端可用它轮询进度
    res.json({ ok: true, publishing: true, publishRunId, message: '发布已开始，请跟踪进度' });

    // 后台异步执行发布
    (async () => {
      try {
        emit('system', 'SYSTEM', `[X2C] 开始发布《${project.name}》，共 ${validEps.length} 集`, 'distribute');
        emit('agent-e', 'AGENT-E', '[X2C] 正在获取 S3 上传链接...', 'distribute');

        const episodesForPublish = validEps.map(e => ({
          episode_no: e.episode_no,
          export_url: e.export_url,
          cover_url: e.cover_url || '',
        }));

        // 注入 emit 到 publishToX2C（通过在 x2cPublish 里暴露带回调版本）
        const result = await publishToX2CWithProgress({
          projectName: project.name,
          idea: project.idea,
          episodes: episodesForPublish,
          onProgress: emit,
        });

        db.prepare('UPDATE story_projects SET x2c_project_id=?,x2c_status=?,x2c_published_at=?,updated_at=? WHERE project_uuid=?')
          .run(result.x2cProjectId, result.status, new Date().toISOString(), new Date().toISOString(), projectUuid);
        db.prepare('UPDATE runs SET status=?,updated_at=? WHERE run_id=?')
          .run('completed', new Date().toISOString(), publishRunId);
        emit('system', 'SYSTEM', `[X2C] 发布成功！项目ID: ${result.x2cProjectId} · ${result.message}`, 'distribute');
      } catch (e) {
        db.prepare('UPDATE runs SET status=?,updated_at=? WHERE run_id=?')
          .run('failed', new Date().toISOString(), publishRunId);
        emit('system', 'SYSTEM', `[X2C] 发布失败: ${e.message}`, 'distribute');
        console.error('[X2C publish] failed:', e.message);
      }
    })();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── X2C 分发统计（各平台链接 + 播放量）──
app.get('/api/agent/projects/:projectUuid/video-stats', async (req, res) => {
  try {
    const { projectUuid } = req.params;
    const project = await getStoryProject(db, projectUuid);
    if (!project) return res.status(404).json({ ok: false, error: 'project not found' });
    if (!project.x2c_project_id) return res.json({ ok: true, data: null, message: '项目尚未发布到 X2C' });
    const stats = await getVideoStats(project.x2c_project_id);
    res.json({ ok: true, data: stats[0] || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── X2C 审核状态同步（每 5 分钟查一次 processing 的项目）──
async function syncX2cStatus() {
  try {
    // 同步 processing 状态 + 已发布项目的播放量
    const rows = db.prepare("SELECT project_uuid, x2c_project_id, x2c_status FROM story_projects WHERE x2c_project_id IS NOT NULL").all();
    if (!rows.length) return;
    for (const row of rows) {
      try {
        const res = await queryPublished(row.x2c_project_id);
        if (!res) continue;
        const remoteStatus = String(res.status || res.video_status || '').toLowerCase();
        const totalViews = Number(res.total_views || 0);

        // 处理 processing 状态的项目：更新审核状态
        if (row.x2c_status === 'processing') {
          if (!remoteStatus || remoteStatus === 'processing' || remoteStatus === 'pending_review' || remoteStatus === 'pending') {
            // 状态未变，但仍更新播放量
            db.prepare('UPDATE story_projects SET x2c_views=?,updated_at=? WHERE project_uuid=?')
              .run(totalViews, new Date().toISOString(), row.project_uuid);
            continue;
          }
          const localStatus = remoteStatus.includes('publish') || remoteStatus.includes('active') || remoteStatus.includes('approv')
            ? 'published' : remoteStatus.includes('fail') || remoteStatus.includes('reject') ? 'failed' : remoteStatus;
          db.prepare('UPDATE story_projects SET x2c_status=?,x2c_views=?,updated_at=? WHERE project_uuid=?')
            .run(localStatus, totalViews, new Date().toISOString(), row.project_uuid);
          console.log(`[X2C Sync] ${row.project_uuid} 状态更新: processing -> ${localStatus} views=${totalViews}`);
        } else {
          // 已发布项目：只更新播放量
          db.prepare('UPDATE story_projects SET x2c_views=?,updated_at=? WHERE project_uuid=?')
            .run(totalViews, new Date().toISOString(), row.project_uuid);
        }
      } catch (e) {
        console.warn(`[X2C Sync] 查询失败 ${row.x2c_project_id}:`, e.message);
      }
    }
  } catch (e) {
    console.warn('[X2C Sync] 定时同步异常:', e.message);
  }
}
// 启动后 30 秒开始第一次检查，此后每 5 分钟执行一次
setTimeout(() => { syncX2cStatus(); setInterval(syncX2cStatus, 5 * 60 * 1000); }, 30000);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`OpenClaw agent dashboard running at http://localhost:${port}`);
});

