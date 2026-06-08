#!/usr/bin/env node
/**
 * drama-setup/scripts/check-env.js
 * AI Drama Company 初始化检测脚本
 * 输出 JSON，供 Agent 读取后决定下一步操作
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const HOME = os.homedir();
const WORKSPACE_DIR = path.join(HOME, ".openclaw", "workspace-ai-drama-company");
const ENV_FILE = path.join(WORKSPACE_DIR, ".env");
const DB_FILE = path.join(WORKSPACE_DIR, "outputs", "drama_agent.db");

// ── 1. 检查本地服务 ────────────────────────────────────────
let serviceOk = false;
try {
  const result = execSync("curl -s --connect-timeout 2 http://localhost:3000/health", {
    timeout: 3000, encoding: "utf8",
  });
  serviceOk = result.includes('"ok":true') || result.includes('"ok": true');
} catch { serviceOk = false; }

// ── 2. 获取外网地址（优先 dashboard skill，降级读 device-info）────
let externalUrl = null;
let dashboardReady = false;

// 方法A：读 dashboard skill 的状态文件
const dashboardStatePaths = [
  path.join(HOME, ".openclaw", "dashboard-state.json"),
  path.join(HOME, ".claw", "dashboard-state.json"),
  path.join(HOME, ".storyclaw", "dashboard-state.json"),
];
for (const p of dashboardStatePaths) {
  if (fs.existsSync(p)) {
    try {
      const state = JSON.parse(fs.readFileSync(p, "utf-8"));
      if (state.public_url || state.publicUrl || state.tunnel_url) {
        externalUrl = state.public_url || state.publicUrl || state.tunnel_url;
        dashboardReady = true;
        break;
      }
    } catch { /* ignore */ }
  }
}

// 方法B：降级读 device-info.json（ClawLN 方式）
if (!externalUrl) {
  const deviceInfoPaths = [
    path.join(HOME, ".openclaw", "device-info.json"),
    path.join(HOME, ".storyclaw", "device-info.json"),
    path.join(HOME, ".clawdbot", "device-info.json"),
  ];
  for (const p of deviceInfoPaths) {
    if (fs.existsSync(p)) {
      try {
        const info = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (info.fqdn) {
          externalUrl = `https://device-${info.fqdn}.clawln.app`;
          break;
        }
        if (info.clawnUrl || info.clawlnUrl || info.tunnelUrl) {
          externalUrl = info.clawnUrl || info.clawlnUrl || info.tunnelUrl;
          break;
        }
      } catch { /* ignore */ }
    }
  }
}

// 方法C：尝试调用 dashboard_status（如果 MCP server 在运行）
if (!externalUrl) {
  try {
    const result = execSync(
      `curl -s --connect-timeout 2 http://localhost:4999/status 2>/dev/null`,
      { timeout: 3000, encoding: "utf8" }
    );
    const status = JSON.parse(result);
    if (status?.tunnel?.public_url) {
      externalUrl = status.tunnel.public_url;
      dashboardReady = true;
    }
  } catch { /* ignore */ }
}

// ── 3. 检查 API Keys ───────────────────────────────────────
const REQUIRED_KEYS = [
  "GIGGLE_API_KEY",
  "X2C_API_KEY",
  "OPENCLAW_GATEWAY_PASSWORD",
  "STORYCLAW_API_KEY",
];
const missingKeys = [];

if (fs.existsSync(ENV_FILE)) {
  const envContent = fs.readFileSync(ENV_FILE, "utf-8");
  const envMap = {};
  for (const line of envContent.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) envMap[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  for (const key of REQUIRED_KEYS) {
    const val = envMap[key] || "";
    if (!val || val.startsWith("your_") || val === "sk-xxx" || val.length < 8) {
      missingKeys.push(key);
    }
  }
} else {
  missingKeys.push(...REQUIRED_KEYS);
}

// ── 4. 检查数据库 ──────────────────────────────────────────
const dbReady = fs.existsSync(DB_FILE);

// ── 5. 输出结果 ────────────────────────────────────────────
process.stdout.write(JSON.stringify({
  serviceOk,
  localUrl: "http://localhost:3000",
  externalUrl,
  dashboardReady,
  missingKeys,
  dbReady,
  workspaceDir: WORKSPACE_DIR,
  envFileExists: fs.existsSync(ENV_FILE),
  // 如果外网地址不可用，给出指引
  setupHint: !externalUrl
    ? "调用 dashboard_setup 工具激活外网穿透，或运行: node skills/dashboard/src/setup.py"
    : null,
}, null, 2) + "\n");
