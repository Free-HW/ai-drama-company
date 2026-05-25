(function () {
  const style = document.createElement('style');
  style.textContent = `
    .oclaw-panel { margin: 14px 0 18px; border: 1px solid var(--line); background: var(--bg-1); padding: 12px; }
    .oclaw-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .oclaw-input { flex: 1; min-width: 320px; background: #0c0c10; color: var(--text); border: 1px solid var(--line-2); padding: 10px 12px; font-family: var(--sans); }
    .oclaw-btn { background: var(--gold); color: #000; border: none; padding: 10px 14px; font-family: var(--mono); font-size: 12px; cursor: pointer; }
    .oclaw-btn:disabled { opacity: .5; cursor: not-allowed; }
    .oclaw-tip { margin-top: 8px; color: var(--text-3); font-family: var(--mono); font-size: 11px; }
    .oclaw-db { margin-top: 10px; border: 1px dashed var(--line-2); padding: 10px; font-family: var(--mono); font-size: 11px; color: var(--text-2); }
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

  function appendLine(tagClass, tagText, payload, stage) {
    if (!termLog || !termBody) return;
    setStage(stage || 'script');
    const line = document.createElement('div');
    line.className = 'log-line';
    const tag = document.createElement('span');
    tag.className = 'log-tag ' + tagClass;
    tag.textContent = tagText;
    const text = document.createElement('span');
    text.className = 'log-text';
    text.textContent = String(payload || '');
    line.appendChild(tag);
    line.appendChild(text);
    termLog.appendChild(line);
    termBody.scrollTop = termBody.scrollHeight;
  }

  function projectStatusLabel(p) {
    if (p.status === 'completed') return 'COMPLETED';
    if (p.status === 'failed') return 'FAILED';
    return 'RUNNING';
  }

  function storyStatusLabel(p) {
    if (p.status === 'completed') return 'COMPLETED';
    if (p.status === 'partial_failed' || p.status === 'failed') return 'FAILED';
    if (p.status === 'planned' || p.status === 'draft') return 'PLANNED';
    return 'RUNNING';
  }

  async function pollRunStatus(runId, tip, runBtn) {
    activeRunId = runId;
    lastLogId = 0;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (!activeRunId) return;
      try {
        const sResp = await fetch(`/api/agent/status/${activeRunId}?since_id=${lastLogId}`);
        const sJson = await sResp.json();
        if (!sResp.ok || !sJson.ok) throw new Error(sJson.error || 'status query failed');

        (sJson.logs || []).forEach((l) => {
          appendLine(l.tagClass, l.tagText, l.payload, l.stage);
          lastLogId = Math.max(lastLogId, Number(l.id || 0));
        });

        if (sJson.run?.status === 'completed' || sJson.run?.status === 'failed') {
          if (tip) tip.textContent = sJson.run.status === 'completed' ? '当前分集执行完成。' : '当前分集执行失败，请看日志。';
          clearInterval(pollTimer);
          pollTimer = null;
          activeRunId = null;
          if (runBtn) runBtn.disabled = false;
          await refreshStoryWorkspace();
        }
      } catch (e) {
        appendLine('system', 'SYSTEM', `状态轮询失败: ${e.message}`, 'distribute');
        if (tip) tip.textContent = '状态同步失败，请检查服务日志。';
        clearInterval(pollTimer);
        pollTimer = null;
        activeRunId = null;
        if (runBtn) runBtn.disabled = false;
      }
    }, 1500);
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
      ${cards || '<div class="agent-card idle"><div class="agent-task">暂无项目数据</div></div>'}
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

    // 如果项目正在生成剧本，显示等待状态并轮询
    if (data.project?.status === 'generating' && eps.length === 0) {
      wall.innerHTML = `<div class="agent-card idle" style="grid-column:1/-1;text-align:center;padding:40px;">
        <div class="agent-task" style="font-size:14px;">⏳ AI 正在生成剧本，请稍候...</div>
        <div style="margin-top:8px;font-size:11px;opacity:.5;">通常需要 30-60 秒</div>
      </div>`;
      setTimeout(() => renderStoryEpisodes(projectUuid), 5000);
      return;
    }

    wall.innerHTML = eps.map((ep, idx) => {
      const st = ep.status === 'completed'
        ? { cls: 'published', label: 'COMPLETED', pct: 100 }
        : ep.status === 'running'
          ? { cls: 'rendering', label: 'RUNNING', pct: 55 }
          : ep.status === 'failed' || ep.status === 'partial_failed'
            ? { cls: 'queued', label: 'FAILED', pct: 10 }
            : { cls: 'queued', label: 'PLANNED', pct: 8 };
      const preview = (ep.script_text || ep.outline || '').slice(0, 90);
      return `
        <div class="ep ep${(idx % 6) + 1}" data-ep-no="${ep.episode_no}" style="cursor:pointer;" title="点击查看完整剧本">
          <div class="ep-thumb">
            <span class="ep-status ${st.cls}">${st.label}</span>
            <div class="ep-thumb-text">EP${ep.episode_no} · ${data.project?.name || ''}</div>
          </div>
          <div class="ep-info">
            <div class="ep-show">${ep.title || `第${ep.episode_no}集`}</div>
            <div class="ep-title" style="cursor:pointer;text-decoration:underline dotted;opacity:.8;" onclick="showScriptModal(event,${ep.episode_no})">${preview}…</div>
            <div class="ep-bar"><span style="width:${st.pct}%;"></span></div>
            <div class="ep-meta"><span>${ep.status || '-'}</span><span>${ep.giggle_project_id || '-'}</span></div>
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button onclick="showScriptModal(event,${ep.episode_no})" class="oclaw-btn" style="flex:1;font-size:11px;background:rgba(232,179,57,.15);border-color:rgba(232,179,57,.4);">📄 查看剧本</button>
              <button id="run-ep-${ep.episode_no}" class="oclaw-btn" style="flex:1;font-size:11px;">▶ 生产</button>
            </div>
          </div>
        </div>
      `;
    }).join('') || '<div class="agent-card idle" style="grid-column:1/-1;"><div class="agent-task">该项目暂无分集数据</div></div>';

    // Store episodes data for modal access
    window._currentEpisodes = eps;
    window._currentProjectName = data.project?.name || '';

    eps.forEach((ep) => {
      const btn = document.getElementById(`run-ep-${ep.episode_no}`);
      if (!btn) return;
      btn.disabled = ep.status === 'running';
      btn.addEventListener('click', (e) => { e.stopPropagation(); runEpisode(projectUuid, ep.episode_no); });
    });
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
          const sJson = await sResp.json();
          if (!sResp.ok || !sJson.ok) throw new Error(sJson.error || 'status query failed');

          (sJson.logs || []).forEach((l) => {
            appendLine(l.tagClass, l.tagText, l.payload, l.stage);
            lastLogId = Math.max(lastLogId, Number(l.id || 0));
          });

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
      <div class="oclaw-tip" id="oclawTip">左侧项目列表 · 中间分集生产按钮 · 映射关系展示在下方</div>
      <div class="oclaw-db" id="oclawDb">本地数据库快照: 暂无数据</div>
    `;
    terminalHeader.insertAdjacentElement('afterend', panel);

    const runBtn = document.getElementById('oclawRun');
    const refreshBtn = document.getElementById('oclawRefresh');
    if (runBtn) runBtn.addEventListener('click', createStoryProjectFromInput);
    if (refreshBtn) refreshBtn.addEventListener('click', refreshStoryWorkspace);
    refreshStoryWorkspace();
  }

  loadX2CShowcase();
})();


// ── 剧本弹窗 ──────────────────────────────────────────────
function showScriptModal(e, epNo) {
  if (e) e.stopPropagation();
  const eps = window._currentEpisodes || [];
  const ep = eps.find((x) => x.episode_no === epNo);
  if (!ep) return;

  let modal = document.getElementById('scriptModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'scriptModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div style="background:#111;border:1px solid rgba(232,179,57,.3);border-radius:12px;max-width:720px;width:100%;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.08);">
          <div id="scriptModalTitle" style="font-size:15px;font-weight:700;color:#e8b339;"></div>
          <button onclick="document.getElementById('scriptModal').remove()" style="background:none;border:1px solid rgba(255,255,255,.2);color:#fff;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:13px;">✕ 关闭</button>
        </div>
        <div id="scriptModalBody" style="padding:20px;overflow-y:auto;flex:1;font-size:13px;line-height:1.8;color:#ccc;white-space:pre-wrap;font-family:monospace;"></div>
      </div>`;
    modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  document.getElementById('scriptModalTitle').textContent = `${window._currentProjectName || ''} · ${ep.title || `第${epNo}集`}`;
  document.getElementById('scriptModalBody').textContent = ep.script_text || ep.outline || '（暂无剧本内容）';
}
