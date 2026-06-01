(function () {
  const style = document.createElement('style');
  style.textContent = `
    .oclaw-panel { margin: 14px 0 18px; border: 1px solid var(--line); background: var(--bg-1); padding: 12px; }
    .oclaw-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .oclaw-input { flex: 1; min-width: 320px; background: #0c0c10; color: var(--text); border: 1px solid var(--line-2); padding: 10px 12px; font-family: var(--sans); }
    .oclaw-btn { background: var(--gold); color: #000; border: none; padding: 10px 14px; font-family: var(--mono); font-size: 12px; cursor: pointer; }
    .oclaw-btn:disabled { opacity: .5; cursor: not-allowed; }
    .oclaw-db { display: none; }
    .project-card.active { border-color: var(--gold)!important; }
    .x2c-dynamic { border:1px solid var(--line); background:var(--bg-1); padding:12px; margin-bottom:12px; font-family:var(--mono); font-size:12px; color:var(--text-2); }
    .x2c-modal-grid { display:grid; grid-template-columns: 1.2fr .8fr; gap:14px; }
    .x2c-hero { display:grid; grid-template-columns: 1fr; gap:10px; margin-bottom:14px; }
    .x2c-cover { position:relative; border:1px solid var(--line); height:280px; background:#0d0f14; overflow:hidden; }
    .x2c-cover img { width:100%; height:100%; object-fit:cover; display:block; }
    .x2c-cover::after { content:''; position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,.08), rgba(0,0,0,.72)); }
    .x2c-cover-meta { position:absolute; left:12px; right:12px; bottom:10px; z-index:2; display:flex; justify-content:space-between; align-items:flex-end; gap:10px; }
    .x2c-cover-title { font-family:var(--display); font-style:italic; font-size:24px; line-height:1.1; color:#fff; text-shadow:0 2px 10px rgba(0,0,0,.5); }
    .x2c-cover-chip { border:1px solid rgba(255,255,255,.28); background:rgba(0,0,0,.45); padding:4px 8px; font-family:var(--mono); font-size:10px; color:#fff; text-transform:uppercase; letter-spacing:.8px; }
    .x2c-hero-money { font-family:var(--display); font-style:italic; font-size:34px; line-height:1; color:var(--gold); text-shadow:0 2px 10px rgba(0,0,0,.45); }
    .x2c-hero-sub { font-family:var(--mono); font-size:11px; color:#d4d8de; }
    .x2c-mini-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
    .x2c-mini { border:1px solid var(--line); background:rgba(0,0,0,.18); padding:8px; }
    .x2c-mini .k { font-family:var(--mono); font-size:10px; color:var(--text-3); text-transform:uppercase; letter-spacing:.8px; }
    .x2c-mini .v { margin-top:5px; font-family:var(--display); font-style:italic; font-size:22px; color:var(--text); }
    .x2c-card { border:1px solid var(--line); background:linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.06)); padding:14px; }
    .x2c-card h4 { font-family: var(--mono); letter-spacing:1px; font-size:11px; color:var(--gold); margin:0 0 10px; text-transform:uppercase; }
    .x2c-kpi-row { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:10px; margin-bottom:14px; }
    .x2c-kpi { border:1px solid var(--line); background:var(--bg-1); padding:10px; }
    .x2c-kpi .k { font-family:var(--mono); font-size:10px; color:var(--text-3); text-transform:uppercase; letter-spacing:1px; }
    .x2c-kpi .v { margin-top:6px; font-family:var(--display); font-style:italic; font-size:24px; color:var(--text); }
    .x2c-kpi .s { margin-top:4px; font-family:var(--mono); font-size:10px; color:var(--text-3); }
    .x2c-list { display:grid; gap:8px; }
    .x2c-row { display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px dashed var(--line); font-family:var(--mono); font-size:11px; }
    .x2c-row:last-child { border-bottom:none; }
    .x2c-table-wrap { max-height:360px; overflow:auto; border:1px solid var(--line); }
    .x2c-table { width:100%; border-collapse:collapse; font-family:var(--mono); font-size:11px; }
    .x2c-table th, .x2c-table td { padding:8px 10px; border-bottom:1px solid var(--line); text-align:left; }
    .x2c-table th { color:var(--text-3); font-weight:500; text-transform:uppercase; font-size:10px; letter-spacing:1px; }
    .x2c-pill { display:inline-block; padding:2px 8px; border:1px solid var(--line-2); font-family:var(--mono); font-size:10px; color:var(--text-2); }
    .x2c-link { color:var(--gold); text-decoration:none; }
    .x2c-link:hover { text-decoration:underline; }
    @media (max-width: 1000px) { .x2c-mini-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .x2c-modal-grid { grid-template-columns: 1fr; } .x2c-kpi-row { grid-template-columns: repeat(2,minmax(0,1fr)); } }
    .showcase-rail .case-card { min-height: 420px; }
    .showcase-rail .case-thumb { height: 255px; }
    .showcase-rail .case-info { padding: 10px 12px 8px; min-height: 76px; }
    .showcase-rail .case-title { margin-bottom: 6px; line-height: 1.25; }
    .showcase-rail .case-meta { margin-top: 0; }
  `;
  document.head.appendChild(style);

  function fmtNum(n) {
    const v = Number(n || 0);
    if (v >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(v);
  }

  function fmtMoney(n) {
    const v = Number(n || 0);
    return `$${v.toFixed(2)}`;
  }

  function platformViewsHtml(views) {
    if (!views) return '-';
    const arr = [
      ['TikTok', views.tiktok], ['YouTube', views.youtube], ['Instagram', views.instagram],
      ['Facebook', views.facebook], ['Twitter', views.twitter], ['Telegram', views.telegram]
    ];
    return arr.filter((x) => Number(x[1] || 0) > 0).map((x) => `${x[0]}: ${fmtNum(x[1])}`).join(' · ') || '-';
  }

  function ensureDynamicModalBlocks() {
    ['script','casting','storyboard','render','distribute'].forEach((name) => {
      const panel = document.querySelector(`.tab-panel[data-panel="${name}"]`);
      if (panel) {
        let box = panel.querySelector('.x2c-dynamic');
        if (!box) {
          box = document.createElement('div');
          box.className = 'x2c-dynamic';
          panel.prepend(box);
        }
      }
    });
  }

  function openX2CModal(detail) {
    const modal = document.getElementById('caseModal');
    if (!modal) return;
    const p = detail?.project || {};
    const views = p.views || {};
    const earnings = p.earnings || {};
    const dist = p.distribution || [];
    
    const h = document.getElementById('creatorHandle');
    const m = document.getElementById('creatorMeta');
    const q = document.getElementById('testimonialQuote');
    const a = document.getElementById('testimonialAttr');
    const testimonial = document.querySelector('#caseModal .testimonial');

    if (h) h.textContent = `${p.title || 'Untitled'}`;
    if (m) m.innerHTML = `${p.project_style || '-'} · ${p.production_source || '-'} · <strong>$${Number(earnings.total_usd || 0).toFixed(2)} total</strong>`;
    if (q) q.textContent = `"${p.story_intro || 'No description'}"`;
    if (a) a.textContent = `created ${String(p.created_at || '').slice(0,10)} · status ${p.status || '-'} · episodes ${p.episode_count || 0}`;
    if (testimonial) testimonial.style.display = 'none';

    const tabs = document.querySelector('.modal-tabs');
    if (tabs) tabs.style.display = 'none';

    document.querySelectorAll('.tab-panel').forEach((pn) => { pn.classList.remove('active'); pn.style.display = 'none'; });
    const panel = document.querySelector('.tab-panel[data-panel="script"]');
    if (!panel) return;
    panel.classList.add('active');
    panel.style.display = 'block';

    const distRows = dist.slice(0, 20).map((d) => {
      const link = d.post_url ? `<a class="x2c-link" href="${d.post_url}" target="_blank">open</a>` : '-';
      return `<tr><td><span class="x2c-pill">${d.platform || '-'}</span></td><td>EP${d.episode || '-'}</td><td>${d.status || '-'}</td><td>${d.account_name || '-'}</td><td>${link}</td></tr>`;
    }).join('') || '<tr><td colspan="5">No distribution records</td></tr>';

    panel.innerHTML = `
      <div class="x2c-hero">
        <div class="x2c-cover">
          <img src="${p.cover_media_url || ''}" alt="${p.title || 'cover'}" />
          <div class="x2c-cover-meta">
            <div>
              <div class="x2c-cover-title">${p.title || 'Untitled'}</div>
              <div class="x2c-hero-sub">${p.production_source || '-'} · ${p.status || '-'}</div>
            </div>
            <div style="text-align:right;">
              <div class="x2c-cover-chip">${(p.project_style || '#AI').replace('#', '')}</div>
              <div class="x2c-hero-money" style="margin-top:8px;">${fmtMoney(earnings.total_usd || 0)}</div>
              <div class="x2c-hero-sub">Total Revenue · ${Number(earnings.total_x2c || 0).toFixed(2)} X2C</div>
            </div>
          </div>
        </div>
      </div>

      <div class="x2c-mini-grid" style="margin-bottom:10px;">
        <div class="x2c-mini"><div class="k">Total Views</div><div class="v">${fmtNum(views.total || 0)}</div></div>
        <div class="x2c-mini"><div class="k">Episodes</div><div class="v">${p.episode_count || 0}</div></div>
        <div class="x2c-mini"><div class="k">Today</div><div class="v">${fmtMoney(earnings.today_usd || 0)}</div></div>
        <div class="x2c-mini"><div class="k">X2C Price</div><div class="v">${Number(detail?.x2c_price || 0).toFixed(4)}</div></div>
      </div>

      <div class="x2c-kpi-row">
        <div class="x2c-kpi"><div class="k">TikTok Views</div><div class="v">${fmtNum(views.tiktok || 0)}</div><div class="s">primary channel</div></div>
        <div class="x2c-kpi"><div class="k">YouTube Views</div><div class="v">${fmtNum(views.youtube || 0)}</div><div class="s">shorts + feed</div></div>
        <div class="x2c-kpi"><div class="k">Original Views</div><div class="v">${fmtNum(views.original || 0)}</div><div class="s">main episodes</div></div>
        <div class="x2c-kpi"><div class="k">Clips Views</div><div class="v">${fmtNum(views.clips || 0)}</div><div class="s">distribution clips</div></div>
      </div>

      <div class="x2c-modal-grid">
        <div class="x2c-card">
          <h4>Project Snapshot</h4>
          <div class="x2c-list">
            <div class="x2c-row"><span>Project ID</span><strong>${p.id || '-'}</strong></div>
            <div class="x2c-row"><span>Style</span><strong>${p.project_style || '-'}</strong></div>
            <div class="x2c-row"><span>Source</span><strong>${p.production_source || '-'}</strong></div>
            <div class="x2c-row"><span>Episodes</span><strong>${p.episode_count || 0} (${p.episodes_duration || '-'})</strong></div>
            <div class="x2c-row"><span>Duration</span><strong>${p.video_duration_seconds || 0}s</strong></div>
            <div class="x2c-row"><span>Status</span><strong>${p.status || '-'}</strong></div>
          </div>
        </div>

        <div class="x2c-card">
          <h4>Platform Views</h4>
          <div class="x2c-list">
            <div class="x2c-row"><span>TikTok</span><strong>${fmtNum(views.tiktok || 0)}</strong></div>
            <div class="x2c-row"><span>YouTube</span><strong>${fmtNum(views.youtube || 0)}</strong></div>
            <div class="x2c-row"><span>Instagram</span><strong>${fmtNum(views.instagram || 0)}</strong></div>
            <div class="x2c-row"><span>Facebook</span><strong>${fmtNum(views.facebook || 0)}</strong></div>
            <div class="x2c-row"><span>Twitter</span><strong>${fmtNum(views.twitter || 0)}</strong></div>
            <div class="x2c-row"><span>Telegram</span><strong>${fmtNum(views.telegram || 0)}</strong></div>
            <div class="x2c-row"><span>Original / Clips</span><strong>${fmtNum(views.original || 0)} / ${fmtNum(views.clips || 0)}</strong></div>
          </div>
        </div>
      </div>

      <div class="x2c-card" style="margin-top:14px;">
        <h4>Distribution Status</h4>
        <div class="x2c-table-wrap">
          <table class="x2c-table">
            <thead><tr><th>Platform</th><th>Episode</th><th>Status</th><th>Account</th><th>Post</th></tr></thead>
            <tbody>${distRows}</tbody>
          </table>
        </div>
      </div>

  `;

    modal.classList.add('open');
    document.body.classList.add('no-scroll');
  }

  async function loadX2CShowcase() {
    const rail = document.getElementById('showcaseRail');
    if (!rail) return;
    try {
      const resp = await fetch('/api/x2c/projects?page=1&page_size=10&production_source=compute_generated');
      const json = await resp.json();
      const projects = (json?.data?.projects || []).slice(0, 10);

      const subtitle = document.querySelector('.showcase-subtitle');
      if (subtitle) {
        subtitle.textContent = '这些都是真实客户的作品。点开任何一部,看完整的作品收益和分发信息。';
      }

      const stats = document.querySelectorAll('.showcase-stats > div');
      if (stats.length >= 3) {
        const projectsCount = projects.length;
        const episodesTotal = projects.reduce((sum, p) => sum + Number(p.episode_count || 0), 0);
        const revenueTotal = projects.reduce((sum, p) => sum + Number(p.cumulative_revenue_usd || 0), 0);
        stats[0].innerHTML = `<strong>${fmtNum(projectsCount)}</strong>projects loaded`;
        stats[1].innerHTML = `<strong>${fmtNum(episodesTotal)}</strong>episodes total`;
        stats[2].innerHTML = `<strong>${fmtMoney(revenueTotal)}</strong>revenue total`;
      }

      rail.innerHTML = '';

      projects.forEach((p) => {
        const card = document.createElement('div');
        card.className = 'case-card';
        card.innerHTML = `
          <div class="case-thumb" style="background-image:url('${p.cover_media_url || ''}'); background-size:cover; background-position:center;">
            <div class="case-creator">AI Drama</div>
            <div class="case-revenue">$${Number(p.cumulative_revenue_usd || 0).toFixed(2)}</div>
            <div class="case-views"><span>▶ ${fmtNum(p.total_views)} views</span><span>${p.episode_count || 0} eps</span></div>
          </div>
          <div class="case-info">
            <div class="case-title">${p.title || 'Untitled'}</div>
            <div class="case-meta">ROI ${Number(p.roi_multiplier || 0).toFixed(2)}x</div>
          </div>
          <div class="case-hover-cta">→ VIEW PERFORMANCE DETAIL</div>
        `;
        card.addEventListener('click', async () => {
          const dResp = await fetch('/api/x2c/projects/' + p.id);
          const dJson = await dResp.json();
          if (!dJson.ok) throw new Error(dJson.error || 'detail failed');
          openX2CModal(dJson.data);
        });
        rail.appendChild(card);
      });
    } catch (e) {
      rail.innerHTML = `<div class="agent-card" style="min-width:360px;"><div class="agent-task">X2C 数据加载失败: ${e.message}</div></div>`;
    }
  }

  const termWrap = document.querySelector('.agent-terminal-wrap');
  const terminalHeader = termWrap && termWrap.querySelector('.terminal-header');
  const leftPane = document.querySelector('.pane-left');
  const wall = document.querySelector('.wall');
  const centerSub = document.querySelector('.center-sub');
  const termLog = document.getElementById('terminalLog');
  const termBody = document.getElementById('terminalBody');

  let projects = [];
  let selectedRunId = null;
  let activeRunId = null;
  let pollTimer = null;
  let lastLogId = 0;
  let storyProjects = [];
  let selectedStoryProjectUuid = null;

  function setStage(stage) {
    const stages = ['script', 'casting', 'storyboard', 'render', 'distribute'];
    document.querySelectorAll('.pipeline-step').forEach((s) => s.classList.remove('active', 'done'));
    const stageIdx = stages.indexOf(stage);
    stages.forEach((st, i) => {
      const el = document.querySelector(`.pipeline-step[data-stage="${st}"]`);
      if (!el) return;
      if (i < stageIdx) el.classList.add('done');
      if (i === stageIdx) el.classList.add('active');
    });
  }

  // 轮询动画 spinner
  const _spinFrames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let _spinIdx = 0;
  const _pollLines = new Map(); // key -> {el, base}
  setInterval(() => {
    _spinIdx = (_spinIdx + 1) % _spinFrames.length;
    _pollLines.forEach(({el, baseEl}) => {
      el.textContent = _spinFrames[_spinIdx];
    });
  }, 100);

  function appendLine(tagClass, tagText, payload, stage) {
    if (!termLog || !termBody) return;
    setStage(stage || 'script');

    const payloadStr = String(payload || '');
    // 检测轮询类消息（含"中"/"中..."/"ing"/"轮询"/"等待"/"进度"）
    const isPoll = /中\s*\d|generating|pending|processing|等待|轮询|进度|in progress/.test(payloadStr);

    // 对同一 tagClass+关键词 的轮询行复用（更新而非追加）
    const pollKey = isPoll ? tagClass + ':' + payloadStr.replace(/\d+/g, '#') : null;
    if (pollKey && _pollLines.has(pollKey)) {
      const {el, baseEl} = _pollLines.get(pollKey);
      baseEl.textContent = payloadStr;
      return;
    }

    const line = document.createElement('div');
    line.className = 'log-line';
    const tag = document.createElement('span');
    tag.className = 'log-tag ' + tagClass;
    tag.textContent = tagText;
    const text = document.createElement('span');
    text.className = 'log-text';

    if (isPoll) {
      const spinSpan = document.createElement('span');
      spinSpan.style.cssText = 'color:var(--gold);margin-right:6px;';
      spinSpan.textContent = _spinFrames[_spinIdx];
      const baseSpan = document.createElement('span');
      baseSpan.textContent = payloadStr;
      text.appendChild(spinSpan);
      text.appendChild(baseSpan);
      _pollLines.set(pollKey, {el: spinSpan, baseEl: baseSpan});
    } else {
      text.textContent = payloadStr;
      // 清理已完成的轮询行（同 tagClass 的）
      for (const [k] of _pollLines) {
        if (k.startsWith(tagClass + ':')) _pollLines.delete(k);
      }
    }

    line.appendChild(tag);
    line.appendChild(text);
    termLog.appendChild(line);
    termBody.scrollTop = termBody.scrollHeight;
    while (termLog.children.length > 60) termLog.removeChild(termLog.firstChild);
  }

  function projectStatusLabel(p) {
    if (p.status === 'completed') return 'COMPLETED';
    if (p.status === 'failed') return 'FAILED';
    return 'RUNNING';
  }

  function storyStatusLabel(p) {
    if (typeof p.status === 'string' && p.status.startsWith('generating:')) return '剧本生成中 ' + p.status.split(':')[1];
    if (p.status === 'completed') return 'COMPLETED';
    if (p.status === 'partial_failed' || p.status === 'failed') return 'FAILED';
    if (p.status === 'planned' || p.status === 'draft') return 'PLANNED';
    return 'RUNNING';
  }

  // 单集轮询：持续拉取 runId 日志直到完成/失败，返回最终状态
  async function pollRunStatus(runId, tip, runBtn) {
    activeRunId = runId;
    lastLogId = 0;
    if (pollTimer) clearInterval(pollTimer);
    return new Promise((resolve) => {
      pollTimer = setInterval(async () => {
        if (!activeRunId) { clearInterval(pollTimer); pollTimer = null; resolve('stopped'); return; }
        try {
          const sResp = await fetch(`/api/agent/status/${activeRunId}?since_id=${lastLogId}`);
          const sJson = await sResp.json().catch(() => ({}));
          if (!sResp.ok || !sJson.ok) throw new Error(sJson.error || 'status query failed');
          const newLogs = sJson.logs || [];
          newLogs.forEach((l) => {
            appendLine(l.tagClass, l.tagText, l.payload, l.stage);
            lastLogId = Math.max(lastLogId, Number(l.id || 0));
          });
          if (newLogs.length > 0 && selectedStoryProjectUuid) {
            renderStoryEpisodes(selectedStoryProjectUuid).catch(() => {});
          }
          const runStatus = sJson.run?.status;
          if (runStatus === 'completed' || runStatus === 'failed') {
            clearInterval(pollTimer); pollTimer = null; activeRunId = null;
            if (runBtn) runBtn.disabled = false;
            _pollLines.clear();
            await refreshStoryWorkspace();
            resolve(runStatus);
          }
        } catch (e) {
          appendLine('system', 'SYSTEM', `状态轮询失败: ${e.message}`, 'distribute');
          clearInterval(pollTimer); pollTimer = null; activeRunId = null;
          if (runBtn) runBtn.disabled = false;
          resolve('error');
        }
      }, 1500);
    });
  }

  // 全剧流水线轮询：持续跟踪所有集的日志，自动切换
  async function pollPipeline(projectUuid) {
    const tip = document.getElementById('oclawTip');
    let trackingRunId = null;   // 当前正在显示日志的 run_id
    let trackingEpNo = null;    // 当前显示的集号
    let epLastLogId = {};       // 每集独立的 lastLogId
    let consecutiveIdle = 0;    // 连续没有活跃集的次数

    const TERMINAL_STATUSES = new Set(['completed','failed','partial_failed']);
    const ACTIVE_STATUSES = new Set(['running']);

    // 停止当前 pollRunStatus 轮询
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    activeRunId = null;

    // 页面刷新恢复时，先获取各集当前最新日志 ID，避免重复显示历史日志
    let initialized = false;

    const loopTimer = setInterval(async () => {
      try {
        const resp = await fetch(`/api/agent/projects/${projectUuid}`);
        const json = await resp.json().catch(() => ({}));
        const eps = json.data?.episodes || [];
        const pStatus = json.data?.project?.status || '';

        // 首次轮询：初始化各集 lastLogId 为当前最新，不重放历史日志
        if (!initialized) {
          initialized = true;
          for (const ep of eps) {
            if (!ep.run_id) continue;
            const r = await fetch(`/api/agent/status/${ep.run_id}?since_id=0`);
            const j = await r.json().catch(() => ({}));
            const logs = j.logs || [];
            if (logs.length) {
              epLastLogId[ep.run_id] = Number(logs[logs.length-1].id || 0);
            }
          }
          appendLine('system', 'SYSTEM', '[恢复] 已跳过历史日志，从当前进度继续显示', 'system');
        }

        // 刷新剧集列表
        if (selectedStoryProjectUuid === projectUuid) {
          renderStoryEpisodes(projectUuid).catch(() => {});
        }

        // 找当前 running 的集（按集号最小优先）
        const runningEp = eps.filter(e => ACTIVE_STATUSES.has(e.status) && e.run_id)
                             .sort((a,b) => a.episode_no - b.episode_no)[0];

        if (runningEp) {
          consecutiveIdle = 0;
          const epNo = runningEp.episode_no;
          const runId = runningEp.run_id;

          // 切换到新集时打分隔线
          if (trackingEpNo !== epNo) {
            trackingEpNo = epNo;
            trackingRunId = runId;
            epLastLogId[runId] = epLastLogId[runId] || 0;
            if (tip) tip.textContent = `EP${epNo} 制作中...`;
            appendLine('system', 'SYSTEM', `━━━ EP${epNo} 开始制作 ━━━`, 'system');
          }

          // 拉取该集的增量日志
          const since = epLastLogId[runId] || 0;
          const sResp = await fetch(`/api/agent/status/${runId}?since_id=${since}`);
          const sJson = await sResp.json().catch(() => ({}));
          if (sJson.ok) {
            (sJson.logs || []).forEach(l => {
              appendLine(l.tagClass, l.tagText, l.payload, l.stage);
              epLastLogId[runId] = Math.max(epLastLogId[runId] || 0, Number(l.id || 0));
            });
            // 若该集 run 已完成，再拉一次确保尾部日志不遗漏
            const runStatus = sJson.run?.status;
            if (runStatus === 'completed' || runStatus === 'failed' || runStatus === 'phase1_done') {
              const sResp2 = await fetch(`/api/agent/status/${runId}?since_id=${epLastLogId[runId] || 0}`);
              const sJson2 = await sResp2.json().catch(() => ({}));
              if (sJson2.ok) {
                (sJson2.logs || []).forEach(l => {
                  appendLine(l.tagClass, l.tagText, l.payload, l.stage);
                  epLastLogId[runId] = Math.max(epLastLogId[runId] || 0, Number(l.id || 0));
                });
              }
            }
          }
        } else {
          // 没有 running 集：检查是否有 phase1_done 在等 Phase2
          const hasPhase1Done = eps.some(e => e.status === 'phase1_done');
          const hasRunning = eps.some(e => e.status === 'running');

          if (hasPhase1Done && !hasRunning) {
            if (tip) tip.textContent = 'Phase 1 完成，等待 Phase 2 开始...';
            consecutiveIdle++;
          } else {
            consecutiveIdle++;
          }

          // 项目最终完成：先把所有集的剩余日志全部拉完，再停止
          if (TERMINAL_STATUSES.has(pStatus)) {
            clearInterval(loopTimer);
            // 最后一轮：把每一集的日志拉到最新，确保 100% 和视频地址都显示出来
            for (const ep2 of eps) {
              if (!ep2.run_id) continue;
              const since2 = epLastLogId[ep2.run_id] || 0;
              try {
                const fr = await fetch(`/api/agent/status/${ep2.run_id}?since_id=${since2}`);
                const fj = await fr.json().catch(() => ({}));
                if (fj.ok) {
                  (fj.logs || []).forEach(l => {
                    appendLine(l.tagClass, l.tagText, l.payload, l.stage);
                    epLastLogId[ep2.run_id] = Math.max(epLastLogId[ep2.run_id] || 0, Number(l.id || 0));
                  });
                }
              } catch(_) {}
            }
            const ok = pStatus === 'completed';
            if (tip) tip.textContent = ok ? '🎉 全剧制作完成！' : '全剧制作结束（部分集失败）';
            appendLine('system', 'SYSTEM', `━━━ 全剧流水线结束 [${pStatus}] ━━━`, 'system');
            await renderStoryEpisodes(projectUuid);
            await refreshStoryWorkspace();
          }
        }
      } catch(e) {
        // 忽略单次轮询错误，继续
      }
    }, 2000);

    // 暴露给外部用于停止
    window._pipelineLoopTimer = loopTimer;
  }

  function renderStoryProjects() {
    if (!leftPane) return;
    const cards = storyProjects.map((p) => {
      const active = p.project_uuid === selectedStoryProjectUuid ? 'active' : '';
      const busy = (p.status === 'running') ? 'busy' : 'idle';
      return `
        <div class="agent-card project-card ${busy} ${active}" data-project-uuid="${p.project_uuid}" style="cursor:pointer;">
          <div class="agent-head">
            <span class="agent-name">${(p.name || p.project_uuid).slice(0, 22)}</span>
            <span class="agent-role">${storyStatusLabel(p)}</span>
          </div>
          <div class="agent-task">${(p.idea || '').slice(0, 80) || '-'}</div>
          <div class="agent-meta">
            <span>${p.aspect || '16:9'} · ${p.language || 'zh-CN'}</span>
            <span>${(p.updated_at || '').replace('T',' ').slice(0,16)}</span>
          </div>
        </div>
      `;
    }).join('');

    leftPane.innerHTML = `
      <div class="pane-title">
        <span>Story Projects · ${storyProjects.length}</span>
        <span class="pane-title-tag">EP MODE</span>
      </div>
      <div style="overflow-y:auto;flex:1;min-height:0;">
        ${cards || '<div class="agent-card idle"><div class="agent-task">暂无项目数据</div></div>'}
      </div>
    `;

    leftPane.querySelectorAll('.project-card').forEach((el) => {
      el.addEventListener('click', async () => {
        selectedStoryProjectUuid = el.dataset.projectUuid;
        renderStoryProjects();
        await renderStoryEpisodes(selectedStoryProjectUuid);
      });
    });
  }

  async function runEpisode(projectUuid, episodeNo) {
    const runBtn = document.getElementById(`run-ep-${episodeNo}`);
    const tip = document.getElementById('oclawTip');
    if (runBtn) runBtn.disabled = true;
    if (tip) tip.textContent = `EP${episodeNo} 已提交，开始执行...`;
    if (termLog) termLog.innerHTML = '';
    try {
      const resp = await fetch(`/api/agent/projects/${projectUuid}/episodes/${episodeNo}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoDuration: 60, styleId: 1 }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) throw new Error(data.error || 'run episode failed');
      appendLine('system', 'SYSTEM', `EP${episodeNo}任务已提交，run_id: ${data.data.runId}`, 'script');
      await pollRunStatus(data.data.runId, tip, runBtn);
    } catch (e) {
      appendLine('system', 'SYSTEM', `EP${episodeNo} 启动失败: ${e.message}`, 'distribute');
      if (tip) tip.textContent = `EP${episodeNo} 启动失败。`;
      if (runBtn) runBtn.disabled = false;
    }
  }

  async function renderStoryEpisodes(projectUuid) {
    if (!wall || !projectUuid) return;
    const resp = await fetch(`/api/agent/projects/${projectUuid}`);
    const json = await resp.json();
    const data = json.data || {};
    const eps = data.episodes || [];
    const mappings = data.mappings || [];
    const chars = data.characters || [];

    if (centerSub) {
      const completed = eps.filter((x) => x.status === 'completed').length;
      const running = eps.filter((x) => x.status === 'running').length;
      const planned = eps.filter((x) => x.status === 'planned' || x.status === 'draft').length;
      centerSub.textContent = `${completed} completed · ${running} running · ${planned} planned · episode mode`;
    }

    const box = document.getElementById('oclawDb');
    if (box) {
      const mappingRows = mappings.map((m) => `${m.project_character_key} -> ${m.giggle_character_id || '-'}`).join('<br>');
      box.innerHTML = `project_uuid: ${projectUuid}<br>characters: ${chars.length}<br>active mappings: ${mappings.length}<br>${mappingRows || 'no mappings yet'}`;
    }

    // 如果项目正在生成剧本（且还没有集数据），显示等待提示
    const isGeneratingStatus = typeof data.project?.status === 'string'
      && (data.project.status === 'generating' || data.project.status.startsWith('generating:'));
    if (isGeneratingStatus && eps.length === 0) {
      const prog = data.project.status.includes(':') ? data.project.status.split(':')[1] : '';
      wall.innerHTML = `<div class="agent-card idle" style="grid-column:1/-1;text-align:center;padding:40px;">
        <div class="agent-task" style="font-size:14px;">⏳ AI 正在生成剧本${prog ? ' (' + prog + ')' : ''}...</div>
        <div style="margin-top:8px;font-size:11px;opacity:.5;">通常需要 1-2 分钟</div>
      </div>`;
      // 不 return，继续执行下面的控制台轮询逻辑
    }

    wall.innerHTML = eps.map((ep, idx) => {
      const st = ep.status === 'completed'
        ? { cls: 'published', label: 'COMPLETED', pct: 100 }
        : ep.status === 'running'
          ? { cls: 'rendering', label: 'RUNNING', pct: 55 }
          : ep.status === 'failed' || ep.status === 'partial_failed'
            ? { cls: 'queued', label: 'FAILED', pct: 10 }
            : { cls: 'queued', label: 'PLANNED', pct: 8 };
      // 封面图：优先 cover_url，否则从 export_url 推导 .thumb.jpg
      const _eu = ep.export_url || '';
      const _thumbMatch = _eu.match(/(https:\/\/assets\.giggle\.pro\/public\/ai_director\/[^\/]+\/[^.?]+)\.mp4/);
      const thumbUrl = ep.cover_url || ep.thumbnail_url || (_thumbMatch ? _thumbMatch[1] + '.thumb.jpg' : '');
      const thumbStyle = thumbUrl
        ? `background-image:url('${thumbUrl}');background-size:cover;background-position:center;`
        : '';
      return `
        <div class="ep ep${(idx % 6) + 1}" data-ep-no="${ep.episode_no}" style="cursor:pointer;">
          <div class="ep-thumb" style="${thumbStyle}">
            <span class="ep-status ${st.cls}">${st.label}</span>
            <div class="ep-thumb-text">EP${ep.episode_no} · ${data.project?.name || ''}</div>
          </div>
          <div class="ep-info">
            <div class="ep-show">${ep.title || `第${ep.episode_no}集`}</div>
            <div class="ep-title" style="font-size:11px;opacity:.6;height:auto;">${ep.giggle_project_id ? 'Giggle: ' + ep.giggle_project_id.slice(0,8) + '…' : '未关联 Giggle 项目'}</div>
            <div class="ep-bar"><span style="width:${st.pct}%;"></span></div>
            <div class="ep-meta"><span>${ep.status || '-'}</span><span>${ep.export_url ? '✓ 视频' : '-'}</span></div>
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button onclick="showEpModal(event,${ep.episode_no})" class="oclaw-btn" style="flex:1;font-size:11px;background:rgba(232,179,57,.15);border-color:rgba(232,179,57,.4);">🎬 详情</button>
              <button id="run-ep-${ep.episode_no}" class="oclaw-btn" style="flex:1;font-size:11px;" ${ep.status === 'running' ? 'disabled' : ''}>▶ 生产</button>
            </div>
          </div>
        </div>
      `;
    }).join('') || '<div class="agent-card idle" style="grid-column:1/-1;"><div class="agent-task">该项目暂无分集数据</div></div>';

    // Store episodes data for modal access
    window._currentEpisodes = eps;
    window._currentProjectName = data.project?.name || '';
    window._currentChars = data.characters || [];
    window._currentShots = data.shots || [];
    window._currentProjectUuid = projectUuid;

    // 剧本生成中：用 scriptRunId 接续控制台日志轮询
    // status='generating'（无进度）或 'generating:N/M'（有进度）都立刻轮询
    const scriptRunId = data.scriptRunId;
    const isScriptGenerating = typeof data.project?.status === 'string'
      && (data.project.status === 'generating' || data.project.status.startsWith('generating:'));
    if (isScriptGenerating && scriptRunId && !activeRunId && !pollTimer) {
      const tip = document.getElementById('oclawTip');
      if (tip) {
        const prog = data.project.status.includes(':') ? ` ${data.project.status.split(':')[1]}` : '';
        tip.textContent = `剧本生成中${prog}，控制台实时显示进度...`;
      }
      if (termLog) termLog.innerHTML = '';
      lastLogId = 0;
      appendLine('system', 'SYSTEM', '正在匹配风格、准备生成剧本，请稍候...', 'script');
      // 等剧本生成完成，然后自动切换到全剧流水线轮询
      await pollRunStatus(scriptRunId, tip, null);
      // 剧本完成后，自动跟踪后续流水线进度
      if (selectedStoryProjectUuid) {
        appendLine('system', 'SYSTEM', '━━ 剧本生成完成，自动跟踪视频制作进度 ━━', 'system');
        if (window._pipelineLoopTimer) { clearInterval(window._pipelineLoopTimer); window._pipelineLoopTimer = null; }
        pollPipeline(selectedStoryProjectUuid);
      }
    }

    eps.forEach((ep) => {
      const btn = document.getElementById(`run-ep-${ep.episode_no}`);
      if (!btn) return;
      btn.disabled = ep.status === 'running';
      btn.addEventListener('click', (e) => { e.stopPropagation(); runEpisode(projectUuid, ep.episode_no); });
    });
  }

  // 页面加载时自动恢复轮询（检测 running 状态的集数）
  async function autoResumePolling() {
    try {
      // 停止已有的流水线轮询
      if (window._pipelineLoopTimer) { clearInterval(window._pipelineLoopTimer); window._pipelineLoopTimer = null; }
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      activeRunId = null;

      for (const p of storyProjects) {
        try {
          const resp = await fetch(`/api/agent/projects/${p.project_uuid}`);
          if (!resp.ok) continue;
          const json = await resp.json();
          const eps = json.data?.episodes || [];
          const pStatus = json.data?.project?.status || '';
          // 有集在 running/phase1_done 或项目在 running/generating 状态，启动全剧流水线轮询
          const hasActive = eps.some(e => ['running','phase1_done'].includes(e.status) && e.run_id);
          const isActive = hasActive || pStatus === 'running' || pStatus === 'generating' || pStatus.startsWith('generating:');
          if (isActive) {
            selectedStoryProjectUuid = p.project_uuid;
            renderStoryProjects();
            await renderStoryEpisodes(p.project_uuid);
            const tip = document.getElementById('oclawTip');
            if (tip) tip.textContent = '检测到任务进行中，已自动恢复轮询...';
            appendLine('system', 'SYSTEM', '[恢复] 检测到流水线进行中，自动跟踪进度', 'system');
            pollPipeline(p.project_uuid);
            return;
          }
        } catch (_) { continue; }
      }
    } catch (_) {}
  }

  async function refreshStoryWorkspace() {
    const resp = await fetch('/api/agent/projects?limit=50');
    const json = await resp.json();
    storyProjects = json.data || [];
    if (!selectedStoryProjectUuid && storyProjects.length) selectedStoryProjectUuid = storyProjects[0].project_uuid;
    if (selectedStoryProjectUuid && !storyProjects.find((p) => p.project_uuid === selectedStoryProjectUuid)) {
      selectedStoryProjectUuid = storyProjects[0]?.project_uuid || null;
    }
    renderStoryProjects();
    if (selectedStoryProjectUuid) await renderStoryEpisodes(selectedStoryProjectUuid);
    // 如果有剧本生成中的项目，启动自动轮询
    if (typeof pollScriptGen === 'function' && storyProjects.some(p => typeof p.status === 'string' && p.status.startsWith('generating:'))) pollScriptGen();
  }

  async function createStoryProjectFromInput() {
    const ideaInput = document.getElementById('oclawIdea');
    const nameInput = document.getElementById('oclawProjectName');
    const countInput = document.getElementById('oclawEpisodeCount');
    const runBtn = document.getElementById('oclawRun');
    const tip = document.getElementById('oclawTip');
    const idea = (ideaInput?.value || '').trim();
    if (!idea) {
      if (tip) tip.textContent = '请先输入项目创意。';
      return;
    }
    if (runBtn) runBtn.disabled = true;
    try {
      const resp = await fetch('/api/agent/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: (nameInput?.value || '').trim() || '',
          idea,
          episodeCount: Number(countInput?.value || 1),
          language: 'zh-CN',
          aspect: '16:9',
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) throw new Error(data.error || 'create project failed');
      selectedStoryProjectUuid = data.data.project.project_uuid;
      if (tip) tip.textContent = '项目已创建，可在中间点击“生产 EP”逐集执行。';
      await refreshStoryWorkspace();
    } catch (e) {
      if (tip) tip.textContent = `创建失败: ${e.message}`;
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  }

  function renderProjects() {
    if (!leftPane) return;
    const cards = projects.map((p) => {
      const active = p.run_id === selectedRunId ? 'active' : '';
      const busy = p.status === 'running' ? 'busy' : 'idle';
      return `
        <div class="agent-card project-card ${busy} ${active}" data-run-id="${p.run_id}" style="cursor:pointer;">
          <div class="agent-head">
            <span class="agent-name">${(p.project_name || p.project_id || p.run_id).slice(0, 22)}</span>
            <span class="agent-role">${projectStatusLabel(p)}</span>
          </div>
          <div class="agent-task">${(p.idea || '').slice(0, 80) || '-'} </div>
          <div class="agent-meta">
            <span>episodes ${p.episode_count || 0}</span>
            <span>${(p.updated_at || '').replace('T',' ').slice(0,16)}</span>
          </div>
        </div>
      `;
    }).join('');

    leftPane.innerHTML = `
      <div class="pane-title">
        <span>Your Projects · ${projects.length}</span>
        <span class="pane-title-tag">LOCAL DB</span>
      </div>
      ${cards || '<div class="agent-card idle"><div class="agent-task">暂无项目数据</div></div>'}
    `;

    leftPane.querySelectorAll('.project-card').forEach((el) => {
      el.addEventListener('click', async () => {
        selectedRunId = el.dataset.runId;
        renderProjects();
        await renderEpisodes(selectedRunId);
      });
    });
  }

  function inferEpisodeStatus(row) {
    const v = (row.video_status || '').toLowerCase();
    if (v.includes('completed')) return { cls: 'published', label: 'PUBLISHED' };
    if (v.includes('generating') || v.includes('running')) return { cls: 'rendering', label: 'RENDERING' };
    if (v.includes('failed')) return { cls: 'queued', label: 'FAILED' };
    return { cls: 'queued', label: 'QUEUED' };
  }

  async function renderEpisodes(runId) {
    if (!wall || !runId) return;
    const resp = await fetch(`/api/local/projects/${runId}/episodes`);
    const json = await resp.json();
    const list = json.data || [];

    if (centerSub) {
      const completed = list.filter((x) => (x.video_status || '').toLowerCase().includes('completed')).length;
      const rendering = list.filter((x) => (x.video_status || '').toLowerCase().includes('generating') || (x.video_status || '').toLowerCase().includes('running')).length;
      const queued = Math.max(0, list.length - completed - rendering);
      centerSub.textContent = `${completed} shipped · ${rendering} rendering · ${queued} queued · local data`;
    }

    wall.innerHTML = list.slice(0, 18).map((row, idx) => {
      const st = inferEpisodeStatus(row);
      const title = (row.prompt || `Episode ${idx + 1}`).slice(0, 42);
      const epNo = row.shot_id || idx + 1;
      return `
        <div class="ep ep${(idx % 6) + 1}">
          <div class="ep-thumb">
            <span class="ep-status ${st.cls}">${st.label}</span>
            <div class="ep-thumb-text">shot ${epNo} · project ${runId.slice(0, 8)}</div>
          </div>
          <div class="ep-info">
            <div class="ep-show">Project ${runId.slice(0, 8)} · EP${idx + 1}</div>
            <div class="ep-title">${title}</div>
            <div class="ep-bar"><span style="width:${st.label === 'PUBLISHED' ? 100 : st.label === 'RENDERING' ? 55 : 8}%;"></span></div>
            <div class="ep-meta"><span>video: ${row.video_status || '-'}</span><span>${st.label}</span></div>
          </div>
        </div>
      `;
    }).join('') || '<div class="agent-card idle" style="grid-column:1/-1;"><div class="agent-task">该项目暂无剧集/分镜数据</div></div>';
  }

  async function refreshLocalSnapshot() {
    const box = document.getElementById('oclawDb');
    try {
      const [latestResp, projectsResp] = await Promise.all([
        fetch('/api/local/latest'),
        fetch('/api/local/projects')
      ]);
      const latestJson = await latestResp.json();
      const projectsJson = await projectsResp.json();
      projects = projectsJson.data || [];

      if (!selectedRunId && projects.length) selectedRunId = projects[0].run_id;
      if (selectedRunId && !projects.find((p) => p.run_id === selectedRunId)) selectedRunId = projects[0]?.run_id || null;

      renderProjects();
      if (selectedRunId) await renderEpisodes(selectedRunId);

      const d = latestJson.data;
      if (box) {
        if (!d || !d.run) box.textContent = '本地数据库快照: 暂无数据';
        else box.innerHTML = `run_id: ${d.run.run_id}<br>project_id: ${d.run.project_id || '-'}<br>status: ${d.run.status}<br>characters: ${(d.characters || []).length}<br>storyboards: ${(d.storyboards || []).length}`;
      }
    } catch (e) {
      if (box) box.textContent = '本地数据库快照加载失败: ' + e.message;
    }
  }

  async function run() {
    const ideaInput = document.getElementById('oclawIdea');
    const runBtn = document.getElementById('oclawRun');
    const tip = document.getElementById('oclawTip');
    const idea = (ideaInput?.value || '').trim();
    if (!idea) {
      if (tip) tip.textContent = '请先输入你的短剧想法。';
      return;
    }

    if (runBtn) runBtn.disabled = true;
    if (tip) tip.textContent = '任务执行中，请等待所有步骤自动完成...';
    if (termLog) termLog.innerHTML = '';
    lastLogId = 0;

    try {
      const resp = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea, aspect: '16:9', language: 'zh-CN', videoDuration: 60, styleId: 1 })
      });

      const raw = await resp.text();
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        throw new Error(`Server returned non-JSON response (status ${resp.status}).`);
      }

      if (!resp.ok || !data.ok) {
        appendLine('system', 'SYSTEM', `Run create failed: ${data.error || 'unknown error'}`, 'distribute');
        if (tip) tip.textContent = '执行失败，请检查 API 配置与日志。';
        if (runBtn) runBtn.disabled = false;
        return;
      }

      activeRunId = data.runId;
      appendLine('system', 'SYSTEM', `任务已提交，run_id: ${activeRunId}`, 'script');
      if (tip) tip.textContent = '任务已提交，正在自动执行并同步状态...';
      await refreshLocalSnapshot();

      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        if (!activeRunId) return;
        try {
          const sResp = await fetch(`/api/agent/status/${activeRunId}?since_id=${lastLogId}`);
          const sJson = await sResp.json().catch(() => ({}));
          if (!sResp.ok || !sJson.ok) throw new Error(sJson.error || 'status query failed');

          const newLogs2 = sJson.logs || [];
          newLogs2.forEach((l) => {
            appendLine(l.tagClass, l.tagText, l.payload, l.stage);
            lastLogId = Math.max(lastLogId, Number(l.id || 0));
          });
          if (newLogs2.length > 0 && selectedStoryProjectUuid) {
            renderStoryEpisodes(selectedStoryProjectUuid).catch(() => {});
          }

          if (sJson.run?.status === 'completed') {
            if (tip) tip.textContent = '执行完成。';
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = null;
            activeRunId = null;
            if (runBtn) runBtn.disabled = false;
            await refreshLocalSnapshot();
          } else if (sJson.run?.status === 'failed') {
            if (tip) tip.textContent = '执行失败，请查看上方日志。';
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = null;
            activeRunId = null;
            if (runBtn) runBtn.disabled = false;
            await refreshLocalSnapshot();
          }
        } catch (e) {
          appendLine('system', 'SYSTEM', `状态轮询失败: ${e.message}`, 'distribute');
          if (tip) tip.textContent = '状态同步失败，请检查服务日志。';
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
          activeRunId = null;
          if (runBtn) runBtn.disabled = false;
        }
      }, 1500);
    } catch (err) {
      appendLine('system', 'SYSTEM', 'Pipeline failed: ' + err.message, 'distribute');
      if (tip) tip.textContent = '请求失败，请检查服务是否启动。';
      if (runBtn) runBtn.disabled = false;
      activeRunId = null;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }
  }

  if (termWrap && terminalHeader) {
    const panel = document.createElement('div');
    panel.className = 'oclaw-panel';
    panel.innerHTML = `
      <div class="oclaw-row">
        <input id="oclawProjectName" class="oclaw-input" style="max-width:220px;min-width:220px;" placeholder="项目名（可选）" />
        <input id="oclawEpisodeCount" class="oclaw-input" style="max-width:120px;min-width:120px;" type="number" min="1" value="3" />
        <input id="oclawIdea" class="oclaw-input" placeholder="输入短剧想法，例如：重生复仇甜宠，30集，每集60秒" />
        <button id="oclawRun" class="oclaw-btn">创建项目</button>
        <button id="oclawRefresh" class="oclaw-btn" style="background:#222;color:#ddd;">刷新项目数据</button>
      </div>

      <div class="oclaw-db" id="oclawDb">本地数据库快照: 暂无数据</div>
    `;
    terminalHeader.insertAdjacentElement('afterend', panel);

    const runBtn = document.getElementById('oclawRun');
    const refreshBtn = document.getElementById('oclawRefresh');
    if (runBtn) runBtn.addEventListener('click', createStoryProjectFromInput);
    if (refreshBtn) refreshBtn.addEventListener('click', refreshStoryWorkspace);
    refreshStoryWorkspace().then(autoResumePolling);

    // 剧本生成中时自动轮询刷新
    let _scriptGenTimer = null;
    function pollScriptGen() {
      if (_scriptGenTimer) return;
      _scriptGenTimer = setInterval(async () => {
        const hasGen = storyProjects.some(p => typeof p.status === 'string' && p.status.startsWith('generating:'));
        if (!hasGen) { clearInterval(_scriptGenTimer); _scriptGenTimer = null; return; }
        await refreshStoryWorkspace();
      }, 3000);
    }
    setTimeout(() => {
      if (storyProjects.some(p => typeof p.status === 'string' && p.status.startsWith('generating:'))) pollScriptGen();
    }, 1000);
  }

  loadX2CShowcase();
})();


// ── 剧集详情弹窗 ──────────────────────────────────────────────
function showEpModal(e, epNo) {
  if (e) e.stopPropagation();
  const eps = window._currentEpisodes || [];
  const ep = eps.find((x) => x.episode_no === epNo);
  if (!ep) return;

  const existing = document.getElementById('epDetailModal');
  if (existing) existing.remove();

  const projectName = window._currentProjectName || '';
  const title = ep.title || `第${epNo}集`;
  const coverUrl = ep.cover_url || ep.thumbnail_url || '';
  const exportUrl = ep.export_url || '';
  const giggleId = ep.giggle_project_id || '';

  // 角色信息（从 window._currentChars 读取）
  const chars = window._currentChars || [];
  const charsHtml = chars.length ? chars.map(c => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:#1a1a1f;border:1px solid #2a2a30;border-radius:6px;">
      ${c.image_url ? `<img src="${c.image_url}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;" />` : `<div style="width:48px;height:48px;background:linear-gradient(135deg,#e8b339,#3a2510);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;">👤</div>`}
      <div>
        <div style="font-size:13px;font-weight:600;color:#f2f2f2;">${c.name || '-'}</div>
        <div style="font-size:11px;color:#a4a4ab;margin-top:2px;">${c.gender || ''} ${c.voice_name ? '· ' + c.voice_name : ''}</div>
        <div style="font-size:10px;color:#5e5e66;margin-top:2px;">asset: ${(c.asset_id || '-').slice(0,12)}</div>
      </div>
    </div>`).join('') : '<div style="color:#5e5e66;font-size:12px;">暂无角色数据</div>';

  // 分镜信息（从 window._currentShots 读取）
  const shots = (window._currentShots || []).filter(s => s.giggle_project_id === giggleId || !giggleId);
  const shotsHtml = shots.length ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;">
      ${shots.slice(0,18).map(s => `
        <div style="border:1px solid #2a2a30;border-radius:4px;overflow:hidden;background:#111;">
          ${s.signed_url ? `<img src="${s.signed_url}" style="width:100%;aspect-ratio:9/16;object-fit:cover;display:block;" />` : `<div style="aspect-ratio:9/16;background:#1a1a1f;display:flex;align-items:center;justify-content:center;font-size:18px;">🎬</div>`}
          <div style="padding:4px 6px;">
            <div style="font-size:9px;color:#5e5e66;">SHOT ${s.shot_id || '-'}</div>
            <div style="font-size:9px;color:${s.video_generating_status === 'completed' ? '#4ade80' : s.video_generating_status === 'failed' ? '#f87171' : '#e8b339'};">${s.video_generating_status || s.generating_status || 'pending'}</div>
          </div>
        </div>`).join('')}
    </div>` : '<div style="color:#5e5e66;font-size:12px;">暂无分镜数据（生产后可见）</div>';

  const modal = document.createElement('div');
  modal.id = 'epDetailModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);backdrop-filter:blur(8px);display:flex;align-items:flex-start;justify-content:center;padding:24px;overflow-y:auto;';
  modal.innerHTML = `
    <div style="background:#0f0f12;border:1px solid rgba(232,179,57,.25);border-radius:12px;max-width:900px;width:100%;margin:auto;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6);">

      <!-- 顶栏 -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #1f1f24;background:#111114;position:sticky;top:0;z-index:2;">
        <div>
          <div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:20px;color:#e8b339;">${projectName} · ${title}</div>
          <div style="font-size:11px;color:#5e5e66;margin-top:3px;font-family:monospace;">EP${epNo} · ${ep.status || '-'} ${giggleId ? '· Giggle: ' + giggleId.slice(0,8) + '…' : ''}</div>
        </div>
        <button onclick="document.getElementById('epDetailModal').remove()" style="background:none;border:1px solid #2a2a30;color:#a4a4ab;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:13px;transition:all .2s;" onmouseover="this.style.borderColor='#e8b339';this.style.color='#e8b339'" onmouseout="this.style.borderColor='#2a2a30';this.style.color='#a4a4ab'">✕ 关闭</button>
      </div>

      <!-- 封面 + 视频 -->
      ${coverUrl || exportUrl ? `
      <div style="position:relative;background:#0a0a0c;">
        ${exportUrl ? `
          <video controls style="width:100%;max-height:360px;display:block;background:#000;" poster="${coverUrl}">
            <source src="${exportUrl}" type="video/mp4" />
          </video>` : coverUrl ? `
          <img src="${coverUrl}" style="width:100%;max-height:360px;object-fit:cover;display:block;" />` : ''}
        ${exportUrl ? `<div style="position:absolute;top:10px;left:10px;background:rgba(74,222,128,.9);color:#000;font-family:monospace;font-size:10px;padding:3px 8px;border-radius:3px;font-weight:700;">✓ 视频已生成</div>` : ''}
      </div>` : ''}

      <!-- Tab 导航 -->
      <div style="display:flex;border-bottom:1px solid #1f1f24;" id="epModalTabs">
        <button class="ep-modal-tab active" data-panel="script" style="flex:1;padding:14px;background:rgba(232,179,57,.06);border:none;border-bottom:2px solid #e8b339;color:#e8b339;font-family:monospace;font-size:11px;letter-spacing:1px;cursor:pointer;">✨ 剧本</button>
        <button class="ep-modal-tab" data-panel="chars" style="flex:1;padding:14px;background:none;border:none;border-bottom:2px solid transparent;color:#5e5e66;font-family:monospace;font-size:11px;letter-spacing:1px;cursor:pointer;">👥 角色</button>
        <button class="ep-modal-tab" data-panel="shots" style="flex:1;padding:14px;background:none;border:none;border-bottom:2px solid transparent;color:#5e5e66;font-family:monospace;font-size:11px;letter-spacing:1px;cursor:pointer;">🎬 分镜</button>
        <button class="ep-modal-tab" data-panel="info" style="flex:1;padding:14px;background:none;border:none;border-bottom:2px solid transparent;color:#5e5e66;font-family:monospace;font-size:11px;letter-spacing:1px;cursor:pointer;">ℹ️ 信息</button>
      </div>

      <!-- 剧本面板 -->
      <div class="ep-modal-panel" data-panel="script" style="padding:24px;display:block;">
        <div style="font-family:monospace;font-size:12px;color:#5e5e66;margin-bottom:12px;letter-spacing:1px;">SCRIPT · EP${epNo}</div>
        <div style="font-size:13px;line-height:1.9;color:#d4d4d8;white-space:pre-wrap;background:#0a0a0c;padding:20px;border:1px solid #1f1f24;border-radius:6px;max-height:480px;overflow-y:auto;">${ep.script_text || ep.outline || '（暂无剧本内容）'}</div>
      </div>

      <!-- 角色面板 -->
      <div class="ep-modal-panel" data-panel="chars" style="padding:24px;display:none;">
        <div style="font-family:monospace;font-size:12px;color:#5e5e66;margin-bottom:12px;letter-spacing:1px;">CHARACTERS · ${chars.length} 个</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">${charsHtml}</div>
      </div>

      <!-- 分镜面板（懒加载） -->
      <div class="ep-modal-panel" data-panel="shots" style="padding:24px;display:none;">
        <div style="font-family:monospace;font-size:12px;color:#5e5e66;margin-bottom:12px;letter-spacing:1px;">STORYBOARD</div>
        <div class="shots-body"><div style="color:#5e5e66;font-size:12px;">点击此 Tab 加载分镜</div></div>
      </div>

      <!-- 信息面板 -->
      <div class="ep-modal-panel" data-panel="info" style="padding:24px;display:none;">
        <div style="font-family:monospace;font-size:12px;color:#5e5e66;margin-bottom:12px;letter-spacing:1px;">EPISODE INFO</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${[
            ['集数', `EP${epNo}`],
            ['标题', ep.title || '-'],
            ['状态', ep.status || '-'],
            ['Giggle 项目', giggleId || '未关联'],
            ['封面图', coverUrl ? '✓ 已生成' : '未生成'],
            ['导出视频', exportUrl ? '✓ 已导出' : '未导出'],
            ['run_id', ep.run_id || '-'],
            ['更新时间', (ep.updated_at || '-').replace('T',' ').slice(0,16)],
          ].map(([k,v]) => `
            <div style="background:#111114;border:1px solid #1f1f24;padding:12px;border-radius:6px;">
              <div style="font-family:monospace;font-size:10px;color:#5e5e66;letter-spacing:1px;margin-bottom:4px;">${k}</div>
              <div style="font-size:13px;color:#f2f2f2;">${v}</div>
            </div>`).join('')}
        </div>
        ${exportUrl ? `<div style="margin-top:16px;"><a href="${exportUrl}" target="_blank" style="display:inline-block;padding:10px 20px;background:#e8b339;color:#000;font-family:monospace;font-size:12px;font-weight:700;border-radius:4px;text-decoration:none;">⬇ 下载视频</a></div>` : ''}
      </div>

    </div>`;

  // Tab 切换（分镜 Tab 懒加载）
  const projectUuidForShots = window._currentProjectUuid || '';
  modal.querySelectorAll('.ep-modal-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      modal.querySelectorAll('.ep-modal-tab').forEach(t => {
        t.style.background = 'none';
        t.style.borderBottom = '2px solid transparent';
        t.style.color = '#5e5e66';
      });
      modal.querySelectorAll('.ep-modal-panel').forEach(p => p.style.display = 'none');
      tab.style.background = 'rgba(232,179,57,.06)';
      tab.style.borderBottom = '2px solid #e8b339';
      tab.style.color = '#e8b339';
      const panel = modal.querySelector(`.ep-modal-panel[data-panel="${tab.dataset.panel}"]`);
      panel.style.display = 'block';

      // 分镜 Tab：实时从 Giggle 拉取
      if (tab.dataset.panel === 'shots' && !panel.dataset.loaded) {
        panel.dataset.loaded = '1';
        const shotsBody = panel.querySelector('.shots-body');
        if (shotsBody) shotsBody.innerHTML = '<div style="color:#5e5e66;font-size:12px;">⠋ 加载分镜中...</div>';
        try {
          const r = await fetch(`/api/agent/projects/${projectUuidForShots}/shots?episode_no=${epNo}`);
          const j = await r.json();
          const list = j.data || [];
          if (!shotsBody) return;
          if (!list.length) { shotsBody.innerHTML = '<div style="color:#5e5e66;font-size:12px;">暂无分镜数据（生产后可见）</div>'; return; }
          shotsBody.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;">
              ${list.map(s => `
                <div style="border:1px solid #2a2a30;border-radius:4px;overflow:hidden;background:#111;">
                  ${s.signed_url || s.thumbnail_url ? `<img src="${s.signed_url || s.thumbnail_url}" style="width:100%;aspect-ratio:9/16;object-fit:cover;display:block;" loading="lazy" />` : `<div style="aspect-ratio:9/16;background:#1a1a1f;display:flex;align-items:center;justify-content:center;font-size:18px;">🎬</div>`}
                  <div style="padding:4px 6px;">
                    <div style="font-size:9px;color:#5e5e66;">SHOT ${s.shot_id || '-'}</div>
                    <div style="font-size:9px;color:${s.video_generating_status==='completed'?'#4ade80':s.video_generating_status==='failed'?'#f87171':'#e8b339'};">${s.video_generating_status || s.generating_status || 'pending'}</div>
                  </div>
                </div>`).join('')}
            </div>`;
        } catch(e) {
          if (shotsBody) shotsBody.innerHTML = `<div style="color:#f87171;font-size:12px;">加载失败: ${e.message}</div>`;
        }
      }
    });
  });

  modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.remove(); });
  document.addEventListener('keydown', function esc(ev) {
    if (ev.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc); }
  });
  document.body.appendChild(modal);
}

// 兼容旧调用
function showScriptModal(e, epNo) { showEpModal(e, epNo); }
