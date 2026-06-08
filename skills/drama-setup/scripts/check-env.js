#!/usr/bin/env node
/**
 * drama-setup/scripts/check-env.js
 * AI Drama Company 全自动初始化脚本
 *
 * 执行顺序：
 * 1. 检查并复制 package.json / .env.example 到 workspace 根目录
 * 2. 执行 npm install
 * 3. 检查 .env 是否配置（缺失则输出需要填写的 keys，由 Agent 引导用户）
 * 4. 初始化数据库
 * 5. 检查服务是否运行
 * 6. 获取外网地址
 *
 * 输出 JSON，Agent 根据结果决定下一步操作。
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execSync, spawn } from "child_process";

const HOME = os.homedir();
const WORKSPACE_DIR = path.join(HOME, ".openclaw", "workspace-ai-drama-company");
const SKILL_DIR = path.join(WORKSPACE_DIR, "skills", "giggle-openclaw-drama-agent");
const ENV_FILE = path.join(WORKSPACE_DIR, ".env");
const ENV_EXAMPLE = path.join(WORKSPACE_DIR, ".env.example");
const PACKAGE_JSON = path.join(WORKSPACE_DIR, "package.json");
const NODE_MODULES = path.join(WORKSPACE_DIR, "node_modules");
const DB_FILE = path.join(WORKSPACE_DIR, "outputs", "drama_agent.db");

const steps = [];
const log = (msg) => steps.push(msg);

// ── Step 1: 确保 package.json 存在 ──────────────────────────
if (!fs.existsSync(PACKAGE_JSON)) {
  const srcPkg = path.join(SKILL_DIR, "package.json");
  if (fs.existsSync(srcPkg)) {
    fs.copyFileSync(srcPkg, PACKAGE_JSON);
    log("✅ package.json 已复制到工作目录");
  } else {
    log("❌ package.json 不存在，请检查安装");
  }
} else {
  log("✅ package.json 已存在");
}

// ── Step 2: 确保 .env.example 存在 ──────────────────────────
if (!fs.existsSync(ENV_EXAMPLE)) {
  const srcExample = path.join(SKILL_DIR, ".env.example");
  if (fs.existsSync(srcExample)) {
    fs.copyFileSync(srcExample, ENV_EXAMPLE);
    log("✅ .env.example 已复制");
  }
}

// ── Step 3: npm install ─────────────────────────────────────
let npmInstallOk = fs.existsSync(NODE_MODULES);
if (!npmInstallOk) {
  log("⏳ 正在安装依赖（npm install）...");
  try {
    execSync("npm install", {
      cwd: WORKSPACE_DIR,
      timeout: 120000,
      stdio: "pipe",
    });
    npmInstallOk = true;
    log("✅ npm install 完成");
  } catch (e) {
    log(`❌ npm install 失败: ${e.message}`);
  }
} else {
  log("✅ node_modules 已存在，跳过安装");
}

// ── Step 4: 检查 .env ───────────────────────────────────────
// 用户必须手动提供的 Keys
const USER_KEYS = [
  { key: "GIGGLE_API_KEY", label: "Giggle API Key（从 giggle.pro 开发者后台获取）" },
  { key: "X2C_API_KEY", label: "X2C API Key（从 X2C 平台账号设置获取）" },
];

// 从系统自动读取的 Keys
function readSystemKeys() {
  const systemKeys = {};
  const ocConfigPath = path.join(HOME, ".openclaw", "openclaw.json");
  if (fs.existsSync(ocConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(ocConfigPath, "utf-8"));
      const gwPassword = cfg?.gateway?.auth?.password;
      if (gwPassword) systemKeys["OPENCLAW_GATEWAY_PASSWORD"] = gwPassword;
      const storyclawKey = cfg?.models?.providers?.storyclaw?.apiKey;
      if (storyclawKey) systemKeys["STORYCLAW_API_KEY"] = storyclawKey;
    } catch { /* ignore */ }
  }
  return systemKeys;
}

let envMap = {};
let missingKeys = [];

// 创建或读取 .env
if (!fs.existsSync(ENV_FILE)) {
  if (fs.existsSync(ENV_EXAMPLE)) {
    fs.copyFileSync(ENV_EXAMPLE, ENV_FILE);
    log("✅ .env 已从模板创建");
  }
} 

