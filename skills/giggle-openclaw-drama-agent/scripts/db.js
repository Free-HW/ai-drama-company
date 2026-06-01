/**
 * db.js — better-sqlite3 adapter (drop-in replacement for sqlite3)
 * Keeps the same async API surface so server.js / agent.js need no changes.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.LOCAL_DB_PATH || path.join(process.cwd(), 'outputs', 'drama_agent.db');

function ensureDbDir() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

function openDb() {
  ensureDbDir();
  return new Database(DB_PATH);
}

// Wrap sync calls in promises to keep the original async API
function run(db, sql, params = []) {
  return Promise.resolve(db.prepare(sql).run(...params));
}

function get(db, sql, params = []) {
  return Promise.resolve(db.prepare(sql).get(...params));
}

function all(db, sql, params = []) {
  return Promise.resolve(db.prepare(sql).all(...params));
}

async function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS story_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_uuid TEXT UNIQUE,
      name TEXT, idea TEXT, language TEXT, aspect TEXT, style TEXT, status TEXT,
      episode_count INTEGER DEFAULT 1,
      script_run_id TEXT,
      style_id INTEGER DEFAULT 146,
      video_duration INTEGER DEFAULT 60,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS project_bibles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_uuid TEXT UNIQUE,
      world_setting TEXT, tone TEXT, style_rules TEXT, relationship_notes TEXT, raw_json TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS project_episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_uuid TEXT, episode_no INTEGER, title TEXT, outline TEXT, script_text TEXT,
      status TEXT, run_id TEXT, giggle_project_id TEXT, export_url TEXT,
      created_at TEXT, updated_at TEXT,
      UNIQUE(project_uuid, episode_no)
    );
    CREATE TABLE IF NOT EXISTS project_characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_uuid TEXT, character_key TEXT, name TEXT, gender TEXT, persona TEXT,
      visual_prompt TEXT, voice_pref TEXT, created_at TEXT, updated_at TEXT,
      UNIQUE(project_uuid, character_key)
    );
    CREATE TABLE IF NOT EXISTS character_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_uuid TEXT, project_character_key TEXT, giggle_character_id TEXT,
      giggle_asset_id TEXT, version INTEGER, is_active INTEGER, raw_json TEXT,
      created_at TEXT, updated_at TEXT,
      UNIQUE(project_uuid, project_character_key, version)
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT UNIQUE, project_id TEXT, idea TEXT, project_name TEXT,
      status TEXT, export_url TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT, project_id TEXT, task_id TEXT, diy_story TEXT, ai_story TEXT,
      status TEXT, raw_json TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT, project_id TEXT, character_id TEXT, name TEXT, gender TEXT,
      prompt TEXT, voice_id TEXT, image_url TEXT, raw_json TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS storyboards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT, project_id TEXT, shot_id TEXT, prompt TEXT,
      video_status TEXT, image_status TEXT, raw_json TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT, stage TEXT, tag_class TEXT, tag_text TEXT, payload TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS story_characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_project_uuid TEXT NOT NULL,
      name TEXT NOT NULL,
      gender TEXT DEFAULT "",
      library_character_id INTEGER NOT NULL,
      giggle_asset_id TEXT DEFAULT "",
      raw_json TEXT DEFAULT "{}",
      created_at TEXT,
      UNIQUE(story_project_uuid, name)
    );
  `);
}

async function createRun(db, { runId, idea, projectName }) {
  const now = new Date().toISOString();
  await run(db, `INSERT INTO runs (run_id,idea,project_name,status,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
    [runId, idea, projectName || '', 'running', now, now]);
}

async function setProjectId(db, { runId, projectId }) {
  await run(db, `UPDATE runs SET project_id=?,updated_at=? WHERE run_id=?`, [projectId, new Date().toISOString(), runId]);
}

async function saveScript(db, { runId, projectId, taskId, storyData }) {
  await run(db, `INSERT INTO scripts (run_id,project_id,task_id,diy_story,ai_story,status,raw_json,created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [runId, projectId, taskId||'', storyData?.diy_story||'', storyData?.ai_story||'', storyData?.status||'', JSON.stringify(storyData||{}), new Date().toISOString()]);
}

async function replaceCharacters(db, { runId, projectId, characters }) {
  await run(db, `DELETE FROM characters WHERE run_id=?`, [runId]);
  for (const c of characters||[]) {
    await run(db, `INSERT INTO characters (run_id,project_id,character_id,name,gender,prompt,voice_id,image_url,raw_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [runId, projectId, String(c.id||''), c.name||'', c.gender||'', c.prompt||'', c.voice_id||'', c.image_url||c.image_signed_url||'', JSON.stringify(c), new Date().toISOString()]);
  }
}

async function replaceStoryboards(db, { runId, projectId, shots }) {
  await run(db, `DELETE FROM storyboards WHERE run_id=?`, [runId]);
  for (const s of shots||[]) {
    await run(db, `INSERT INTO storyboards (run_id,project_id,shot_id,prompt,video_status,image_status,raw_json,created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [runId, projectId, String(s.id||s.shot_id||''), s.prompt||'', s.video_generating_status||'', s.generating_status||'', JSON.stringify(s), new Date().toISOString()]);
  }
}

async function addLog(db, { runId, stage, tagClass, tagText, payload }) {
  await run(db, `INSERT INTO run_logs (run_id,stage,tag_class,tag_text,payload,created_at) VALUES (?,?,?,?,?,?)`,
    [runId, stage||'', tagClass||'', tagText||'', String(payload||''), new Date().toISOString()]);
}

async function finishRun(db, { runId, status, exportUrl }) {
  await run(db, `UPDATE runs SET status=?,export_url=?,updated_at=? WHERE run_id=?`, [status, exportUrl||'', new Date().toISOString(), runId]);
}

async function getLatestSnapshot(db) {
  const latest = await get(db, `SELECT * FROM runs ORDER BY id DESC LIMIT 1`);
  if (!latest) return null;
  const [script] = await all(db, `SELECT * FROM scripts WHERE run_id=? ORDER BY id DESC LIMIT 1`, [latest.run_id]);
  const characters = await all(db, `SELECT * FROM characters WHERE run_id=? ORDER BY id ASC`, [latest.run_id]);
  const storyboards = await all(db, `SELECT * FROM storyboards WHERE run_id=? ORDER BY id ASC`, [latest.run_id]);
  const logs = await all(db, `SELECT * FROM run_logs WHERE run_id=? ORDER BY id DESC LIMIT 80`, [latest.run_id]);
  return { run: latest, script, characters, storyboards, logs: logs.reverse() };
}

async function getProjectList(db) {
  return all(db, `SELECT r.*,(SELECT COUNT(1) FROM storyboards sb WHERE sb.run_id=r.run_id) AS episode_count,(SELECT status FROM scripts sc WHERE sc.run_id=r.run_id ORDER BY sc.id DESC LIMIT 1) AS script_status FROM runs r ORDER BY r.id DESC LIMIT 50`);
}

async function getProjectEpisodes(db, runId) {
  return all(db, `SELECT * FROM storyboards WHERE run_id=? ORDER BY id ASC`, [runId]);
}

async function getRunByRunId(db, runId) {
  return (await get(db, `SELECT * FROM runs WHERE run_id=? LIMIT 1`, [runId])) || null;
}

async function getRunLogsSince(db, runId, sinceId=0, limit=200) {
  return all(db, `SELECT * FROM run_logs WHERE run_id=? AND id>? ORDER BY id ASC LIMIT ?`, [runId, Number(sinceId||0), Number(limit||200)]);
}

async function createStoryProject(db, { projectUuid, name, idea, language, aspect, style, episodeCount, styleId, videoDuration }) {
  const now = new Date().toISOString();
  await run(db, `INSERT INTO story_projects (project_uuid,name,idea,language,aspect,style,episode_count,style_id,video_duration,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [projectUuid, name||'', idea||'', language||'zh-CN', aspect||'16:9', style||'', Number(episodeCount||1), Number(styleId||146), Number(videoDuration||60), 'draft', now, now]);
}

async function upsertProjectBible(db, { projectUuid, worldSetting, tone, styleRules, relationshipNotes, rawJson }) {
  const now = new Date().toISOString();
  await run(db, `INSERT INTO project_bibles (project_uuid,world_setting,tone,style_rules,relationship_notes,raw_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(project_uuid) DO UPDATE SET world_setting=excluded.world_setting,tone=excluded.tone,style_rules=excluded.style_rules,relationship_notes=excluded.relationship_notes,raw_json=excluded.raw_json,updated_at=excluded.updated_at`,
    [projectUuid, worldSetting||'', tone||'', styleRules||'', relationshipNotes||'', JSON.stringify(rawJson||{}), now, now]);
}

async function setStoryProjectStatus(db, { projectUuid, status }) {
  await run(db, `UPDATE story_projects SET status=?,updated_at=? WHERE project_uuid=?`, [status, new Date().toISOString(), projectUuid]);
}

async function getStoryProject(db, projectUuid) {
  const project = await get(db, `SELECT * FROM story_projects WHERE project_uuid=? LIMIT 1`, [projectUuid]);
  if (!project) return null;
  const bible = await get(db, `SELECT * FROM project_bibles WHERE project_uuid=? LIMIT 1`, [projectUuid]);
  return { ...project, bible: bible||null };
}

async function listStoryProjects(db, limit=50) {
  return all(db, `SELECT * FROM story_projects ORDER BY id DESC LIMIT ?`, [Number(limit||50)]);
}

async function replaceProjectEpisodes(db, { projectUuid, episodes }) {
  await run(db, `DELETE FROM project_episodes WHERE project_uuid=?`, [projectUuid]);
  const now = new Date().toISOString();
  for (const ep of episodes||[]) {
    await run(db, `INSERT INTO project_episodes (project_uuid,episode_no,title,outline,script_text,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      [projectUuid, Number(ep.episode_no), ep.title||'', ep.outline||'', ep.script_text||'', ep.status||'planned', now, now]);
  }
}

async function listProjectEpisodesByUuid(db, projectUuid) {
  return all(db, `SELECT * FROM project_episodes WHERE project_uuid=? ORDER BY episode_no ASC`, [projectUuid]);
}

async function getProjectEpisodeByNo(db, { projectUuid, episodeNo }) {
  return get(db, `SELECT * FROM project_episodes WHERE project_uuid=? AND episode_no=? LIMIT 1`, [projectUuid, Number(episodeNo)]);
}

async function updateProjectEpisode(db, { projectUuid, episodeNo, status, runId, giggleProjectId, exportUrl, coverUrl }) {
  const row = await getProjectEpisodeByNo(db, { projectUuid, episodeNo });
  if (!row) return;
  await run(db, `UPDATE project_episodes SET status=?,run_id=?,giggle_project_id=?,export_url=?,cover_url=?,updated_at=? WHERE project_uuid=? AND episode_no=?`,
    [status||row.status, runId===undefined?row.run_id:runId, giggleProjectId===undefined?row.giggle_project_id:giggleProjectId, exportUrl===undefined?row.export_url:exportUrl, coverUrl===undefined?row.cover_url:coverUrl, new Date().toISOString(), projectUuid, Number(episodeNo)]);
}

async function upsertProjectCharacter(db, { projectUuid, characterKey, name, gender, persona, visualPrompt, voicePref }) {
  const now = new Date().toISOString();
  await run(db, `INSERT INTO project_characters (project_uuid,character_key,name,gender,persona,visual_prompt,voice_pref,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(project_uuid,character_key) DO UPDATE SET name=excluded.name,gender=excluded.gender,persona=excluded.persona,visual_prompt=excluded.visual_prompt,voice_pref=excluded.voice_pref,updated_at=excluded.updated_at`,
    [projectUuid, characterKey, name||'', gender||'', persona||'', visualPrompt||'', voicePref||'', now, now]);
}

async function listProjectCharacters(db, projectUuid) {
  return all(db, `SELECT * FROM project_characters WHERE project_uuid=? ORDER BY id ASC`, [projectUuid]);
}

async function upsertCharacterMapping(db, { projectUuid, projectCharacterKey, giggleCharacterId, giggleAssetId, rawJson }) {
  const now = new Date().toISOString();
  const latest = await get(db, `SELECT * FROM character_mappings WHERE project_uuid=? AND project_character_key=? AND is_active=1 ORDER BY version DESC LIMIT 1`, [projectUuid, projectCharacterKey]);
  if (latest && latest.giggle_character_id === String(giggleCharacterId||'')) return latest;
  if (latest) await run(db, `UPDATE character_mappings SET is_active=0,updated_at=? WHERE id=?`, [now, latest.id]);
  const version = latest ? Number(latest.version||1)+1 : 1;
  await run(db, `INSERT INTO character_mappings (project_uuid,project_character_key,giggle_character_id,giggle_asset_id,version,is_active,raw_json,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?,?)`,
    [projectUuid, projectCharacterKey, String(giggleCharacterId||''), String(giggleAssetId||''), version, JSON.stringify(rawJson||{}), now, now]);
  return get(db, `SELECT * FROM character_mappings WHERE project_uuid=? AND project_character_key=? AND version=? LIMIT 1`, [projectUuid, projectCharacterKey, version]);
}

async function listCharacterMappings(db, projectUuid) {
  return all(db, `SELECT * FROM character_mappings WHERE project_uuid=? AND is_active=1 ORDER BY id ASC`, [projectUuid]);
}

// ── 全局角色库（跨剧集角色一致性） ──

/**
 * 按名字查全局角色库（不限 project_uuid）
 * 返回最新的同名角色记录（含 giggle_asset_id）
 */
