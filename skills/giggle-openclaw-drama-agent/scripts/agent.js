const { poll } = require('./giggleClient');
const { getGlobalCharacterByName, saveGlobalCharacter, upsertProjectCharacter, upsertCharacterMapping, setProjectId } = require('./db');

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

  // ── Phase 1: 创建项目 → 扩写剧本 → 生成角色 → 生成分镜图 ──
  // 完成后返回，供编排层决定何时启动 Phase 2
  async runPhase1(input, emit) {
    const out = { status: 'running', projectId: null, steps: [] };
    const { pollIntervalMs: interval, pollTimeoutMs: timeout } = this;

    // Step 1: 创建项目
    emit('agent-a', 'AGENT-A', '[ScriptAgent] 创建项目...', 'script');
    const projectResp = await this.giggle.createProject({
      name: input.projectName || `AI短剧-${Date.now()}`,
      aspect: input.aspect || '9:16',
    });
    const projectId = projectResp.data?.project_id;
    if (!projectId) throw new Error('创建项目失败：未返回 project_id');
    out.projectId = projectId;
    emit('agent-a', 'AGENT-A', `[ScriptAgent] 项目已创建: ${projectId}`, 'script');

    // 立即写入 giggle_project_id，防止后续步骤失败时丢失
    if (input.db && input.runId) {
      try { setProjectId(input.db, { runId: input.runId, projectId }); } catch (_) {}
    }
    if (input.db && input.storyProjectUuid && input.episodeNo) {
      try {
        input.db.prepare('UPDATE project_episodes SET giggle_project_id=?,updated_at=? WHERE project_uuid=? AND episode_no=?')
          .run(projectId, new Date().toISOString(), input.storyProjectUuid, input.episodeNo);
      } catch (_) {}
    }

    // Step 2: 扩写剧本
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

    await poll({
      fn: () => this.giggle.getExpandedStory(storyTaskId),
      isDone: (r) => isDone(r.data?.status),
      isFailed: (r) => isFailed(r.data?.status),
      intervalMs: interval,
      timeoutMs: timeout,
      onTick: (r) => emit('agent-a', 'AGENT-A', `[ScriptAgent] 剧本扩写状态: ${r.data?.status || 'pending'}`, 'script'),
    });
    out.steps.push({ step: 'script.expand', taskId: storyTaskId });
    emit('agent-a', 'AGENT-A', '[ScriptAgent] 剧本扩写完成', 'script');

    // Step 3: 生成角色（含跨剧集一致性）
    emit('agent-b', 'AGENT-B', '[CastingAgent] 生成角色...', 'casting');
    const genCharResp = await this.giggle.generateCharacters(projectId);
    emit('agent-b', 'AGENT-B', `[CastingAgent] generateCharacters 请求: projectId=${projectId} 响应: ${JSON.stringify(genCharResp?.data || genCharResp).slice(0, 200)}`, 'casting');

    // 先等一下让 Giggle 把角色数据准备好（generateCharacters 是异步触发）
    await new Promise(r => setTimeout(r, 3000));

    const characterDone = await poll({
      fn: () => this.giggle.listCharacters(projectId),
      isDone: (r) => {
        // data.status 表示整体生成状态
        const overallStatus = r.data?.status;
        if (overallStatus && isDone(overallStatus)) return true;
        if (overallStatus && isFailed(overallStatus)) return true;
        // 兜底：列表全部到终态也视为完成
        const list = r.data?.character_list || [];
        if (list.length === 0) return false; // 等 Giggle 把角色数据推进来
        return list.every((x) => isDone(x.generating_status) || isFailed(x.generating_status));
      },
      isFailed: () => false,
      intervalMs: interval,
      timeoutMs: timeout,
      onTick: (r) => {
        const list = r.data?.character_list || [];
        const overallStatus = r.data?.status || '';
        emit('agent-b', 'AGENT-B', `[CastingAgent] 角色生成中 ${list.filter((x) => isDone(x.generating_status)).length}/${list.length} (overall:${overallStatus})`, 'casting');
      },
    });
    const characterList = characterDone.data?.character_list || [];
    emit('agent-b', 'AGENT-B', `[CastingAgent] listCharacters 最终响应: count=${characterList.length} 数据: ${JSON.stringify(characterList.map(c=>({name:c.name,status:c.generating_status,asset:c.asset_id}))).slice(0,300)}`, 'casting');

    // 角色一致性处理：同名复用 story_characters 里的，新角色入库
    if (input.db && input.storyProjectUuid) {
      for (const c of characterList) {
        const existing = await getGlobalCharacterByName(input.db, c.name, input.storyProjectUuid);
        if (existing && existing.library_character_id) {
          // 同名角色：复用已有
          emit('agent-b', 'AGENT-B', `[CastingAgent] 复用已有角色: ${c.name} library_character_id=${existing.library_character_id}`, 'casting');
          try {
            const addResp = await this.giggle.addCharacterByLibrary({
              project_id: projectId,
              parent_id: c.parent_id || 0,
              library_character_id: existing.library_character_id,
            });
            emit('agent-b', 'AGENT-B', `[CastingAgent] add_by_library返回: ${JSON.stringify(addResp?.data || addResp)}`, 'casting');
          } catch (e) {
            emit('agent-b', 'AGENT-B', `[CastingAgent] 角色复用失败 ${c.name}: ${e.message}`, 'casting');
          }
        } else {
          // 新角色：upload 到角色库
          emit('agent-b', 'AGENT-B', `[CastingAgent] 新角色入库: ${c.name}`, 'casting');
          try {
            const uploadResp = await this.giggle.uploadCharacterToLibrary({
              name: c.name, gender: c.gender || '', category: '', age: '',
              asset_id: c.asset_id,
            });
            const libData = Array.isArray(uploadResp?.data) ? uploadResp.data[0] : uploadResp?.data;
            const libCharId = libData?.parent_id || libData?.id || 0;
            emit('agent-b', 'AGENT-B', `[CastingAgent] 角色入库成功: ${c.name} library_character_id=${libCharId}`, 'casting');
            await saveGlobalCharacter(input.db, {
              storyProjectUuid: input.storyProjectUuid,
              name: c.name,
              gender: c.gender || '',
              libraryCharacterId: libCharId,
              giggleAssetId: libData?.asset_id || c.asset_id || '',
            });
          } catch (e) {
            emit('agent-b', 'AGENT-B', `[CastingAgent] 角色入库失败 ${c.name}: ${e.message}`, 'casting');
          }
        }

        // 写入 project_characters
        const key = String(c.name || c.id || '').trim();
        if (!key) continue;
        try {
          await upsertProjectCharacter(input.db, {
            projectUuid: input.storyProjectUuid,
            characterKey: key,
            name: c.name || key,
            gender: c.gender || '',
            persona: c.prompt || '',
            visualPrompt: c.prompt || '',
            voicePref: c.voice_id || '',
          });
          await upsertCharacterMapping(input.db, {
            projectUuid: input.storyProjectUuid,
            projectCharacterKey: key,
            giggleCharacterId: c.id || '',
            giggleAssetId: c.asset_id || c.image_asset_id || '',
            rawJson: c,
          });
        } catch (_) {}
      }
    }
    out.steps.push({ step: 'character.generate', count: characterList.length });
    emit('agent-b', 'AGENT-B', `[CastingAgent] 角色处理完成: ${characterList.length} 个`, 'casting');

    // Step 4: 生成分镜列表 + 分镜图
    emit('agent-c', 'AGENT-C', '[StoryboardAgent] 生成分镜列表...', 'storyboard');
    await this.giggle.autoGenerateStoryboard(projectId);
    await poll({
      fn: () => this.giggle.listShots(projectId),
      isDone: (r) => (r.data?.shot_list || []).length > 0,
      isFailed: () => false,
      intervalMs: interval,
      timeoutMs: 20 * 60 * 1000,
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
      // 不整体失败，等全部完成（含失败）后在下面重试
      isFailed: () => false,
      intervalMs: interval,
      timeoutMs: timeout,
      onTick: (r) => {
        const list = r.data?.shot_list || [];
        const done = list.filter((x) => isDone(x.generating_status)).length;
        const failed = list.filter((x) => isFailed(x.generating_status)).length;
        emit('agent-c', 'AGENT-C', `[StoryboardAgent] 分镜图生成中 ${done}/${list.length}${failed ? ' (' + failed + ' 失败待重试)' : ''}`, 'storyboard');
      },
      // isDone 改为：所有分镜都到终态（完成或失败）才退出轮询
      isDone: (r) => {
        const list = r.data?.shot_list || [];
        return list.length > 0 && list.every((x) => isDone(x.generating_status) || isFailed(x.generating_status));
      },
    });
    let shots = shotsDone.data?.shot_list || [];

    // 失败分镜图重试
    const failedImages = shots.filter((x) => isFailed(x.generating_status));
    if (failedImages.length > 0) {
      emit('agent-c', 'AGENT-C', `[StoryboardAgent] ${failedImages.length} 张分镜图失败，重新生成`, 'storyboard');
      for (const shot of failedImages) {
        try {
          const imageList = (shot.reference_img_list || []).map((r) => r.asset_id).filter(Boolean);
          await this.giggle.generateImageForShot({
            project_id: projectId, parent_id: Number(shot.id),
            generate_type: 'Img2Img', image_list: imageList,
            prompt: shot.prompt || '', generating_count: 1, model: 'seedream45',
          });
          emit('agent-c', 'AGENT-C', `[StoryboardAgent] 重新生成分镜图 shot_id=${shot.id}`, 'storyboard');
        } catch (e) {
          emit('agent-c', 'AGENT-C', `[StoryboardAgent] 分镜图重试失败 shot_id=${shot.id}: ${e.message}`, 'storyboard');
        }
      }
      const retryIds = new Set(failedImages.map((s) => Number(s.id)));
      const retryDone = await poll({
        fn: () => this.giggle.listShots(projectId),
        isDone: (r) => {
          const list = (r.data?.shot_list || []).filter((s) => retryIds.has(Number(s.id)));
          return list.length > 0 && list.every((x) => isDone(x.generating_status));
        },
        isFailed: () => false,
        intervalMs: interval, timeoutMs: timeout,
        onTick: (r) => {
          const list = (r.data?.shot_list || []).filter((s) => retryIds.has(Number(s.id)));
          emit('agent-c', 'AGENT-C', `[StoryboardAgent] 分镜图重试进度 ${list.filter((x) => isDone(x.generating_status)).length}/${retryIds.size}`, 'storyboard');
        },
      });
      shots = retryDone.data?.shot_list || shots;
    }

    out.steps.push({ step: 'storyboard.image', shotCount: shots.length, shots });
    emit('agent-c', 'AGENT-C', `[StoryboardAgent] 分镜图完成: ${shots.length} 张`, 'storyboard');

    // 取第一个完成的分镜图作为集封面图，立即写入 DB
    const coverShot = shots.find(s => isDone(s.generating_status) && (s.thumbnail_url || s.signed_url));
    if (coverShot && input.db && input.storyProjectUuid && input.episodeNo) {
      const coverUrl = coverShot.thumbnail_url || coverShot.signed_url || '';
      try {
        input.db.prepare('UPDATE project_episodes SET cover_url=?,updated_at=? WHERE project_uuid=? AND episode_no=?')
          .run(coverUrl, new Date().toISOString(), input.storyProjectUuid, input.episodeNo);
        emit('agent-c', 'AGENT-C', `[StoryboardAgent] 封面图已更新: ${coverUrl.slice(0,60)}...`, 'storyboard');
      } catch (_) {}
    }

    out.status = 'phase1_completed';
    return out;
  }

  // ── Phase 2: 优化提示词 → 生成分镜视频 → 导出完整视频 ──
  // 接收 phase1Result（包含 projectId），shots 从 Giggle 实时拉取
  async runPhase2(input, emit, phase1Result) {
    const out = { status: 'running', steps: [] };
    const { pollIntervalMs: interval, pollTimeoutMs: timeout } = this;
    const projectId = phase1Result.projectId;
    // 实时拉取分镜列表（Giggle 已存储）
    const shotsResp = await this.giggle.listShots(projectId);
    const shots = shotsResp.data?.shot_list || [];

    // Step 5: 优化视频提示词
    emit('agent-c', 'AGENT-C', '[StoryboardAgent] 优化视频提示词...', 'storyboard');
    await this.giggle.optimizeVideoPrompts(projectId, 'seedance-2.0-pro');
    await poll({
      fn: () => this.giggle.listShots(projectId),
      isDone: (r) => (r.data?.shot_list || []).every((s) => s.prompt_status === 'completed'),
      isFailed: (r) => (r.data?.shot_list || []).some((s) => s.prompt_status === 'failed'),
      intervalMs: interval,
      timeoutMs: 20 * 60 * 1000,
      onTick: (r) => {
        const list = r.data?.shot_list || [];
        emit('agent-c', 'AGENT-C', `[StoryboardAgent] 提示词优化中 ${list.filter((s) => s.prompt_status === 'completed').length}/${list.length}`, 'storyboard');
      },
    });
    emit('agent-c', 'AGENT-C', '[StoryboardAgent] 提示词优化完成', 'storyboard');

    // Step 6: 批量生成分镜视频
    emit('agent-d', 'AGENT-D', '[VideoAgent] 生成分镜视频...', 'render');
    const shotIds = shots.map((s) => Number(s.id));
    await this.giggle.generateVideosForShots({
      project_id: projectId,
      model: 'seedance-2.0-pro',
      second_model: 'seedance-2.0-pro',
      shot_id: shotIds,
    });

    // 轮询视频生成，失败分镜重试
    let retried = false;
    let retryingIds = new Set();
    await poll({
      fn: () => this.giggle.listShots(projectId),
      isDone: (r) => {
        const list = r.data?.shot_list || [];
        if (list.length === 0) return false;
        const pending = list.filter((x) => !retryingIds.has(Number(x.id)));
        return pending.every((x) => isDone(x.video_generating_status) || isFailed(x.video_generating_status))
          && retryingIds.size === 0;
      },
      isFailed: () => false,
      intervalMs: interval,
      timeoutMs: timeout,
      onTick: async (r) => {
        const list = r.data?.shot_list || [];
        const done = list.filter((x) => isDone(x.video_generating_status)).length;
        const failed = list.filter((x) => isFailed(x.video_generating_status) && !retryingIds.has(Number(x.id)));
        emit('agent-d', 'AGENT-D', `[VideoAgent] 视频生成中 ${done}/${list.length}`, 'render');
        if (failed.length > 0 && !retried) {
          retried = true;
          failed.forEach((s) => retryingIds.add(Number(s.id)));
          emit('agent-d', 'AGENT-D', `[VideoAgent] 重试 ${failed.length} 个失败分镜，先优化提示词`, 'render');
          for (const shot of failed) {
            try {
              await this.giggle.optimizePromptForShot({ project_id: projectId, shot_id: Number(shot.id), model: 'seedance-2.0-pro' });
              emit('agent-d', 'AGENT-D', `[VideoAgent] 提示词优化中 shot_id=${shot.id}`, 'render');
            } catch (e) {
              emit('agent-d', 'AGENT-D', `[VideoAgent] 提示词优化触发失败 shot_id=${shot.id}: ${e.message}`, 'render');
            }
          }
          const failedIds = new Set(failed.map((s) => Number(s.id)));
          await poll({
            fn: () => this.giggle.listShots(projectId),
            isDone: (r) => (r.data?.shot_list || []).filter((s) => failedIds.has(Number(s.id))).every((s) => s.prompt_status === 'completed'),
            isFailed: () => false,
            intervalMs: 5000, timeoutMs: 20 * 60 * 1000,
            onTick: (r) => {
              const list = (r.data?.shot_list || []).filter((s) => failedIds.has(Number(s.id)));
              emit('agent-d', 'AGENT-D', `[VideoAgent] 提示词优化进度 ${list.filter((s) => s.prompt_status === 'completed').length}/${failedIds.size}`, 'render');
            },
          });
          emit('agent-d', 'AGENT-D', `[VideoAgent] 提示词优化完成，重新生成 ${failed.length} 个分镜视频`, 'render');
          await this.giggle.generateVideosForShots({
            project_id: projectId, model: 'seedance-2.0-pro', second_model: 'seedance-2.0-pro',
            shot_id: failed.map((s) => Number(s.id)),
          });
          await poll({
            fn: () => this.giggle.listShots(projectId),
            isDone: (r) => {
              const list = (r.data?.shot_list || []).filter((s) => retryingIds.has(Number(s.id)));
              return list.length > 0 && list.every((x) => isDone(x.video_generating_status) || isFailed(x.video_generating_status));
            },
            isFailed: () => false,
            intervalMs: interval, timeoutMs: timeout,
            onTick: (r) => {
              const list = (r.data?.shot_list || []).filter((s) => retryingIds.has(Number(s.id)));
              emit('agent-d', 'AGENT-D', `[VideoAgent] 重试分镜进度 ${list.filter((x) => isDone(x.video_generating_status)).length}/${retryingIds.size}`, 'render');
            },
          });
          retryingIds.clear();
        }
      },
    });
    out.steps.push({ step: 'video.generate', shotCount: shotIds.length });
    emit('agent-d', 'AGENT-D', '[VideoAgent] 分镜视频生成完成', 'render');

    // Step 7: 导出完整视频
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
    };
    out.steps.push({ step: 'video.export', ...out.export });
    out.status = 'completed';
    emit('system', 'SYSTEM', `[完成] 视频已导出: ${out.export.videoSignedUrl}`, 'distribute');
    return out;
  }

  // ── 统一入口（兼容旧的单集完整流程）──
  async run(input, emit) {
    const phase1 = await this.runPhase1(input, emit);
    const phase2 = await this.runPhase2(input, emit, phase1);
    return phase2;
  }
}

module.exports = { DramaAgent };
