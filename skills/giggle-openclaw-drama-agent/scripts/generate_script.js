/**
 * 独立脚本：生成剧本并写入数据库（逐集写入）
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });

const { openDb, initSchema, setStoryProjectStatus, getProjectEpisodeByNo, updateProjectEpisode } = require('./db');
const sqlite3 = require('better-sqlite3');

const [,, projectUuid, idea, episodeCountStr] = process.argv;
const total = Math.max(1, Number(episodeCountStr || 1));
const GATEWAY = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';
const PASS = process.env.OPENCLAW_GATEWAY_PASSWORD || '';

// 直接写单集到 DB
function upsertEpisode(db, { projectUuid, episode_no, title, outline, script_text }) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO project_episodes (project_uuid,episode_no,title,outline,script_text,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(project_uuid,episode_no) DO UPDATE SET
      title=excluded.title, outline=excluded.outline, script_text=excluded.script_text,
      status='scripted', updated_at=excluded.updated_at`)
    .run(projectUuid, episode_no, title, outline, script_text, 'scripted', now, now);
}

// 写进度状态（generating:N/total）
function setProgress(db, projectUuid, done, total) {
  db.prepare(`UPDATE story_projects SET status=?, updated_at=? WHERE project_uuid=?`)
    .run(`generating:${done}/${total}`, new Date().toISOString(), projectUuid);
}

async function main() {
  const db = openDb();
  await initSchema(db);

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
画面Prompt：（画面描述）
音频：（音效描述，结尾加"高通滤波，干净静音背景，无背景噪音，无低频隆隆声"）

（继续Shot 2到Shot 15-17）

【高能台词】
1. 角色名："台词"

【下集预告】
（一句话预告下集内容）

所有${total}集按顺序输出。`;

  try {
    console.log(`[generate_script] start: ${projectUuid} episodes=${total}`);
    setProgress(db, projectUuid, 0, total);

    const resp = await fetch(`${GATEWAY}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PASS}` },
      body: JSON.stringify({ model: 'openclaw', messages: [{ role: 'user', content: prompt }], temperature: 0.85 }),
    });
    const json = await resp.json();
    const text = json?.choices?.[0]?.message?.content || '';
    console.log(`[generate_script] LLM response: ${text.length} chars`);

    // 逐集解析并立即写入 DB
    const parts = text.split(/(?=###\s*🎬\s*第\d+集)/);
    const epParts = parts.filter(p => p.trim().startsWith('###')).slice(0, total);

    let written = 0;
    for (let i = 0; i < epParts.length; i++) {
      const part = epParts[i];
      const titleMatch = part.match(/###\s*🎬\s*(第\d+集[^\n]*)/);
      const outlineMatch = part.match(/【剧情概要】\s*([\s\S]*?)(?=【|$)/);
      upsertEpisode(db, {
        projectUuid,
        episode_no: i + 1,
        title: titleMatch ? titleMatch[1].trim() : `第${i + 1}集`,
        outline: outlineMatch ? outlineMatch[1].trim().slice(0, 200) : '',
        script_text: part.trim(),
      });
      written++;
      setProgress(db, projectUuid, written, total);
      console.log(`[generate_script] EP${i + 1} written`);
    }

    // 降级：LLM 没有按格式输出时
    if (written === 0) {
      const arcs = ['相遇','误解','靠近','心动','阻碍','表白','危机','和解','升华','圆满'];
      for (let i = 0; i < total; i++) {
        const arc = arcs[Math.min(i, arcs.length - 1)];
        upsertEpisode(db, {
          projectUuid, episode_no: i + 1,
          title: `第${i + 1}集·${arc}`, outline: idea,
          script_text: `【第${i + 1}集·${arc}】\n■ 核心创意：${idea}`,
        });
        written++;
        setProgress(db, projectUuid, written, total);
      }
    }

    db.prepare(`UPDATE story_projects SET status='planned', updated_at=? WHERE project_uuid=?`)
      .run(new Date().toISOString(), projectUuid);
    console.log(`[generate_script] done: ${written} episodes`);
  } catch (e) {
    console.error(`[generate_script] failed: ${e.message}`);
    db.prepare(`UPDATE story_projects SET status='failed', updated_at=? WHERE project_uuid=?`)
      .run(new Date().toISOString(), projectUuid);
  }
  process.exit(0);
}

main();
