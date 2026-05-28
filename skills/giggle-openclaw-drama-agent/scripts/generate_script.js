/**
 * 独立脚本：逐集调用 LLM 生成剧本并写入数据库
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });

const { openDb, initSchema } = require('./db');

const [,, projectUuid, idea, episodeCountStr] = process.argv;
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
  db.prepare(`UPDATE story_projects SET status=?, updated_at=? WHERE project_uuid=?`)
    .run(`generating:${done}/${total}`, new Date().toISOString(), projectUuid);
}

async function callLLM(prompt) {
  const resp = await fetch(`${GATEWAY}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PASS}` },
    body: JSON.stringify({
      model: 'openclaw',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
    }),
  });
  const json = await resp.json();
  return json?.choices?.[0]?.message?.content || '';
}

async function generateEpisode(epNo, total, idea) {
  const prompt = `你是专业短剧编剧。根据以下创意，生成第${epNo}集（共${total}集）的完整剧本。

创意：${idea}

按以下格式输出，不要有任何额外说明：

### 第${epNo}集（目标：120秒）
【剧情概要】
（80-120字，描述本集核心剧情）

【角色表】
角色名：角色描述（每行一个）

【Shot-by-Shot脚本·8-10镜头·每镜8-12秒】
Shot 1（10s）
画面/事件：（具体场景描述）
台词：角色名："台词内容"
镜头调度：（镜头运动描述）
画面Prompt：（画面描述）
音频：（音效描述，结尾加"高通滤波，干净静音背景，无背景噪音"）

（继续Shot 2到Shot 8-10）

【高能台词】
1. 角色名："台词"
2. 角色名："台词"

【下集预告】
（一句话预告下集内容）`;

  const text = await callLLM(prompt);
  if (!text) throw new Error(`EP${epNo} LLM returned empty`);

  const titleMatch = text.match(/###\s*第(\d+)集([^\n]*)/);
  const outlineMatch = text.match(/【剧情概要】\s*([\s\S]*?)(?=【|$)/);
  return {
    episode_no: epNo,
    title: titleMatch ? `第${titleMatch[1]}集${titleMatch[2].trim()}` : `第${epNo}集`,
    outline: outlineMatch ? outlineMatch[1].trim().slice(0, 200) : '',
    script_text: text.trim(),
  };
}

async function main() {
  const db = openDb();
  await initSchema(db);

  console.log(`[generate_script] start: ${projectUuid} episodes=${total}`);
  setProgress(db, projectUuid, 0, total);

  let written = 0;
  for (let epNo = 1; epNo <= total; epNo++) {
    try {
      console.log(`[generate_script] generating EP${epNo}/${total}...`);
      const ep = await generateEpisode(epNo, total, idea);
      upsertEpisode(db, { projectUuid, ...ep });
      written++;
      setProgress(db, projectUuid, written, total);
      console.log(`[generate_script] EP${epNo} done`);
    } catch (e) {
      console.error(`[generate_script] EP${epNo} failed: ${e.message}, using fallback`);
      const arcs = ['相遇','误解','靠近','心动','阻碍','表白','危机','和解','升华','圆满'];
      const arc = arcs[Math.min(epNo - 1, arcs.length - 1)];
      upsertEpisode(db, {
        projectUuid, episode_no: epNo,
        title: `第${epNo}集·${arc}`, outline: idea,
        script_text: `【第${epNo}集·${arc}】\n■ 核心创意：${idea}`,
      });
      written++;
      setProgress(db, projectUuid, written, total);
    }
  }

  db.prepare(`UPDATE story_projects SET status='planned', updated_at=? WHERE project_uuid=?`)
    .run(new Date().toISOString(), projectUuid);
  console.log(`[generate_script] done: ${written}/${total} episodes`);
  process.exit(0);
}

main().catch(e => {
  console.error('[generate_script] fatal:', e.message);
  try {
    const db = openDb();
    // 如果已有集数写入，不覆盖为 failed
    const written = db.prepare('SELECT count(*) as n FROM project_episodes WHERE project_uuid=?').get(projectUuid)?.n || 0;
    const finalStatus = written > 0 ? 'planned' : 'failed';
    db.prepare(`UPDATE story_projects SET status=?, updated_at=? WHERE project_uuid=?`)
      .run(finalStatus, new Date().toISOString(), projectUuid);
  } catch (_) {}
  process.exit(1);
});
