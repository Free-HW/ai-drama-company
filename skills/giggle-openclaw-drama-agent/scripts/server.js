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

function buildEpisodePlan({ idea, episodeCount }) {
  const total = Math.max(1, Number(episodeCount || 1));
  const arcs = ['铺垫', '冲突升级', '反转', '高潮', '收束'];
  const hooks = [
    '突发事件打断日常',
    '关键人物首次正面冲突',
    '隐藏真相被提前触发',
    '代价与抉择同时到来',
    '情绪爆点后给出新悬念',
  ];
  const envs = ['清晨草原', '午后小镇', '夜雨街口', '废弃仓库', '山顶风口', '河谷营地'];
  const goals = [
    '保住当前局面',
    '找到关键线索',
    '争取盟友支持',
    '阻止对手推进',
    '完成最终选择',
  ];
  const episodes = [];
  for (let i = 1; i <= total; i += 1) {
    const ratioIdx = Math.min(arcs.length - 1, Math.floor(((i - 1) / total) * arcs.length));
    const arc = arcs[ratioIdx];
    const env = envs[(i - 1) % envs.length];
    const hook = hooks[ratioIdx];
    const goal = goals[Math.min(goals.length - 1, ratioIdx)];
    const nextHint = i === total ? '主线阶段性收束，留下下一季入口。' : `抛出 EP${i + 1} 的核心问题。`;
    const conflict = `围绕“${idea}”在${env}爆发新矛盾：${hook}。`;
    const turn = i % 2 === 0
      ? '看似占优的一方突然失手，局势逆转。'
      : '弱势方拿到临时优势，但代价立即显现。';
    const scriptText = [
      `【第${i}集：${arc}】`,
      `场景1：开场钩子（3-5秒）——${env}中出现异常信号，主角被迫行动。`,
      `场景2：情节推进（20-30秒）——${conflict} 本集目标：${goal}。`,
      `场景3：情绪爆点（10-15秒）——${turn}`,
      `场景4：结尾悬念（5-8秒）——${nextHint}`,
      '台词风格：短句、高信息密度、强节奏。'
    ].join('\n');
    episodes.push({
      episode_no: i,
      title: `第${i}集·${arc}`,
      outline: `${conflict} ${nextHint}`,
      script_text: scriptText,
      status: 'scripted',
    });
  }
  return episodes;
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
    });
    await upsertProjectBible(db, {
      projectUuid,
      worldSetting: bible?.worldSetting || '',
      tone: bible?.tone || '',
      styleRules: bible?.styleRules || '',
      relationshipNotes: bible?.relationshipNotes || '',
      rawJson: bible || {},
    });

    const episodes = buildEpisodePlan({ idea: idea.trim(), episodeCount: Number(episodeCount || 1) });
    await replaceProjectEpisodes(db, { projectUuid, episodes });

    for (const c of characters || []) {
      const key = String(c.characterKey || c.name || '').trim();
      if (!key) continue;
      await upsertProjectCharacter(db, {
        projectUuid,
        characterKey: key,
        name: c.name || key,
        gender: c.gender || '',
        persona: c.persona || '',
        visualPrompt: c.visualPrompt || '',
        voicePref: c.voicePref || '',
      });
    }

    await setStoryProjectStatus(db, { projectUuid, status: 'planned' });
    const project = await getStoryProject(db, projectUuid);
    const epRows = await listProjectEpisodesByUuid(db, projectUuid);
    res.json({ ok: true, data: { project, episodes: epRows } });
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
    res.json({ ok: true, data: { project, episodes, characters, mappings } });
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
          idea: episode.outline || project.idea,
          projectName: `${project.name}-EP${String(episodeNo).padStart(2, '0')}`,
          aspect: project.aspect || '16:9',
          language: project.language || 'zh-CN',
          videoDuration: req.body?.videoDuration || 60,
          styleId: req.body?.styleId || 1,
          videoModel: req.body?.videoModel || 'kling',
          secondModel: req.body?.secondModel || 'minimax',
          shotDuration: req.body?.shotDuration || 5,
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'assets', 'dashboard.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, error: err.message || 'internal error' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`OpenClaw agent dashboard running at http://localhost:${port}`);
});
