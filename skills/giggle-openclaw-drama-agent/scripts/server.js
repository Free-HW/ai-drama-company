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
const { publishToX2C, getWalletBalance, listPublished } = require('./x2cPublish');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'assets')));


async function x2cCall(payload) {
  const apiUrl = process.env.X2C_API_URL;
  const apiKey = process.env.X2C_API_KEY;
  if (!apiUrl || !apiKey) throw new Error('Missing env: X2C_API_URL or X2C_API_KEY');

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json.success === false) {
    throw new Error(json.error || json.message || json.msg || 'X2C API request failed');
  }
  return json;
}

const db = openDb();
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
  try {
    const GATEWAY = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';
    const PASS = process.env.OPENCLAW_GATEWAY_PASSWORD || '';
    const resp = await fetch(`${GATEWAY}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(PASS ? { Authorization: `Bearer ${PASS}` } : {}) },
      body: JSON.stringify({
        model: 'openclaw',
        max_tokens: 30,
        messages: [
          { role: 'system', content: '你是一个短剧命名专家。根据用户描述，提炼出一个简洁有力的短剧名称，4-10个字，不加书名号，不加标点，只输出名称本身。' },
          { role: 'user', content: idea },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await resp.json();
    const name = (data.choices?.[0]?.message?.content || '').trim().replace(/[《》「」【】""''\n]/g, '');
    if (name && name.length >= 2) { console.log('[AIName] gateway generated:', name); return name; }
    // Gateway 无效响应，fallback 本地提取
    const fallback = quickExtractName(idea);
    if (fallback) console.log('[AIName] fallback to quick extract:', fallback);
    return fallback;
  } catch (e) {
    console.warn('[AIName] gateway failed:', e.message, '- using quick extract');
    return quickExtractName(idea);
  }
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

    // 异步:AI命名 + 风格匹配 + 剧本生成 并行执行
    (async () => {
      // 先触发剧本生成,让前端立刻看到进度
      triggerScriptGeneration(projectUuid, idea.trim(), finalEpisodeCount);

      // AI 命名(如果用户没有输入名称)
      if (!userInputName) {
        const scriptRunId = db.prepare('SELECT script_run_id FROM story_projects WHERE project_uuid=?').get(projectUuid)?.script_run_id;
        // 写一条日志提示正在命名
        if (scriptRunId) addLog(db, { runId: scriptRunId, stage: 'system', tagClass: 'system', tagText: 'SYSTEM', payload: '[AIName] 正在分析内容,AI 智能命名中...' }).catch(() => {});
        aiGenerateProjectName(idea.trim()).then(aiName => {
          if (aiName) {
            db.prepare('UPDATE story_projects SET name=?, updated_at=? WHERE project_uuid=?')
              .run(aiName, new Date().toISOString(), projectUuid);
            console.log('[AIName] updated project name to:', aiName);
            // 写日志通知前端
            const runId2 = db.prepare('SELECT script_run_id FROM story_projects WHERE project_uuid=?').get(projectUuid)?.script_run_id;
            if (runId2) addLog(db, { runId: runId2, stage: 'system', tagClass: 'system', tagText: 'SYSTEM', payload: `[AIName] 项目命名完成:${aiName}` }).catch(() => {});
          }
        }).catch(e => console.warn('[AIName] async failed:', e.message));
      }

      // 并行匹配风格
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
    if (!process.env.GIGGLE_BASE_URL) missing.push('GIGGLE_BASE_URL');
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
          baseUrl: process.env.GIGGLE_BASE_URL,
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

        const episodes = await listProjectEpisodesByUuid(db, projectUuid);
        const hasRunning = episodes.some((ep) => ep.status === 'running');
        const hasFailed = episodes.some((ep) => ep.status === 'failed');
        await setStoryProjectStatus(db, { projectUuid, status: hasRunning ? 'running' : hasFailed ? 'partial_failed' : 'completed' });
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
  if (!process.env.GIGGLE_BASE_URL) missing.push('GIGGLE_BASE_URL');
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
        baseUrl: process.env.GIGGLE_BASE_URL,
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

function triggerScriptGeneration(projectUuid, idea, episodeCount) {
  if (_generatingSet.has(projectUuid)) {
    console.log(`[AI Script] already generating ${projectUuid}, skip`);
    return;
  }
  _generatingSet.add(projectUuid);

  // 创建 script_run_id,写入 runs 表,供前端轮询日志
  const scriptRunId = randomUUID();
  createRun(db, { runId: scriptRunId, idea, projectName: `[剧本生成] ${projectUuid.slice(0,8)}` }).catch(() => {});
  db.prepare('UPDATE story_projects SET script_run_id=? WHERE project_uuid=?').run(scriptRunId, projectUuid);

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

// ── 启动时恢复 generating 状态的项目 ──
(async () => {
  await new Promise(r => setTimeout(r, 15000));
  try {
    const stalled = await listStoryProjects(db, 50);
    for (const p of stalled) {
      if (!p.status || !p.status.startsWith('generating')) continue;
      const eps = await listProjectEpisodesByUuid(db, p.project_uuid);
      if (eps.length >= (p.episode_count || 1)) {
        await setStoryProjectStatus(db, { projectUuid: p.project_uuid, status: 'planned' });
        continue;
      }
      console.log(`[startup] resuming script generation for ${p.project_uuid}`);
      triggerScriptGeneration(p.project_uuid, p.idea, p.episode_count || 1);
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
      baseUrl: process.env.GIGGLE_BASE_URL,
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
      baseUrl: process.env.GIGGLE_BASE_URL,
      apiKey: process.env.GIGGLE_API_KEY,
      authMode: process.env.GIGGLE_AUTH_MODE || 'x-auth',
    });
    const agent = new DramaAgent({
      giggle,
      pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 5000),
      pollTimeoutMs: Number(process.env.POLL_TIMEOUT_MS || 3600000),
    });

    const styleId = project.style_id || req.body?.styleId || 146;
    const videoDuration = project.video_duration || req.body?.videoDuration || 60;

    // ── Phase 1:串行跑完所有集的分镜图 ──
    pipelineEmit('system', 'SYSTEM', `[Pipeline] Phase 1 开始:生成分镜图(${episodes.length} 集)`, 'system');
    for (const ep of episodes) {
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
      pipelineEmit('system', 'SYSTEM', `[Pipeline] Phase 2 - EP${ep.episode_no} 开始`, 'system');

      // 从最新 DB 读取 Phase1 写入的 runId 和 giggle_project_id
      const runId = ep.run_id;
      const giggleProjectId = ep.giggle_project_id;
      // Phase2 开始:把 episode 和 run 状态改回 running,前端重新触发轮询
      if (runId) {
        db.prepare('UPDATE project_episodes SET status=?,updated_at=? WHERE project_uuid=? AND episode_no=?')
          .run('running', new Date().toISOString(), projectUuid, ep.episode_no);
        db.prepare('UPDATE runs SET status=?,updated_at=? WHERE run_id=?')
          .run('running', new Date().toISOString(), runId);
      }
      if (!runId || !giggleProjectId) {
        pipelineEmit('system', 'SYSTEM', `[Pipeline] EP${ep.episode_no} 缺少 runId 或 giggle_project_id,跳过`, 'system');
        continue;
      }
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
        pipelineEmit('agent-b', 'AGENT-B', `[CastingAgent] 删除角色 library_character_id=${c.library_character_id} -> ${JSON.stringify(r?.data || r)}`, 'casting');
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
          const episodesForPublish = finalEps.map(e => ({
            episode_no: e.episode_no,
            export_url: e.export_url || '',
            cover_url: e.cover_url || '',
          }));
          const result = await publishToX2C({
            projectName: project.name,
            idea: project.idea,
            episodes: episodesForPublish,
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

// HTTP 接口:触发全剧流水线(立即返回,后台异步执行)
app.post('/api/agent/projects/:projectUuid/auto-run', async (req, res) => {
  const { projectUuid } = req.params;
  try {
    const project = await getStoryProject(db, projectUuid);
    if (!project) return res.status(404).json({ ok: false, error: 'project not found' });
    const episodes = await listProjectEpisodesByUuid(db, projectUuid);
    if (!episodes.length) return res.status(400).json({ ok: false, error: 'no episodes found' });
    // 立即返回,后台异步执行
    res.json({ ok: true, data: { projectUuid, status: 'pipeline_started' } });
    runAutoRun(projectUuid).catch(e => console.error('[AutoRun] failed:', e.message));
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

// ── X2C 已发布项目列表 ──
app.get('/api/x2c/projects', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status = 'all' } = req.query;
    const data = await listPublished({ page: Number(page), pageSize: Number(pageSize), status });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, data: {} });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`OpenClaw agent dashboard running at http://localhost:${port}`);
});