/**
 * 按剧集项目+角色名查全局角色（story_characters 表）
 * 返回 { name, gender, library_character_id } 或 null
 */
function getGlobalCharacterByName(db, name, storyProjectUuid) {
  if (storyProjectUuid) {
    return get(db,
      'SELECT name, gender, library_character_id, giggle_asset_id FROM story_characters WHERE story_project_uuid=? AND name=? LIMIT 1',
      [storyProjectUuid, name]
    );
  }
  // 兜底：不限项目（向后兼容）
  return get(db,
    'SELECT name, gender, library_character_id, giggle_asset_id FROM story_characters WHERE name=? ORDER BY id DESC LIMIT 1',
    [name]
  );
}

/**
 * 保存角色到剧集全局角色表（story_characters），已存在则跳过
 */
async function saveGlobalCharacter(db, { storyProjectUuid, name, gender, libraryCharacterId, giggleAssetId }) {
  const now = new Date().toISOString();
  await run(db,
    `INSERT INTO story_characters (story_project_uuid, name, gender, library_character_id, giggle_asset_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(story_project_uuid, name) DO NOTHING`,
    [storyProjectUuid, name, gender || '', Number(libraryCharacterId) || 0, giggleAssetId || '', now]
  );
}


module.exports = {
  DB_PATH, openDb, initSchema, createRun, setProjectId, saveScript,
  replaceCharacters, replaceStoryboards, addLog, finishRun, getLatestSnapshot,
  getProjectList, getProjectEpisodes, getRunByRunId, getRunLogsSince,
  createStoryProject, upsertProjectBible, setStoryProjectStatus, getStoryProject,
  listStoryProjects, replaceProjectEpisodes, listProjectEpisodesByUuid,
  getProjectEpisodeByNo, updateProjectEpisode, upsertProjectCharacter,
  listProjectCharacters, upsertCharacterMapping, listCharacterMappings,
  getGlobalCharacterByName, saveGlobalCharacter,
};
