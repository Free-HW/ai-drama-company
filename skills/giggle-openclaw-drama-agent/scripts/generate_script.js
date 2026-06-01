/**
 * 独立脚本：逐集调用 LLM 生成剧本并写入数据库
 * 用法: node generate_script.js <projectUuid> <idea> <episodeCount> [scriptRunId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });

const { openDb, initSchema } = require('./db');

const [,, projectUuid, idea, episodeCountStr, scriptRunId] = process.argv;
const total = Math.max(1, Number(episodeCountStr || 1));
const GATEWAY = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';
const PASS = process.env.OPENCLAW_GATEWAY_PASSWORD || '';

function upsertEpisode(db, { projectUuid, episode_no, title, outline, script_text }) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO project_episodes (project_uuid,episode_no,title,outline,script_text,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(project_uuid,episode_no) DO UPDATE SET
      title=excluded.title, outline=excluded.outline, script_text=excluded.script_text,
      status='scripted', updated_at=excluded.updated_at`)
    .run(projectUuid, episode_no, title, outline, script_text, 'scripted', now, now);
}

function setProgress(db, projectUuid, done, total) {
  db.prepare('UPDATE story_projects SET status=?, updated_at=? WHERE project_uuid=?')
    .run('generating:' + done + '/' + total, new Date().toISOString(), projectUuid);
}

function writeLog(db, runId, tagClass, tagText, payload, stage) {
  if (!runId) return;
  try {
    db.prepare('INSERT INTO run_logs (run_id, stage, tag_class, tag_text, payload, created_at) VALUES (?,?,?,?,?,?)')
      .run(runId, stage || 'script', tagClass || 'agent-a', tagText || 'AGENT-A', payload || '', new Date().toISOString());
  } catch (_) {}
}

async function callLLM(prompt) {
  const resp = await fetch(GATEWAY + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + PASS },
    body: JSON.stringify({
      model: 'openclaw',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
    }),
  });
  const json = await resp.json();
  return json && json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content || ''
    : '';
}

function buildPrompt(epNo, total, idea, prevSummaries, videoDuration) {
  videoDuration = videoDuration || 60;
  const isLast = epNo === total;

  // 已播出剧情上下文（最近5集概要）
  let contextBlock = '';
  if (prevSummaries && prevSummaries.length > 0) {
    const lines = prevSummaries.map(function(s, i) {
      return '第' + (i + 1) + '集：' + s;
    }).join('\n');
    contextBlock = '\n\n【已播出剧情摘要（保持连贯）】\n' + lines;
  }

  // 最后一集特殊指令
  const endingNote = isLast
    ? '\n\n【重要】这是全剧第' + total + '集大结局，必须完整收束所有主线剧情和人物关系，给出令人满意的结局，不留悬念，不要出现"下集预告"。'
    : '';

  const lastSection = isLast
    ? '【大结局】\n（一句话总结全剧结局，完整收尾，所有伏笔收束）'
    : '【下集预告】\n（一句话预告下集内容）';

  return '你是专业短剧编剧。根据以下创意，生成第' + epNo + '集（共' + total + '集）的完整剧本。\n【重要】全剧角色名必须保持一致，同一个人物在所有集中只能使用同一个名字，不得使用别名、字号、称号替代（例如：嬴政和秦始皇是同一人，全剧只能用其中一个名字）。\n\n'
    + '创意：' + idea
    + contextBlock
    + endingNote
    + '\n\n按以下格式输出，不要有任何额外说明：\n\n'
    + '### 第' + epNo + '集（目标：' + videoDuration + '秒）\n'
    + '【剧情概要】\n（80-120字，描述本集核心剧情）\n\n'
    + '【角色表】\n角色名：角色描述（每行一个）\n\n'
    + '【Shot-by-Shot脚本·8-10镜头·每镜8-12秒】\n'
    + 'Shot 1（10s）\n'
    + '画面/事件：（具体场景描述）\n'
    + '台词：角色名："台词内容"\n'
    + '镜头调度：（镜头运动描述）\n'
    + '画面Prompt：（画面描述）\n'
    + '音频：（音效描述，结尾加"高通滤波，干净静音背景，无背景噪音"）\n\n'
    + '（继续Shot 2到Shot 8-10）\n\n'
    + '【高能台词】\n1. 角色名："台词"\n2. 角色名："台词"\n\n'
    + lastSection;
}

async function generateEpisode(epNo, total, idea, prevSummaries, videoDuration) {
  const prompt = buildPrompt(epNo, total, idea, prevSummaries, videoDuration);
  const text = await callLLM(prompt);
  if (!text) throw new Error('EP' + epNo + ' LLM returned empty');

  const titleMatch = text.match(/###\s*第(\d+)集([^\n]*)/);
  const outlineMatch = text.match(/【剧情概要】\s*([\s\S]*?)(?=【|$)/);
  return {
    episode_no: epNo,
    title: titleMatch ? ('第' + titleMatch[1] + '集' + titleMatch[2].trim()) : ('第' + epNo + '集'),
    outline: outlineMatch ? outlineMatch[1].trim().slice(0, 200) : '',
    script_text: text.trim(),
  };
}

// 从创意文本中解析时长（单位：秒），支持"120秒/120s/120分钟/120分钟"等格式
function parseDurationFromIdea(idea) {
  if (!idea) return 60;
  const text = String(idea);
  const m = text.match(/(\d+)\s*(秒|分钟|min|s|secs?)/i);
  if (!m) return 60;
  const val = parseInt(m[1]);
  const unit = m[2];
  const isMinute = /分钟|min/i.test(unit);
  const seconds = isMinute ? val * 60 : val;
  const VALID_DURATIONS = [60, 120, 180, 240, 300];
  return VALID_DURATIONS.includes(seconds) ? seconds : 60;
}

async function main() {
  const db = openDb();
  await initSchema(db);

  // 从 DB 读取每集时长，如果不是有效值（或默认60而创意文本有明确时长）则从创意解析
  const VALID_DURATIONS = [60, 120, 180, 240, 300];
  const projectRow = db.prepare('SELECT video_duration FROM story_projects WHERE project_uuid=?').get(projectUuid);
  const dbDuration = Number(projectRow?.video_duration) || 0;
  // 如果 DB 值不在有效列表，或者 DB=60 但创意文本里有明确时长描述，则优先解析创意
  const parsedFromIdea = parseDurationFromIdea(idea);
  const videoDuration = (VALID_DURATIONS.includes(dbDuration) && dbDuration !== 60) ? dbDuration : parsedFromIdea;

  function log(tagClass, tagText, payload, stage) {
    console.log('[generate_script] ' + payload);
    writeLog(db, scriptRunId, tagClass, tagText, payload, stage);
  }

  log('system', 'SYSTEM', '开始生成剧本，共 ' + total + ' 集，每集目标 ' + videoDuration + '秒', 'script');
  setProgress(db, projectUuid, 0, total);

  if (scriptRunId) {
    try { db.prepare('UPDATE runs SET status=?, updated_at=? WHERE run_id=?').run('running', new Date().toISOString(), scriptRunId); } catch (_) {}
  }

  let written = 0;
  const prevSummaries = []; // 已生成集的概要，传给下一集保持连贯

  for (let epNo = 1; epNo <= total; epNo++) {
    log('agent-a', 'AGENT-A', '[ScriptAgent] 正在生成 EP' + epNo + '/' + total + '...', 'script');
    try {
      const ep = await generateEpisode(epNo, total, idea, prevSummaries, videoDuration);
      upsertEpisode(db, { projectUuid: projectUuid, episode_no: ep.episode_no, title: ep.title, outline: ep.outline, script_text: ep.script_text });
      // 把本集概要加入上下文（最多保留最近5集）
      if (ep.outline) {
        prevSummaries.push(ep.outline.slice(0, 100));
        if (prevSummaries.length > 5) prevSummaries.shift();
      }
      written++;
      setProgress(db, projectUuid, written, total);
      log('agent-a', 'AGENT-A', '[ScriptAgent] EP' + epNo + ' 完成 ✓ · ' + ep.title, 'script');
    } catch (e) {
      log('system', 'SYSTEM', 'EP' + epNo + ' 生成失败: ' + e.message + '，使用降级内容', 'script');
      const arcs = ['相遇', '误解', '靠近', '心动', '阻碍', '表白', '危机', '和解', '升华', '圆满'];
      const arc = arcs[Math.min(epNo - 1, arcs.length - 1)];
      upsertEpisode(db, {
        projectUuid: projectUuid,
        episode_no: epNo,
        title: '第' + epNo + '集·' + arc,
        outline: idea,
        script_text: '【第' + epNo + '集·' + arc + '】\n■ 核心创意：' + idea,
      });
      prevSummaries.push(arc + '（降级）');
      if (prevSummaries.length > 5) prevSummaries.shift();
      written++;
      setProgress(db, projectUuid, written, total);
    }
  }

  db.prepare('UPDATE story_projects SET status=?, updated_at=? WHERE project_uuid=?')
    .run('planned', new Date().toISOString(), projectUuid);

  if (scriptRunId) {
    try { db.prepare('UPDATE runs SET status=?, updated_at=? WHERE run_id=?').run('completed', new Date().toISOString(), scriptRunId); } catch (_) {}
  }

  log('system', 'SYSTEM', '[完成] 全部 ' + written + '/' + total + ' 集剧本已生成，准备自动开始视频制作...', 'script');

  // 剧本生成完成后自动触发全剧流水线（fire-and-forget，不等待结果）
  const PORT = process.env.PORT || 3000;
  const autoRunUrl = 'http://localhost:' + PORT + '/api/agent/projects/' + projectUuid + '/auto-run';
  fetch(autoRunUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then(r => r.json())
    .then(json => {
      if (json.ok) {
        log('system', 'SYSTEM', '[自动流水线] auto-run 已触发，pipelineRunId=' + (json.data?.pipelineRunId || ''), 'script');
      } else {
        log('system', 'SYSTEM', '[自动流水线] auto-run 触发失败: ' + (json.error || ''), 'script');
      }
    })
    .catch(e => log('system', 'SYSTEM', '[自动流水线] auto-run 请求异常: ' + e.message, 'script'));

  process.exit(0);
}

main().catch(function(e) {
  console.error('[generate_script] fatal:', e.message);
  try {
    const db = openDb();
    const row = db.prepare('SELECT count(*) as n FROM project_episodes WHERE project_uuid=?').get(projectUuid);
    const written = row ? row.n : 0;
    db.prepare('UPDATE story_projects SET status=?, updated_at=? WHERE project_uuid=?')
      .run(written > 0 ? 'planned' : 'failed', new Date().toISOString(), projectUuid);
    if (scriptRunId) {
      db.prepare('UPDATE runs SET status=?, updated_at=? WHERE run_id=?').run('failed', new Date().toISOString(), scriptRunId);
    }
  } catch (_) {}
  process.exit(1);
});
