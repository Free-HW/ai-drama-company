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

// ── 1. 工作目录 ────────────────────────────────────────────
const WORKSPACE_DIR = path.join(HOME, ".openclaw", "workspace-ai-drama-company");
const ENV_FILE = path.join(WORKSPACE_DIR, ".env");
const DB_FILE = path.join(WORKSPACE_DIR, "outputs", "drama_agent.db");

// ── 2. 检查本地服务 ────────────────────────────────────────
let serviceOk = false;
try {
  const result = execSync("curl -s --connect-timeout 2 http://localhost:3000/health", {
    timeout: 3000,
    encoding: "utf8",
  });
  serviceOk = result.includes('"ok":true') || result.includes('"ok": true');
} catch {
  serviceOk = false;
}

// ── 3. 读取外网地址 ────────────────────────────────────────
let externalUrl = null;
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
      // 有些版本直接存 clawnUrl
      if (info.clawnUrl || info.clawlnUrl || info.tunnelUrl) {
        externalUrl = info.clawnUrl || info.clawlnUrl || info.tunnelUrl;
        break;
      }
    } catch {
      // 忽略解析错误
    }
  }
}

// ── 4. 检查 API Keys ────────────────────────────────────────
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

// ── 5. 检查数据库 ────────────────────────────────────────────
const dbReady = fs.existsSync(DB_FILE);

// ── 6. 输出结果 ────────────────────────────────────────────
const result = {
  serviceOk,
  localUrl: "http://localhost:3000",
  externalUrl,
  missingKeys,
  dbReady,
  workspaceDir: WORKSPACE_DIR,
  envFileExists: fs.existsSync(ENV_FILE),
};

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