// 读取当前 .env
if (fs.existsSync(ENV_FILE)) {
  const content = fs.readFileSync(ENV_FILE, "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) envMap[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

// 自动写入系统 Keys（GATEWAY_PASSWORD + STORYCLAW_API_KEY）
const systemKeys = readSystemKeys();
let systemKeysWritten = false;
for (const [key, value] of Object.entries(systemKeys)) {
  const current = envMap[key] || "";
  if (!current || current.startsWith("your_") || current.includes("_your_") || current.length < 8) {
    // 写入 .env
    if (fs.existsSync(ENV_FILE)) {
      let content = fs.readFileSync(ENV_FILE, "utf-8");
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
      } else {
        content += `\n${key}=${value}`;
      }
      fs.writeFileSync(ENV_FILE, content, "utf-8");
    }
    envMap[key] = value;
    systemKeysWritten = true;
    log(`✅ ${key} 已从系统自动读取并写入`);
  }
}
if (systemKeysWritten) {
  log("✅ 系统 Keys（Gateway密码、StoryClaw Key）已自动配置");
}

// 只检查用户必须提供的 Keys
for (const { key } of USER_KEYS) {
  const val = envMap[key] || "";
  if (!val || val.startsWith("your_") || val.includes("_your_") || val.length < 8) {
    missingKeys.push(key);
  }
}

// 保持 REQUIRED_KEYS 兼容性
const REQUIRED_KEYS = USER_KEYS;

// ── Step 5: 初始化数据库 ─────────────────────────────────────
let dbReady = fs.existsSync(DB_FILE);
if (!dbReady && missingKeys.length === 0 && npmInstallOk) {
  try {
    fs.mkdirSync(path.join(WORKSPACE_DIR, "outputs"), { recursive: true });
    execSync(`node ${path.join(SKILL_DIR, "scripts", "init_db.js")}`, {
      cwd: WORKSPACE_DIR,
      timeout: 15000,
      stdio: "pipe",
    });
    dbReady = fs.existsSync(DB_FILE);
    log(dbReady ? "✅ 数据库初始化完成" : "❌ 数据库初始化失败");
  } catch (e) {
    log(`❌ 数据库初始化失败: ${e.message}`);
  }
} else if (!dbReady) {
  log("⏭ 跳过数据库初始化（等待 API Keys 配置完成）");
} else {
  log("✅ 数据库已就绪");
}

// ── Step 6: 检查/启动服务 ────────────────────────────────────
let serviceOk = false;
try {
  const r = execSync("curl -s --connect-timeout 2 http://localhost:3000/health", {
    timeout: 3000, encoding: "utf8",
  });
  serviceOk = r.includes('"ok":true') || r.includes('"ok": true');
} catch { serviceOk = false; }

// 如果配置完整但服务未启动，自动后台启动
let serviceAutoStarted = false;
if (!serviceOk && missingKeys.length === 0 && dbReady && npmInstallOk) {
  try {
    const serverScript = path.join(SKILL_DIR, "scripts", "server.js");
    const logFile = path.join(HOME, ".claw", "ai-drama.log");
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const child = spawn("node", [serverScript], {
      cwd: WORKSPACE_DIR,
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
    });
    child.unref();
    // 等 3 秒让服务启动
    await new Promise(r => setTimeout(r, 3000));
    try {
      const r = execSync("curl -s --connect-timeout 2 http://localhost:3000/health", {
        timeout: 3000, encoding: "utf8",
      });
      serviceOk = r.includes('"ok":true') || r.includes('"ok": true');
    } catch { serviceOk = false; }
    serviceAutoStarted = true;
    log(serviceOk ? "✅ 服务已自动启动" : "⏳ 服务启动中，稍后重试");
  } catch (e) {
    log(`❌ 服务自动启动失败: ${e.message}`);
  }
}

// ── Step 7: 获取外网地址 ─────────────────────────────────────
let externalUrl = null;

// 方法A: dashboard skill 状态文件
const dashboardStatePaths = [
  path.join(HOME, ".openclaw", "dashboard-state.json"),
  path.join(HOME, ".claw", "dashboard-state.json"),
];
for (const p of dashboardStatePaths) {
  if (fs.existsSync(p)) {
    try {
      const state = JSON.parse(fs.readFileSync(p, "utf-8"));
      externalUrl = state.public_url || state.publicUrl || state.tunnel_url || null;
      if (externalUrl) break;
    } catch { }
  }
}

// 方法B: device-info.json (ClawLN)
if (!externalUrl) {
  for (const p of [
    path.join(HOME, ".openclaw", "device-info.json"),
    path.join(HOME, ".storyclaw", "device-info.json"),
  ]) {
    if (fs.existsSync(p)) {
      try {
        const info = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (info.fqdn) { externalUrl = `https://device-${info.fqdn}.clawln.app`; break; }
        if (info.clawnUrl) { externalUrl = info.clawnUrl; break; }
      } catch { }
    }
  }
}

// ── 输出最终结果 ─────────────────────────────────────────────
process.stdout.write(JSON.stringify({
  ready: serviceOk && missingKeys.length === 0 && dbReady,
  serviceOk,
  serviceAutoStarted,
  npmInstallOk,
  dbReady,
  missingKeys,
  missingKeysDetail: USER_KEYS.filter(k => missingKeys.includes(k.key)),
  externalUrl,
  localUrl: "http://localhost:3000",
  workspaceDir: WORKSPACE_DIR,
  steps,
}, null, 2) + "\n");
