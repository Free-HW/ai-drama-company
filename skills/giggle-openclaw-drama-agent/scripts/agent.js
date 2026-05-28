const { poll } = require('./giggleClient');
const { getGlobalCharacterByName, saveGlobalCharacter } = require('./db');

function normStatus(v) {
  return String(v || '').trim().toLowerCase();
}

function isDone(v) {
  return ['completed', 'success', 'done', 'finished'].includes(normStatus(v));
}

function isFailed(v) {
  return ['failed', 'error', 'timeout', 'cancelled'].includes(normStatus(v));
}

class DramaAgent {
  constructor({ giggle, pollIntervalMs = 5000, pollTimeoutMs = 30 * 60 * 1000 }) {
    this.giggle = giggle;
    this.pollIntervalMs = pollIntervalMs;
    this.pollTimeoutMs = pollTimeoutMs;
  }

  async run(input, emit) {
    const out = { status: 'running', projectId: null, export: null, steps: [] };
    const { pollIntervalMs: interval, pollTimeoutMs: timeout } = this;

    // ── Step 1: 创建项目 ──
    emit('agent-a', 'AGENT-A', '[ScriptAgent] 创建项目...', 'script');
    const projectResp = await this.giggle.createProject({
      name: input.projectName || `AI短剧-${Date.now()}`,
      aspect: input.aspect || '9:16',
    });
    const projectId = projectResp.data?.project_id;
    if (!projectId) throw new Error('创建项目失败：未返回 project_id');
    out.projectId = projectId;
    emit('agent-a', 'AGENT-A', `[ScriptAgent] 项目已创建: ${projectId}`, 'script');

    // ── Step 2: 扩写剧本（传入 AI 生成的完整剧本） ──
    emit('agent-a', 'AGENT-A', '[ScriptAgent] 提交剧本扩写...', 'script');
    const storyTask = await this.giggle.storyExpansion({
      project_id: projectId,
      diy_story: input.idea,
      video_duration: String(input.videoDuration || 60),
      style_id: input.styleId || 145,
      aspect: input.aspect || '9:16',
      language: input.language || 'zh-CN',
    });
    const storyTaskId = storyTask.data?.task_id;
    if (!storyTaskId) throw new Error('扩写剧本失败：未返回 task_id');

    const storyDone = await poll({
      fn: () => this.giggle.getExpandedStory(storyTaskId),
      isDone: (r) => isDone(r.data?.status),
      isFailed: (r) => isFailed(r.data?.status),
      intervalMs: interval,
      timeoutMs: timeout,
      onTick: (r) => emit('agent-a', 'AGENT-A', `[ScriptAgent] 剧本扩写状态: ${r.data?.status || 'pending'}`, 'script'),
    });
    out.steps.push({ step: 'script.expand', taskId: storyTaskId, storyData: storyDone.data || {} });
    emit('agent-a', 'AGENT-A', '[ScriptAgent] 剧本扩写完成', 'script');

    // ── Step 3: 生成角色（含跨剧集一致性） ──
    emit('agent-b', 'AGENT-B', '[CastingAgent] 生成角色...', 'casting');
    await this.giggle.generateCharacters(projectId);

    const characterDone = await poll({
      fn: () => this.giggle.listCharacters(projectId),
      isDone: (r) => {
        const list = r.data?.character_list || [];
        return list.length > 0 && list.every((x) => isDone(x.generating_status));
      },
      isFailed: (r) => {
        const list = r.data?.character_list || [];
        return list.some((x) => isFailed(x.generating_status));
      },
      intervalMs: interval,
      timeoutMs: timeout,
      onTick: (r) => {
        const list = r.data?.character_list || [];
        const done = list.filter((x) => isDone(x.generating_status)).length;
        emit('agent-b', 'AGENT-B', `[CastingAgent] 角色生成中 ${done}/${list.length}`, 'casting');
      },
    });
    const characterList = characterDone.data?.character_list || [];

    // 角色一致性：与全局角色库对比，同名则替换，新角色则入库
    const db = input.db; // server.js 调用时传入
    if (db) {
      for (const c of characterList) {
        const existing = await getGlobalCharacterByName(db, c.name);
        if (existing && existing.giggle_asset_id) {
          // 同名角色：从角色库添加到本集项目
          emit('agent-b', 'AGENT-B', `[CastingAgent] 复用已有角色: ${c.name}`, 'casting');
          try {
            // library_character_id = EP1 存的 raw_json.parent_id
            let libraryCharacterId = 0;
            try {
              const raw = JSON.parse(existing.raw_json || '{}');
              // 优先用 upload 返回的角色库 ID，其次用原始 parent_id
              libraryCharacterId = raw._library?.id || raw._library?.parent_id || raw.parent_id || 0;
            } catch (_) {}
            const addBody = {
              project_id: projectId,
              parent_id: c.parent_id || 0,
              library_character_id: libraryCharacterId,
            };
            emit('agent-b', 'AGENT-B', `[CastingAgent] add_by_library请求: ${JSON.stringify(addBody)}`, 'casting');
            const addResp = await this.giggle.addCharacterByLibrary(addBody);
            emit('agent-b', 'AGENT-B', `[CastingAgent] add_by_library返回: ${JSON.stringify(addResp)}`, 'casting');
          } catch (e) {
            emit('agent-b', 'AGENT-B', `[CastingAgent] 角色替换失败 ${c.name}: ${e.message}`, 'casting');
          }
        } else {
          // 新角色：存入角色库和全局 DB
          emit('agent-b', 'AGENT-B', `[CastingAgent] 新角色入库: ${c.name}`, 'casting');
          try {
            const uploadBody = { name: c.name, gender: c.gender || '', category: '', age: '', asset_id: c.asset_id };
            emit('agent-b', 'AGENT-B', `[CastingAgent] upload请求: ${JSON.stringify(uploadBody)}`, 'casting');
            const uploadResp = await this.giggle.uploadCharacterToLibrary(uploadBody);
            emit('agent-b', 'AGENT-B', `[CastingAgent] upload返回: ${JSON.stringify(uploadResp)}`, 'casting');
            // 用角色库返回的 asset_id（library_asset_id），而非项目内的 asset_id
            const libraryAssetId = uploadResp?.data?.asset_id || uploadResp?.data?.id || c.asset_id;
            emit('agent-b', 'AGENT-B', `[CastingAgent] 角色入库成功: ${c.name} upload_data=${JSON.stringify(uploadResp?.data)}`, 'casting');
            // rawJson 存 upload 返回的 data（含 library_character_id/parent_id），供后续集 add_by_library 使用
            const libraryRawJson = uploadResp?.data ? { ...c, _library: uploadResp.data } : c;
            await saveGlobalCharacter(db, {
              projectUuid: input.storyProjectUuid,
              name: c.name,
              gender: c.gender || '',
              giggleCharacterId: c.id,
              giggleAssetId: libraryAssetId,
              rawJson: libraryRawJson,
            });
          } catch (e) {
            emit('agent-b', 'AGENT-B', `[CastingAgent] 角色入库失败 ${c.name}: ${e.message}`, 'casting');
          }
        }
      }
    }

    out.steps.push({ step: 'character.generate', count: characterList.length, characterList });
    emit('agent-b', 'AGENT-B', `[CastingAgent] 角色处理完成: ${characterList.length} 个`, 'casting');

    // ── Step 4: 生成分镜列表 ──
    emit('agent-c', 'AGENT-C', '[StoryboardAgent] 生成分镜列表...', 'storyboard');
    await this.giggle.autoGenerateStoryboard(projectId);
    await poll({
      fn: () => this.giggle.listShots(projectId),
      isDone: (r) => (r.data?.shot_list || []).length > 0,
      isFailed: () => false,
      intervalMs: interval,
      timeoutMs: 5 * 60 * 1000,
      onTick: (r) => {
        const n = (r.data?.shot_list || []).length;
        emit('agent-c', 'AGENT-C', `[StoryboardAgent] 分镜列表生成中... 当前 ${n} 条`, 'storyboard');
      },
    });
    emit('agent-c', 'AGENT-C', '[StoryboardAgent] 分镜列表就绪，开始生成分镜图...', 'storyboard');
    await this.giggle.autoGenerateImages(projectId, 'seedream45');

    const shotsDone = await poll({
      fn: () => this.giggle.listShots(projectId),
      isDone: (r) => {
        const list = r.data?.shot_list || [];
        return list.length > 0 && list.every((x) => isDone(x.generating_status));
      },
      isFailed: (r) => {
        const list = r.data?.shot_list || [];
        return list.some((x) => isFailed(x.generating_status));
      },
      intervalMs: interval,
      timeoutMs: timeout,
      onTick: (r) => {
        const list = r.data?.shot_list || [];
        const done = list.filter((x) => isDone(x.generating_status)).length;
        emit('agent-c', 'AGENT-C', `[StoryboardAgent] 分镜图生成中 ${done}/${list.length}`, 'storyboard');
      },
    });
    const shots = shotsDone.data?.shot_list || [];
    out.steps.push({ step: 'storyboard.image', shotCount: shots.length, shots });
    emit('agent-c', 'AGENT-C', `[StoryboardAgent] 分镜图完成: ${shots.length} 张`, 'storyboard');

    // ── Step 5: 优化视频提示词（异步，轮询 prompt_status=completed） ──
    emit('agent-c', 'AGENT-C', '[StoryboardAgent] 优化视频提示词...', 'storyboard');
    await this.giggle.optimizeVideoPrompts(projectId, 'seedance-2.0-pro');
    await poll({
      fn: () => this.giggle.listShots(projectId),
      isDone: (r) => {
        const list = r.data?.shot_list || [];
        return list.length > 0 && list.every((s) => s.prompt_status === 'completed');
      },
      isFailed: (r) => (r.data?.shot_list || []).some((s) => s.prompt_status === 'failed'),
      intervalMs: interval,
      timeoutMs: 5 * 60 * 1000,
      onTick: (r) => {
        const list = r.data?.shot_list || [];
        const done = list.filter((s) => s.prompt_status === 'completed').length;
        emit('agent-c', 'AGENT-C', `[StoryboardAgent] 提示词优化中 ${done}/${list.length}`, 'storyboard');
      },
    });
    emit('agent-c', 'AGENT-C', '[StoryboardAgent] 提示词优化完成', 'storyboard');

    // ── Step 6: 批量生成分镜视频 ──
    emit('agent-d', 'AGENT-D', '[VideoAgent] 生成分镜视频...', 'render');
    const shotIds = shots.map((s) => Number(s.id));
    await this.giggle.generateVideosForShots({
      project_id: projectId,
      model: 'seedance-2.0-pro',
      second_model: 'seedance-2.0-pro',
      shot_id: shotIds,
    });

    // 轮询视频生成状态，对 failed 的分镜自动重试一次
    let retried = false;
    await poll({
      fn: () => this.giggle.listShots(projectId),
      isDone: (r) => {
        const list = r.data?.shot_list || [];
        return list.length > 0 && list.every(
          (x) => isDone(x.video_generating_status) || x.video_generating_status === 'waiting'
        );
      },
      isFailed: () => false, // 不整体失败，单独重试
      intervalMs: interval,
      timeoutMs: timeout,
      onTick: async (r) => {
        const list = r.data?.shot_list || [];
        const done = list.filter((x) => isDone(x.video_generating_status)).length;
        const failed = list.filter((x) => isFailed(x.video_generating_status));
        emit('agent-d', 'AGENT-D', `[VideoAgent] 视频生成中 ${done}/${list.length}`, 'render');
        // Step 7: 对 failed 分镜重试
        if (failed.length > 0 && !retried) {
          retried = true;
          emit('agent-d', 'AGENT-D', `[VideoAgent] 重试 ${failed.length} 个失败分镜`, 'render');
          await this.giggle.generateVideosForShots({
            project_id: projectId,
            model: 'seedance-2.0-pro',
            second_model: 'seedance-2.0-pro',
            shot_id: failed.map((s) => Number(s.id)),
          });
        }
      },
    });
    out.steps.push({ step: 'video.generate', shotCount: shotIds.length });
    emit('agent-d', 'AGENT-D', '[VideoAgent] 分镜视频生成完成', 'render');

    // ── Step 8: 导出完整视频 ──
    emit('agent-e', 'AGENT-E', '[DistributionAgent] 导出完整视频...', 'distribute');
    await this.giggle.exportEntireFilm({ project_id: projectId });

    const exported = await poll({
      fn: () => this.giggle.getExportedAssets(projectId),
      isDone: (r) => {
        const asset = (r.data || []).find((p) => p.project_id === projectId);
        return asset && (Number(asset.progress || 0) >= 100 || isDone(asset.project_status));
      },
      isFailed: (r) => {
        const asset = (r.data || []).find((p) => p.project_id === projectId);
        return asset && isFailed(asset.project_status);
      },
      intervalMs: interval,
      timeoutMs: timeout,
      onTick: (r) => {
        const asset = (r.data || []).find((p) => p.project_id === projectId);
        emit('agent-e', 'AGENT-E', `[DistributionAgent] 导出进度: ${asset?.progress || 0}%`, 'distribute');
      },
    });

    const asset = (exported.data || []).find((p) => p.project_id === projectId) || {};
    out.export = {
      status: asset.project_status || 'completed',
      progress: asset.progress || 100,
      videoDownloadUrl: asset.video_download_url || '',
      videoSignedUrl: asset.video_signed_url || '',
      videoThumbnailUrl: asset.video_thumbnail_url || '',
      videoDuration: asset.video_duration || 0,
    };
    out.steps.push({ step: 'video.export', ...out.export });
    out.status = 'completed';
    emit('system', 'SYSTEM', `[完成] 视频已导出: ${out.export.videoSignedUrl}`, 'distribute');
    return out;
  }
}

module.exports = { DramaAgent };
