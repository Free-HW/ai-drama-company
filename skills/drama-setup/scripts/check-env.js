#!/usr/bin/env node
/**
 * drama-setup/scripts/check-env.js
 * AI Drama Company 全自动初始化脚本
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
const CLAW_DIR = path.join(HOME, ".claw");
const USERNAME = os.userInfo().username;
const NODE_BIN = process.execPath; // 当前运行 node 的路径
const SERVICE_NAME = "ai-drama-company.service";
const TUNNEL_CONFIG = path.join(CLAW_DIR, "config", "tunnel.json");
const CLOUDFLARED_BIN = path.join(CLAW_DIR, "bin", "cloudflared");

const steps = [];
const log = (msg) => steps.push(msg);

// ── Step 1: 确保 package.json 存在 ──────────────────────────
if (!fs.existsSync(PACKAGE_JSON)) {
  const srcPkg = path.join(SKILL_DIR, "package.json");
  if (fs.existsSync(srcPkg)) {
    fs.copyFileSync(srcPkg, PACKAGE_JSON);
    log("✅ package.json 已复制到工作目录");
  }
} else {
  log("✅ package.json 已存在");
}

if (!fs.existsSync(ENV_EXAMPLE)) {
  const srcExample = path.join(SKILL_DIR, ".env.example");
  if (fs.existsSync(srcExample)) fs.copyFileSync(srcExample, ENV_EXAMPLE);
}

// ── Step 2: npm install ─────────────────────────────────────
let npmInstallOk = fs.existsSync(NODE_MODULES);
if (!npmInstallOk) {
  log("⏳ 正在安装依赖（npm install）...");
  try {
    execSync("npm install", { cwd: WORKSPACE_DIR, timeout: 120000, stdio: "pipe" });
    npmInstallOk = true;
    log("✅ npm install 完成");
  } catch (e) {
    log(`❌ npm install 失败: ${e.message}`);
  }
} else {
  log("✅ 依赖已安装");
}

// ── Step 3: 读取/配置 .env ──────────────────────────────────
const USER_KEYS = [
  { key: "GIGGLE_API_KEY", label: "Giggle API Key（从 giggle.pro 开发者后台获取）" },
  { key: "X2C_API_KEY", label: "X2C API Key（从 X2C 平台账号设置获取）" },
];

function readSystemKeys() {
  const keys = {};
  const cfgPath = path.join(HOME, ".openclaw", "openclaw.json");
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      if (cfg?.gateway?.auth?.password) keys["OPENCLAW_GATEWAY_PASSWORD"] = cfg.gateway.auth.password;
      if (cfg?.models?.providers?.storyclaw?.apiKey) keys["STORYCLAW_API_KEY"] = cfg.models.providers.storyclaw.apiKey;
    } catch { }
  }
  return keys;
}

if (!fs.existsSync(ENV_FILE) && fs.existsSync(ENV_EXAMPLE)) {
  fs.copyFileSync(ENV_EXAMPLE, ENV_FILE);
  log("✅ .env 已从模板创建");
}

let envMap = {};
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) envMap[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

// 自动写入系统 keys
const systemKeys = readSystemKeys();
let envChanged = false;
for (const [key, value] of Object.entries(systemKeys)) {
  const cur = envMap[key] || "";
  if (!cur || cur.startsWith("your_") || cur.includes("_your_") || cur.length < 8) {
    let content = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf-8") : "";
    const regex = new RegExp(`^${key}=.*$`, "m");
    content = regex.test(content) ? content.replace(regex, `${key}=${value}`) : content + `\n${key}=${value}`;
    fs.writeFileSync(ENV_FILE, content, "utf-8");
    envMap[key] = value;
    envChanged = true;
  }
}
if (envChanged) log("✅ 系统 Keys（Gateway密码、StoryClaw Key）已自动配置");

const missingKeys = USER_KEYS.filter(({ key }) => {
  const v = envMap[key] || "";
  return !v || v.startsWith("your_") || v.includes("_your_") || v.length < 8;
}).map(k => k.key);

// ── Step 4: 初始化数据库 ─────────────────────────────────────
let dbReady = fs.existsSync(DB_FILE);
if (!dbReady && missingKeys.length === 0 && npmInstallOk) {
  try {
    fs.mkdirSync(path.join(WORKSPACE_DIR, "outputs"), { recursive: true });
    execSync(`node ${path.join(SKILL_DIR, "scripts", "init_db.js")}`, {
      cwd: WORKSPACE_DIR, timeout: 15000, stdio: "pipe",
    });
    dbReady = fs.existsSync(DB_FILE);
    log(dbReady ? "✅ 数据库初始化完成" : "❌ 数据库初始化失败");
  } catch (e) {
    log(`❌ 数据库初始化失败: ${e.message}`);
  }
} else if (dbReady) {
  log("✅ 数据库已就绪");
}

// ── Step 5: 检查/启动服务 ────────────────────────────────────
let serviceOk = false;
const checkService = () => {
  try {
    const r = execSync("curl -s --connect-timeout 2 http://localhost:3000/health", { timeout: 3000, encoding: "utf8" });
    return r.includes('"ok":true') || r.includes('"ok": true');
  } catch { return false; }
};

serviceOk = checkService();
let serviceAutoStarted = false;

if (!serviceOk && missingKeys.length === 0 && dbReady && npmInstallOk) {
  const serverScript = path.join(SKILL_DIR, "scripts", "server.js");
  const logFile = path.join(CLAW_DIR, "ai-drama.log");
  fs.mkdirSync(CLAW_DIR, { recursive: true });

  // 用户级 systemd（不需要 sudo，所有用户都可用）
  let usedSystemd = false;
  const userSystemdDir = path.join(HOME, ".config", "systemd", "user");
  const serviceContent = `[Unit]
Description=AI Drama Company Agent (Node.js)
After=network.target

[Service]
Type=simple
WorkingDirectory=${WORKSPACE_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} skills/giggle-openclaw-drama-agent/scripts/server.js
Restart=always
RestartSec=5
StandardOutput=append:${logFile}
StandardError=append:${logFile}
OOMScoreAdjust=-1000
LimitNOFILE=65536
LimitNPROC=infinity
TimeoutStopSec=300
TimeoutStartSec=60
StartLimitIntervalSec=10
StartLimitBurst=5

[Install]
WantedBy=default.target
`;

  try {
    fs.mkdirSync(userSystemdDir, { recursive: true });
    fs.writeFileSync(path.join(userSystemdDir, SERVICE_NAME), serviceContent);
    execSync(`systemctl --user daemon-reload && systemctl --user enable --now ${SERVICE_NAME}`, {
      timeout: 15000, stdio: "pipe",
    });
    // 确保 loginctl 开机自启
    try { execSync("loginctl enable-linger", { stdio: "pipe" }); } catch { }
    usedSystemd = true;
    log("✅ 服务已注册到用户级 systemd 并启动（开机自启）");
  } catch (e) {
    // 用户级 systemd 不可用，降级 sudo 系统级
    try {
      const systemdPath = `/etc/systemd/system/${SERVICE_NAME}`;
      const tmpService = path.join(CLAW_DIR, SERVICE_NAME);
      const sysContent = serviceContent.replace("WantedBy=default.target", "WantedBy=multi-user.target")
        .replace("\n[Service]", `\n[Service]\nUser=${USERNAME}`);
      fs.writeFileSync(tmpService, sysContent);
      execSync(`sudo cp "${tmpService}" "${systemdPath}" && sudo systemctl daemon-reload && sudo systemctl enable --now ${SERVICE_NAME}`, {
        timeout: 15000, stdio: "pipe",
      });
      usedSystemd = true;
      log("✅ 服务已注册到系统级 systemd 并启动");
    } catch {
      // 两种 systemd 均失败，最后降级 spawn
      const out = fs.openSync(logFile, "a");
      spawn(NODE_BIN, [serverScript], { cwd: WORKSPACE_DIR, detached: true, stdio: ["ignore", out, out] }).unref();
      log("⚠️ 服务已后台启动（无 systemd 权限，重启后需重新初始化）");
    }
  }

  await new Promise(r => setTimeout(r, 3000));
  serviceOk = checkService();
  serviceAutoStarted = true;
  log(serviceOk ? (usedSystemd ? "✅ 服务已通过 systemd 启动" : "✅ 服务已后台启动") : "⏳ 服务启动中（等待几秒后重试）");
}

// ── Step 6: 外网穿透 ─────────────────────────────────────────
let externalUrl = null;
let tunnelAutoStarted = false;

// 读取已有 tunnel 配置
function getTunnelConfig() {
  if (fs.existsSync(TUNNEL_CONFIG)) {
    try { return JSON.parse(fs.readFileSync(TUNNEL_CONFIG, "utf-8")); } catch { }
  }
  return null;
}

// 检查 cloudflared 是否在运行
function isTunnelRunning(publicUrl) {
  if (!publicUrl) return false;
  try {
    const r = execSync(`curl -s --connect-timeout 3 ${publicUrl}/health 2>/dev/null`, { timeout: 5000, encoding: "utf8" });
    return r.includes('"ok"') || r.length > 0;
  } catch { return false; }
}

// 获取 cloudflared 可执行路径
function getCloudflaredPath() {
  if (fs.existsSync(CLOUDFLARED_BIN)) return CLOUDFLARED_BIN;
  try { const p = execSync("which cloudflared", { encoding: "utf8" }).trim(); if (p) return p; } catch { }
  return null;
}

// 安装 cloudflared
async function installCloudflared() {
  fs.mkdirSync(path.join(CLAW_DIR, "bin"), { recursive: true });
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
  try {
    execSync(`curl -sL --connect-timeout 30 -o "${CLOUDFLARED_BIN}" "${url}"`, { timeout: 60000, stdio: "pipe" });
    execSync(`chmod +x "${CLOUDFLARED_BIN}"`, { stdio: "pipe" });
    log("✅ cloudflared 已下载安装");
    return true;
  } catch (e) {
    log(`❌ cloudflared 下载失败: ${e.message}`);
    return false;
  }
}

// 注册设备获取 tunnel token
async function registerDevice() {
  // 尝试读取设备序列号
  let serial = null;
  try { serial = execSync("cat /sys/class/dmi/id/product_serial 2>/dev/null", { encoding: "utf8", timeout: 3000 }).trim(); } catch { }
  if (!serial || serial === "Default string" || serial.length < 6) {
    // 生成稳定的随机序列号
    const macRaw = execSync("cat /sys/class/net/$(ls /sys/class/net/ | grep -v lo | head -1)/address 2>/dev/null || echo ''", { encoding: "utf8", timeout: 3000 }).trim();
    serial = macRaw.replace(/:/g, "").toUpperCase().slice(0, 12).padEnd(12, "0");
  }

  try {
    const resp = execSync(
      `curl -s --connect-timeout 10 -X POST https://api.clawln.app/devices/register -H "Content-Type: application/json" -d '{"serial":"${serial}"}'`,
      { timeout: 15000, encoding: "utf8" }
    );
    const data = JSON.parse(resp);
    if (data.tunnel_token && data.public_url) {
      fs.mkdirSync(path.join(CLAW_DIR, "config"), { recursive: true });
      fs.writeFileSync(TUNNEL_CONFIG, JSON.stringify({ ...data, serial }, null, 2), { mode: 0o600 });
      log(`✅ 设备已注册，外网地址: ${data.public_url}`);
      return data;
    }
    log(`❌ 注册失败: ${JSON.stringify(data)}`);
  } catch (e) {
    log(`❌ 设备注册请求失败: ${e.message}`);
  }
  return null;
}

// 启动 cloudflared tunnel（优先用户级 systemd，降级 sudo，最后 spawn）
function startTunnel(token, cfPath) {
  const cfServiceName = "cloudflared-drama.service";
  const cfLogFile = path.join(CLAW_DIR, "cloudflared.log");
  const cfServiceContent = `[Unit]
Description=Cloudflared Tunnel for AI Drama Company
After=network.target

[Service]
Type=simple
ExecStart=${cfPath} tunnel --no-autoupdate run --token ${token}
Restart=always
RestartSec=5
StandardOutput=append:${cfLogFile}
StandardError=append:${cfLogFile}

[Install]
WantedBy=default.target
`;

  // 1️⃣ 用户级 systemd（不需要 sudo）
  try {
    const userSystemdDir = path.join(HOME, ".config", "systemd", "user");
    fs.mkdirSync(userSystemdDir, { recursive: true });
    fs.writeFileSync(path.join(userSystemdDir, cfServiceName), cfServiceContent);
    execSync(`systemctl --user daemon-reload && systemctl --user enable --now ${cfServiceName}`, {
      timeout: 15000, stdio: "pipe",
    });
    try { execSync("loginctl enable-linger", { stdio: "pipe" }); } catch { }
    log("✅ cloudflared 已注册到用户级 systemd 并启动（开机自启）");
    return true;
  } catch { }

  // 2️⃣ 系统级 systemd（需要 sudo）
  try {
    const sysSvcPath = `/etc/systemd/system/${cfServiceName}`;
    const tmpCfService = path.join(CLAW_DIR, cfServiceName);
    const sysCfContent = cfServiceContent
      .replace("WantedBy=default.target", "WantedBy=multi-user.target")
      .replace("\n[Service]", `\n[Service]\nUser=${USERNAME}`);
    fs.writeFileSync(tmpCfService, sysCfContent);
    execSync(`sudo cp "${tmpCfService}" "${sysSvcPath}" && sudo systemctl daemon-reload && sudo systemctl enable --now ${cfServiceName}`, {
      timeout: 15000, stdio: "pipe",
    });
    log("✅ cloudflared 已注册到系统级 systemd 并启动");
    return true;
  } catch { }

  // 3️⃣ 降级 spawn
  try {
    fs.mkdirSync(CLAW_DIR, { recursive: true });
    const out = fs.openSync(cfLogFile, "a");
    spawn(cfPath, ["tunnel", "--no-autoupdate", "run", "--token", token], {
      detached: true, stdio: ["ignore", out, out],
    }).unref();
    log("⚠️ cloudflared 已后台启动（无 systemd 权限，重启后需重新初始化）");
    return true;
  } catch (e) {
    log(`❌ cloudflared 启动失败: ${e.message}`);
    return false;
  }
}

// 主流程：获取外网地址
let tunnelConfig = getTunnelConfig();

if (tunnelConfig?.public_url) {
  externalUrl = tunnelConfig.public_url;
  log(`✅ 已有外网地址: ${externalUrl}`);

  // 检查 tunnel 是否运行，没运行就重启
  const cfPath = getCloudflaredPath();
  if (cfPath && tunnelConfig.tunnel_token) {
    // 检查进程是否存在
    let isRunning = false;
    try {
      execSync("pgrep -f cloudflared", { stdio: "pipe" });
      isRunning = true;
    } catch { isRunning = false; }

    if (!isRunning) {
      startTunnel(tunnelConfig.tunnel_token, cfPath);
      await new Promise(r => setTimeout(r, 2000));
      tunnelAutoStarted = true;
      log("✅ cloudflared tunnel 已重启");
    }
  }
} else {
  // 没有配置，走完整注册流程
  log("⏳ 开始配置外网穿透...");

  let cfPath = getCloudflaredPath();
  if (!cfPath) {
    const ok = await installCloudflared();
    if (ok) cfPath = CLOUDFLARED_BIN;
  } else {
    log("✅ cloudflared 已安装");
  }

  if (cfPath) {
    const data = await registerDevice();
    if (data?.tunnel_token) {
      startTunnel(data.tunnel_token, cfPath);
      await new Promise(r => setTimeout(r, 2000));
      externalUrl = data.public_url;
      tunnelAutoStarted = true;
      log(`✅ 外网穿透已激活: ${externalUrl}`);
    }
  }
}

// ClawLN 降级方案
if (!externalUrl) {
  for (const p of [
    path.join(HOME, ".openclaw", "device-info.json"),
    path.join(HOME, ".storyclaw", "device-info.json"),
  ]) {
    if (fs.existsSync(p)) {
      try {
        const info = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (info.fqdn) { externalUrl = `https://device-${info.fqdn}.clawln.app`; break; }
      } catch { }
    }
  }
}

// ── 输出结果 ─────────────────────────────────────────────────
process.stdout.write(JSON.stringify({
  ready: serviceOk && missingKeys.length === 0 && dbReady,
  serviceOk,
  serviceAutoStarted,
  npmInstallOk,
  dbReady,
  missingKeys,
  missingKeysDetail: USER_KEYS.filter(k => missingKeys.includes(k.key)),
  externalUrl,
  tunnelAutoStarted,
  localUrl: "http://localhost:3000",
  workspaceDir: WORKSPACE_DIR,
  steps,
}, null, 2) + "\n");
