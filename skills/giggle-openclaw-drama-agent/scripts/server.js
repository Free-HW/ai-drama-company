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

  const prompt = `你是专业短剧编剧。根据以下创意，生成一部完整的${total}集短剧剧本。

创意：${idea}

严格按照以下格式输出每一集，不要有任何额外说明文字：

### 🎬 第1集（目标：120秒）
【剧情概要】
（100-150字，描述本集核心剧情，交代人物关系和冲突）

【角色表】
角色名：角色描述（每行一个）

【Shot-by-Shot脚本·15-17镜头·每镜5-8秒】
Shot 1（7s）
画面/事件：（具体场景描述）
台词：角色名："台词内容"
镜头调度：（镜头运动描述）
画面Prompt：（英文风格的画面描述，用于AI生图）
音频：（音效和背景音乐描述，结尾加"高通滤波，干净静音背景，无背景噪音，无低频隆隆声"）

（继续Shot 2到Shot 15-17，格式相同）

【高能台词】
1. 角色名："台词"
2. 角色名："台词"
3. 角色名："台词"

【音频设计】
（整集音频风格描述，50字左右）

【下集预告】
（一句话预告下集内容）

要求：
- 剧情连续，每集有完整的起承转合
- 每集15-17个Shot，每个Shot 5-8秒
- 台词自然口语化，符合人物性格
- 画面Prompt用中文描述，简洁有画面感
- 所有${total}集按顺序输出，集与集之间用空行分隔`;

  // 最多重试 3 次，每次间隔 5 秒
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
      break; // 请求成功但内容不符，不重试
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
    { name: '相遇', hook: '命运安排两人意外相遇，产生强烈的第一印象。' },
    { name: '误解', hook: '一场误会让关系急转直下，双方各执一词。' },
    { name: '靠近', hook: '共同面对危机，两人不得不携手合作。' },
    { name: '心动', hook: '细节中的温柔让对方心防松动，情愫暗生。' },
    { name: '阻碍', hook: '外部势力介入，强行拆散两人。' },
    { name: '表白', hook: '压抑已久的情感在关键时刻爆发。' },
    { name: '危机', hook: '最大的考验来临，感情面临终极抉择。' },
    { name: '和解', hook: '真相大白，误会消除，两人重归于好。' },
    { name: '升华', hook: '经历磨难后感情更加坚定，共同面对未来。' },
    { name: '圆满', hook: '所有伏笔收束，以温暖结局收尾。' },
  ];
  return Array.from({ length: total }, (_, i) => {
    const arc = arcs[Math.min(i, arcs.length - 1)];
    const epNo = i + 1;
    const isLast = epNo === total;
    const nextHook = isLast ? '全剧终，留下温暖余韵。' : `下集预告：${arcs[Math.min(i + 1, arcs.length - 1)].hook}`;
    const script = [
      `【第${epNo}集·${arc.name}】`,
      ``,
      `■ 主题：${arc.hook}`,
      `■ 核心创意：${idea}`,
      ``,
      `【场景一：开场（0-15秒）】`,
      `画面：特写镜头，环境音渐入。`,
      `动作：主角出现，状态暗示本集情绪基调。`,
      ``,
      `【场景二：冲突（15-60秒）】`,
      `对白：`,
      `  主角A：（${arc.name}情绪）「……」`,
      `  主角B：（反应）「……」`,
      `动作：${arc.hook}`,
      ``,
      `【场景三：转折（60-90秒）】`,
      `画面：情绪爆点，节奏加快。`,
      `动作：局势发生意外变化，观众情绪被调动。`,
      ``,
      `【场景四：结尾钩子（90-120秒）】`,
      `画面：定格或慢镜头。`,
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

app.post('/api/agent/projects', async (req, res) => {
  try {
    const { name, idea, language, aspect, style, episodeCount, bible, characters } = req.body || {};
    if (!idea || !idea.trim()) return res.status(400).json({ ok: false, error: 'idea is required' });
    const projectUuid = randomUUID();
    await createStoryProject(db, {
      projectUuid,
      name: name || `短剧项目-${new Date().toISOString().slice(0, 10)}`,
      idea: idea.trim(),
      language: language || 'zh-CN',
      aspect: aspect || '16:9',
      style: style || '',
      episodeCount: Number(episodeCount || 1),
    });
    await upsertProjectBible(db, {
      projectUuid,
      worldSetting: bible?.worldSetting || '',
      tone: bible?.tone || '',
      styleRules: bible?.styleRules || '',
      relationshipNotes: bible?.relationshipNotes || '',
      rawJson: bible || {},
    });

    // 先返回项目创建成功，后台异步生成 AI 剧本
    await setStoryProjectStatus(db, { projectUuid, status: 'generating' });
    const project0 = await getStoryProject(db, projectUuid);
    res.json({ ok: true, data: { project: project0, episodes: [], generating: true } });

    // 异步生成剧本
    (async () => {
      try {
        const giggle = new GiggleClient({
          baseUrl: process.env.GIGGLE_BASE_URL,
          apiKey: process.env.GIGGLE_API_KEY,
          authMode: process.env.GIGGLE_AUTH_MODE || 'x-auth',
        });
        const episodes = await buildEpisodePlanAI({ idea: idea.trim(), episodeCount: Number(episodeCount || 1), giggle });
        await replaceProjectEpisodes(db, { projectUuid, episodes });
        await setStoryProjectStatus(db, { projectUuid, status: 'planned' });
      } catch (e) {
        console.error('[AI Script] async generation failed:', e.message);
        await setStoryProjectStatus(db, { projectUuid, status: 'failed' });
      }
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
    res.json({ ok: true, data: { project, episodes, characters: charsWithImages, mappings, shots: [] } });
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
          pollTimeoutMs: Number(process.env.POLL_TIMEOUT_MS || 1800000),
        });
        const result = await agent.run({
          idea: episode.script_text || episode.outline || project.idea,
          projectName: `${project.name}-EP${String(episodeNo).padStart(2, '0')}`,
          aspect: project.aspect || '16:9',
          language: project.language || 'zh-CN',
          videoDuration: req.body?.videoDuration || 60,
          styleId: req.body?.styleId || 145,
          videoModel: req.body?.videoModel || 'seedance-2.0-pro',
          secondModel: req.body?.secondModel || 'seedance15-pro',
          shotDuration: req.body?.shotDuration || 5,
          db,
          storyProjectUuid: projectUuid,
        }, emit);

        const giggleProjectId = result.projectId || '';
        if (giggleProjectId) await setProjectId(db, { runId, projectId: giggleProjectId });
        const exportUrl = result.export?.videoDownloadUrl || result.export?.videoSignedUrl || '';

        const charactersStep = result.steps.find((s) => s.step === 'character.generate');
        for (const c of charactersStep?.characterList || []) {
          const key = String(c.name || c.id || '').trim();
          if (!key) continue;
          await upsertProjectCharacter(db, {
            projectUuid,
            characterKey: key,
            name: c.name || key,
            gender: c.gender || '',
            persona: c.prompt || '',
            visualPrompt: c.prompt || '',
            voicePref: c.voice_id || '',
          });
          await upsertCharacterMapping(db, {
            projectUuid,
            projectCharacterKey: key,
            giggleCharacterId: c.id || '',
            giggleAssetId: c.asset_id || c.image_asset_id || '',
            rawJson: c,
          });
        }

        await finishRun(db, { runId, status: 'completed', exportUrl });
        await updateProjectEpisode(db, {
          projectUuid,
          episodeNo: Number(episodeNo),
          status: 'completed',
          runId,
          giggleProjectId,
          exportUrl,
          coverUrl: result.export?.videoThumbnailUrl || '',
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
        pollTimeoutMs: Number(process.env.POLL_TIMEOUT_MS || 1800000),
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

function triggerScriptGeneration(projectUuid, idea, episodeCount) {
  if (_generatingSet.has(projectUuid)) {
    console.log(`[AI Script] already generating ${projectUuid}, skip`);
    return;
  }
  _generatingSet.add(projectUuid);

  const scriptPath = require('path').join(__dirname, 'generate_script.js');
  const child = spawn(process.execPath, [scriptPath, projectUuid, idea, String(episodeCount || 1)], {
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
    cwd: process.cwd(),
  });
  child.unref(); // 父进程退出不影响子进程

  child.on('exit', (code) => {
    _generatingSet.delete(projectUuid);
    console.log(`[AI Script] subprocess exited code=${code} for ${projectUuid}`);
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
      if (p.status !== 'generating') continue;
      const eps = await listProjectEpisodesByUuid(db, p.project_uuid);
      if (eps.length > 0) {
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

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`OpenClaw agent dashboard running at http://localhost:${port}`);
});

