#!/usr/bin/env node
/**
 * AI Drama Company — 一键安装配置脚本
 * 运行：node setup.js
 * 
 * 完成：
 * 1. 检查 Node.js 版本
 * 2. 安装 npm 依赖
 * 3. 创建 .env（交互式填写 API Keys）
 * 4. 初始化 SQLite 数据库
 * 5. 安装 systemd 服务（Linux）
 * 6. 读取 OpenClaw device-info.json，输出 Dashboard 访问链接
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

const ROOT = __dirname;
const ENV_FILE = path.join(ROOT, '.env');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');
const DB_DIR = path.join(ROOT, 'outputs');
const SERVICE_FILE = path.join(ROOT, 'ai-drama-company.service');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function log(msg) { console.log(msg); }
function ok(msg) { console.log(`${GREEN}✓${RESET} ${msg}`); }
function warn(msg) { console.log(`${YELLOW}⚠${RESET} ${msg}`); }
function err(msg) { console.log(`${RED}✗${RESET} ${msg}`); }
function title(msg) { console.log(`\n${BOLD}${CYAN}${msg}${RESET}`); }

async function ask(rl, question, defaultVal = '') {
  return new Promise(resolve => {
    const hint = defaultVal ? ` [${defaultVal}]` : '';
    rl.question(`  ${question}${hint}: `, ans => {
      resolve(ans.trim() || defaultVal);
    });
  });
}

async function main() {
  log(`\n${BOLD}╔══════════════════════════════════════════════╗${RESET}`);
  log(`${BOLD}║   AI Drama Company — 安装配置向导             ║${RESET}`);
  log(`${BOLD}╚══════════════════════════════════════════════╝${RESET}`);

  // 1. 检查 Node.js 版本
  title('Step 1/6 — 检查 Node.js 版本');
  const nodeVer = process.versions.node.split('.').map(Number);
  if (nodeVer[0] < 18) {
    err(`Node.js 版本过低（${process.version}），需要 ≥ 18`);
    process.exit(1);
  }
  ok(`Node.js ${process.version}`);

  // 2. 安装 npm 依赖
  title('Step 2/6 — 安装 npm 依赖');
  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    log('  正在安装，请稍候...');
    const r = spawnSync('npm', ['install', '--production'], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) { err('npm install 失败'); process.exit(1); }
  }
  ok('依赖已就绪');

  // 3. 配置 .env
  title('Step 3/6 — 配置环境变量');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  if (fs.existsSync(ENV_FILE)) {
    warn('.env 已存在，跳过（如需重新配置请删除 .env 后重新运行）');
  } else {
    log(`  请依次填入以下 API Keys（留空则跳过，之后可手动编辑 .env）\n`);

    const giggleKey  = await ask(rl, 'Giggle API Key (gig_sk_...)');
    const x2cKey     = await ask(rl, 'X2C API Key (x2c_sk_...)');
    const gwPass     = await ask(rl, 'OpenClaw Gateway Password', '');
    const scKey      = await ask(rl, 'StoryClaw LLM API Key (用于AI命名)', '');
    const port       = await ask(rl, '服务端口', '3000');

    const envContent = [
      `PORT=${port}`,
      ``,
      `# Giggle API`,
      `GIGGLE_BASE_URL=https://giggle.pro`,
      `GIGGLE_API_KEY=${giggleKey}`,
      `GIGGLE_AUTH_MODE=x-auth`,
      ``,
      `# OpenClaw Gateway`,
      `OPENCLAW_GATEWAY_URL=http://localhost:18789`,
      `OPENCLAW_GATEWAY_PASSWORD=${gwPass}`,
      ``,
      `# StoryClaw LLM API（AI 命名）`,
      `STORYCLAW_API_URL=https://llm-ap.gqapi.com`,
      `STORYCLAW_API_KEY=${scKey}`,
      ``,
      `# X2C 平台`,
      `X2C_API_KEY=${x2cKey}`,
      `X2C_API_URL=https://eumfmgwxwjyagsvqloac.supabase.co/functions/v1/open-api`,
      ``,
      `# 轮询配置`,
      `POLL_INTERVAL_MS=5000`,
      `POLL_TIMEOUT_MS=3600000`,
    ].join('\n');

    fs.writeFileSync(ENV_FILE, envContent, 'utf8');
    ok('.env 已创建');
  }
  rl.close();

  // 4. 初始化数据库
  title('Step 4/6 — 初始化数据库');
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  try {
    spawnSync(process.execPath,
      ['skills/giggle-openclaw-drama-agent/scripts/init_db.js'],
      { cwd: ROOT, stdio: 'inherit' }
    );
    ok('数据库初始化完成');
  } catch (e) {
    warn('数据库初始化失败，请手动运行: node skills/giggle-openclaw-drama-agent/scripts/init_db.js');
  }

  // 5. 安装 systemd 服务（Linux only）
  title('Step 5/6 — 安装 systemd 服务');
  if (os.platform() === 'linux' && fs.existsSync(SERVICE_FILE)) {
    // 用当前 Node.js 路径和用户名替换服务文件中的占位符
    const nodeExec = process.execPath;
    const user = os.userInfo().username;
    const serviceContent = fs.readFileSync(SERVICE_FILE, 'utf8')
      .replace(/ExecStart=.*node/g, `ExecStart=${nodeExec}`)
      .replace(/User=storyclaw/g, `User=${user}`)
      .replace(/\/home\/storyclaw\//g, `${os.homedir()}/`);

    const tmpService = `/tmp/ai-drama-company.service`;
    fs.writeFileSync(tmpService, serviceContent, 'utf8');

    try {
      execSync(`sudo cp ${tmpService} /etc/systemd/system/ai-drama-company.service`);
      execSync('sudo systemctl daemon-reload');
      execSync('sudo systemctl enable ai-drama-company --now');
      ok('systemd 服务已安装并启动');
    } catch (e) {
      warn('systemd 安装需要 sudo 权限，跳过。手动安装：');
      log(`    sudo cp ${tmpService} /etc/systemd/system/ai-drama-company.service`);
      log(`    sudo systemctl daemon-reload && sudo systemctl enable --now ai-drama-company`);
    }
  } else if (os.platform() === 'linux') {
    warn('未找到 ai-drama-company.service 文件，跳过');
  } else {
    warn(`非 Linux 系统（${os.platform()}），跳过 systemd 安装`);
    log(`  启动服务：node skills/giggle-openclaw-drama-agent/scripts/server.js`);
  }

  // 6. 输出 Dashboard 访问链接
  title('Step 6/6 — Dashboard 访问链接');
  const envVars = fs.existsSync(ENV_FILE)
    ? Object.fromEntries(fs.readFileSync(ENV_FILE,'utf8').split('\n')
        .filter(l => l.includes('=')).map(l => l.split('=').slice(0,2).map(s=>s.trim())))
    : {};
  const port2 = envVars['PORT'] || '3000';

  // 读取 OpenClaw device-info.json 获取 clawln 地址
  const deviceInfoPaths = [
    path.join(os.homedir(), '.openclaw', 'device-info.json'),
    path.join(os.homedir(), '.storyclaw', 'device-info.json'),
  ];
  let clawlnUrl = null;
  for (const p of deviceInfoPaths) {
    if (fs.existsSync(p)) {
      try {
        const info = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (info.fqdn) {
          clawlnUrl = `https://device-${info.fqdn.toLowerCase()}.clawln.app`;
        }
      } catch (_) {}
      break;
    }
  }

  log(`\n  ${BOLD}本地访问：${RESET}${CYAN}http://localhost:${port2}${RESET}`);
  if (clawlnUrl) {
    log(`  ${BOLD}外网访问：${RESET}${GREEN}${clawlnUrl}${RESET}`);
    log(`  ${YELLOW}（需要 OpenClaw Gateway 运行中，外网链接才有效）${RESET}`);
  } else {
    warn('未找到 OpenClaw device-info.json，外网链接不可用');
    log(`  请先安装 OpenClaw: https://openclaw.ai`);
  }

  log(`\n${BOLD}${GREEN}✅ 安装完成！${RESET}\n`);
}

main().catch(e => { err(e.message); process.exit(1); });
