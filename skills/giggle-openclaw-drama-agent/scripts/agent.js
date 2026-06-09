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
    emit('agent-b', 'AGENT-B', `[CastingAgent] generateCharacters 已触发`, 'casting');

    // 等 Giggle 把角色生成任务调度起来（generateCharacters 是异步触发，需要一定时间准备数据）
    emit('agent-b', 'AGENT-B', '[CastingAgent] 等待 Giggle 准备角色数据...', 'casting');
    await new Promise(r => setTimeout(r, 8000));

    // listCharacters 可能因 Giggle 内部错误返回 code:500，用安全包装防止 throw
    const safeListCharacters = async () => {
      try {
        return await this.giggle.listCharacters(projectId);
      } catch (e) {
        // Giggle 接口尚未就绪（如券20后我方即调），返回 pending 继续轮询
        emit('agent-b', 'AGENT-B', `[CastingAgent] listCharacters 暂时不可用(${e.message.slice(0,60)})，等待重试...`, 'casting');
        return { data: { status: 'pending', character_list: [] } };
      }
    };

    const characterDone = await poll({
      fn: safeListCharacters,
      isDone: (r) => {
        const overallStatus = r.data?.status;
        // 唯一可信的完成信号：data.status === 'success'（Giggle 官方标准）
        // 不能依赖 character_list 每项都 completed 作为提前退出条件
        // 因为 Giggle 可能先把列表推过来但 overall status 还在 running
        if (isDone(overallStatus)) return true;
        // Giggle 真正失败时跳过，避免无限等待
        if (isFailed(overallStatus)) return true;
        return false;
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
    const overallCharStatus = characterDone.data?.status || '';
    const characterList = characterDone.data?.character_list || [];
    if (isFailed(overallCharStatus)) {
      emit('agent-b', 'AGENT-B', `[CastingAgent] 角色生成失败 (overall:${overallCharStatus})，跳过角色步骤继续分镜`, 'casting');
    } else {
      emit('agent-b', 'AGENT-B', `[CastingAgent] 角色完成: count=${characterList.length}`, 'casting');
    }

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
            emit('agent-b', 'AGENT-B', `[CastingAgent] 角色复用成功: ${c.name}`, 'casting');
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
    const imgResp = await this.giggle.autoGenerateImages(projectId, 'seedream45');
    emit('agent-c', 'AGENT-C', `[StoryboardAgent] autoGenerateImages 已触发`, 'storyboard');
    // 等 Giggle 把图片生成任务调度起来（异步触发）
    await new Promise(r => setTimeout(r, 5000));

    const shotsDone = await poll({
      fn: () => this.giggle.listShots(projectId),
      isDone: (r) => {
        const overallStatus = r.data?.status;
        if (overallStatus && (isDone(overallStatus) || isFailed(overallStatus))) return true;
        const list = r.data?.shot_list || [];
        // 兜底：列表为空则等待，有内容则全部到终态才退出
        if (list.length === 0) return false;
        return list.every((x) => isDone(x.generating_status) || isFailed(x.generating_status));
      },
      isFailed: () => false,
      intervalMs: interval,
      timeoutMs: timeout,
      onTick: (r) => {
        const list = r.data?.shot_list || [];
        const overallStatus = r.data?.status || '';
        const done = list.filter((x) => isDone(x.generating_status)).length;
        const failed = list.filter((x) => isFailed(x.generating_status)).length;
        emit('agent-c', 'AGENT-C', `[StoryboardAgent] 分镜图生成中 ${done}/${list.length}${overallStatus ? '(' + overallStatus + ')' : ''}${failed ? ' (' + failed + ' 失败)' : ''}`, 'storyboard');
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
          // parent_id 是分镜逻辑ID，不是图片实例ID；无参考图时用 Txt2Img
          const genType = imageList.length > 0 ? 'Img2Img' : 'Txt2Img';
          const payload = {
            project_id: projectId,
            parent_id: Number(shot.parent_id || shot.id),
            generate_type: genType,
            prompt: shot.prompt || '',
            generating_count: 1,
            model: 'seedream45',
          };
          if (imageList.length > 0) payload.image_list = imageList;
          await this.giggle.generateImageForShot(payload);
          emit('agent-c', 'AGENT-C', `[StoryboardAgent] 重新生成分镜图 parent_id=${shot.parent_id || shot.id} type=${genType}`, 'storyboard');
        } catch (e) {
          emit('agent-c', 'AGENT-C', `[StoryboardAgent] 分镜图重试失败 shot_id=${shot.id}: ${e.message}`, 'storyboard');
        }
      }
      // 重试后 Giggle 会生成新的 shot 实例（新 id），不能用旧 id 过滤
      // 改为轮询全部 shot，等 data.status=success 或全部到终态
      const retryDone = await poll({
        fn: () => this.giggle.listShots(projectId),
        isDone: (r) => {
          const overallStatus = r.data?.status;
          if (overallStatus && isDone(overallStatus)) return true;
          const list = r.data?.shot_list || [];
          if (list.length === 0) return false;
          return list.every((x) => isDone(x.generating_status) || isFailed(x.generating_status));
        },
        isFailed: () => false,
        intervalMs: interval, timeoutMs: timeout,
        onTick: (r) => {
          const list = r.data?.shot_list || [];
          const overallStatus = r.data?.status || '';
          const done = list.filter((x) => isDone(x.generating_status)).length;
          const total = list.length;
          emit('agent-c', 'AGENT-C', `[StoryboardAgent] 分镜图重试进度 ${done}/${total}(overall:${overallStatus})`, 'storyboard');
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

    // Step 6: 批量生成分镜视频（含失败重试，最多 MAX_VIDEO_RETRY 轮）
    emit('agent-d', 'AGENT-D', '[VideoAgent] 生成分镜视频...', 'render');
    const shotIds = shots.map((s) => Number(s.id));
    await this.giggle.generateVideosForShots({
      project_id: projectId,
      model: 'seedance-2.0-pro',
      second_model: 'seedance-2.0-pro',
      shot_id: shotIds,
    });

    // 辅助：等所有 shot 的 video_generating_status 全部到终态
    const waitAllVideoTerminal = async (label) => {
      const result = await poll({
        fn: () => this.giggle.listShots(projectId),
        isDone: (r) => {
          const list = r.data?.shot_list || [];
          if (list.length === 0) return false;
          return list.every((x) => isDone(x.video_generating_status) || isFailed(x.video_generating_status));
        },
        isFailed: () => false,
        intervalMs: interval,
        timeoutMs: timeout,
        onTick: (r) => {
          const list = r.data?.shot_list || [];
          const done = list.filter((x) => isDone(x.video_generating_status)).length;
          const fail = list.filter((x) => isFailed(x.video_generating_status)).length;
          emit('agent-d', 'AGENT-D', `[VideoAgent] ${label} ${done}/${list.length}${fail ? ' (' + fail + ' 失败)' : ''}`, 'render');
        },
      });
      return result.data?.shot_list || [];
    };

    // 初次轮询等所有终态
    let finalShots = await waitAllVideoTerminal('视频生成中');

    // 失败重试循环（最多 3 轮，每轮：优化提示词 → 重新生成 → 等终态）
    const MAX_VIDEO_RETRY = 3;
    for (let retryRound = 1; retryRound <= MAX_VIDEO_RETRY; retryRound++) {
      const failedShots = finalShots.filter((x) => isFailed(x.video_generating_status));
      if (failedShots.length === 0) break; // 全部成功，退出重试循环

      emit('agent-d', 'AGENT-D', `[VideoAgent] 第 ${retryRound} 轮重试：${failedShots.length} 个失败分镜，先优化提示词`, 'render');

      // 1. 逐个优化失败分镜的提示词
      for (const shot of failedShots) {
        try {
          await this.giggle.optimizePromptForShot({ project_id: projectId, shot_id: Number(shot.id), model: 'seedance-2.0-pro' });
          emit('agent-d', 'AGENT-D', `[VideoAgent] 提示词优化中 shot_id=${shot.id}`, 'render');
        } catch (e) {
          emit('agent-d', 'AGENT-D', `[VideoAgent] 提示词优化触发失败 shot_id=${shot.id}: ${e.message}`, 'render');
        }
      }
      // 等提示词优化完成（按当前 id 过滤，此阶段 Giggle 不创建新实例）
      const failedIds = new Set(failedShots.map((s) => Number(s.id)));
      await poll({
        fn: () => this.giggle.listShots(projectId),
        isDone: (r) => {
          const list = (r.data?.shot_list || []).filter((s) => failedIds.has(Number(s.id)));
          return list.length > 0 && list.every((s) => s.prompt_status === 'completed' || s.prompt_status === 'failed');
        },
        isFailed: () => false,
        intervalMs: 5000, timeoutMs: 20 * 60 * 1000,
        onTick: (r) => {
          const list = (r.data?.shot_list || []).filter((s) => failedIds.has(Number(s.id)));
          emit('agent-d', 'AGENT-D', `[VideoAgent] 提示词优化进度 ${list.filter((s) => s.prompt_status === 'completed').length}/${failedIds.size}`, 'render');
        },
      });
      emit('agent-d', 'AGENT-D', `[VideoAgent] 提示词优化完成，重新生成 ${failedShots.length} 个分镜视频`, 'render');

      // 2. 重新提交视频生成（Giggle 会生成新实例，新 id）
      await this.giggle.generateVideosForShots({
        project_id: projectId, model: 'seedance-2.0-pro', second_model: 'seedance-2.0-pro',
        shot_id: failedShots.map((s) => Number(s.id)),
      });

      // 3. 等全部 shot 再次到终态（全量轮询，不依赖旧 id）
      finalShots = await waitAllVideoTerminal(`重试第 ${retryRound} 轮进度`);
    }

    // 最终检查：如果还有 failed 分镜，抛出异常阻止进入导出
    const stillFailed = finalShots.filter((x) => isFailed(x.video_generating_status));
    if (stillFailed.length > 0) {
      throw new Error(`${stillFailed.length} 个分镜视频经 ${MAX_VIDEO_RETRY} 轮重试仍然失败，停止导出`);
    }

    out.steps.push({ step: 'video.generate', shotCount: shotIds.length });
    emit('agent-d', 'AGENT-D', '[VideoAgent] 分镜视频全部生成完成', 'render');

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

  /**
   * 重试入口：根据集的状态决定从哪一步开始
   *   - 有 giggle_project_id，且 Giggle 上有 shot 数据 → 仅重跑视频+导出（最轻量）
   *   - 有 giggle_project_id，但 Giggle 上无 shot  → 从 Phase2 头部（优化提示词）开始
   *   - 无 giggle_project_id                       → 完整 Phase1+Phase2
   * 返回 phase2Result（与 runPhase2 格式一致）
   */
  async runRetry(input, emit) {
    const { pollIntervalMs: interval, pollTimeoutMs: timeout } = this;
    const giggleProjectId = input.giggleProjectId;

    if (!giggleProjectId) {
      // 无 Giggle project → 完整重跑
      emit('agent-a', 'AGENT-A', '[Retry] 无 Giggle project，从 Phase1 完整重跑', 'script');
      const phase1 = await this.runPhase1(input, emit);
      return await this.runPhase2(input, emit, phase1);
    }

    // 有 Giggle project，先查 shot 数据
    emit('agent-c', 'AGENT-C', `[Retry] 检查 Giggle project ${giggleProjectId} 的分镜状态...`, 'storyboard');
    const shotsResp = await this.giggle.listShots(giggleProjectId);
    const allShots = shotsResp.data?.shot_list || [];
    const hasVideoData = allShots.some(s => s.video_generating_status);
    const hasFailedVideo = allShots.some(s => isFailed(s.video_generating_status));
    const allVideoDone = allShots.length > 0 && allShots.every(s => isDone(s.video_generating_status));

    emit('agent-c', 'AGENT-C', `[Retry] shot总数=${allShots.length} hasVideoData=${hasVideoData} hasFailedVideo=${hasFailedVideo} allVideoDone=${allVideoDone}`, 'storyboard');

    if (allVideoDone) {
      // 视频全部完成，只需重跑导出
      emit('agent-e', 'AGENT-E', '[Retry] 视频已全部完成，仅重新导出', 'distribute');
      return await this._runExportOnly(giggleProjectId, input, emit);
    }

    if (hasFailedVideo || (hasVideoData && !allVideoDone)) {
      // 有视频失败或未完成 → 从视频重试+导出
      emit('agent-d', 'AGENT-D', '[Retry] 存在失败/未完成视频，从视频重试开始', 'render');
      return await this._runVideoRetryAndExport(giggleProjectId, allShots, input, emit);
    }

    // 有 shot 但无视频数据（分镜图完成，视频未开始） → 从 Phase2 头部
    if (allShots.length > 0) {
      emit('agent-c', 'AGENT-C', '[Retry] 分镜已就绪，从 Phase2 开始（优化提示词+视频+导出）', 'storyboard');
      return await this.runPhase2(input, emit, { projectId: giggleProjectId, steps: [] });
    }

    // shot 列表为空 → Phase1 已失败/未完成，完整重跑
    emit('agent-a', 'AGENT-A', '[Retry] 无分镜数据，完整重跑 Phase1+Phase2', 'script');
    const phase1 = await this.runPhase1(input, emit);
    return await this.runPhase2(input, emit, phase1);
  }

  // 仅重新导出（视频全部完成的场景）
  async _runExportOnly(projectId, input, emit) {
    const { pollIntervalMs: interval, pollTimeoutMs: timeout } = this;
    const out = { status: 'running', steps: [], projectId };
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
      intervalMs: interval, timeoutMs: timeout,
      onTick: (r) => {
        const asset = (r.data || []).find((p) => p.project_id === projectId);
        emit('agent-e', 'AGENT-E', `[DistributionAgent] 导出进度: ${asset?.progress || 0}%`, 'distribute');
      },
    });
    const asset = (exported.data || []).find((p) => p.project_id === projectId);
    const videoUrl = asset?.video_download_url || asset?.video_signed_url || '';
    out.export = { videoDownloadUrl: videoUrl, videoSignedUrl: videoUrl };
    emit('agent-e', 'AGENT-E', `[完成] 视频已导出: ${videoUrl}`, 'distribute');
    out.status = 'completed';
    return out;
  }

  // 视频重试+导出（有失败视频的场景）
  async _runVideoRetryAndExport(projectId, initialShots, input, emit) {
    const { pollIntervalMs: interval, pollTimeoutMs: timeout } = this;
    const out = { status: 'running', steps: [], projectId };

    const waitAllVideoTerminal = async (label) => {
      const result = await poll({
        fn: () => this.giggle.listShots(projectId),
        isDone: (r) => {
          const list = r.data?.shot_list || [];
          if (list.length === 0) return false;
          return list.every((x) => isDone(x.video_generating_status) || isFailed(x.video_generating_status));
        },
        isFailed: () => false,
        intervalMs: interval, timeoutMs: timeout,
        onTick: (r) => {
          const list = r.data?.shot_list || [];
          const done = list.filter((x) => isDone(x.video_generating_status)).length;
          const fail = list.filter((x) => isFailed(x.video_generating_status)).length;
          emit('agent-d', 'AGENT-D', `[VideoAgent] ${label} ${done}/${list.length}${fail ? ' (' + fail + ' 失败)' : ''}`, 'render');
        },
      });
      return result.data?.shot_list || [];
    };

    let finalShots = initialShots;
    // 确保初始状态全部到终态
    const allTerminal = finalShots.every(s => isDone(s.video_generating_status) || isFailed(s.video_generating_status));
    if (!allTerminal) {
      emit('agent-d', 'AGENT-D', '[VideoAgent] 等待当前视频生成结束...', 'render');
      finalShots = await waitAllVideoTerminal('视频生成中');
    }

    const MAX_VIDEO_RETRY = 3;
    for (let retryRound = 1; retryRound <= MAX_VIDEO_RETRY; retryRound++) {
      const failedShots = finalShots.filter((x) => isFailed(x.video_generating_status));
      if (failedShots.length === 0) break;

      emit('agent-d', 'AGENT-D', `[VideoAgent] 第 ${retryRound} 轮重试：${failedShots.length} 个失败分镜，先优化提示词`, 'render');

      for (const shot of failedShots) {
        try {
          await this.giggle.optimizePromptForShot({ project_id: projectId, shot_id: Number(shot.id), model: 'seedance-2.0-pro' });
          emit('agent-d', 'AGENT-D', `[VideoAgent] 提示词优化中 shot_id=${shot.id}`, 'render');
        } catch (e) {
          emit('agent-d', 'AGENT-D', `[VideoAgent] 提示词优化触发失败 shot_id=${shot.id}: ${e.message}`, 'render');
        }
      }
      const failedIds = new Set(failedShots.map((s) => Number(s.id)));
      await poll({
        fn: () => this.giggle.listShots(projectId),
        isDone: (r) => {
          const list = (r.data?.shot_list || []).filter((s) => failedIds.has(Number(s.id)));
          return list.length > 0 && list.every((s) => s.prompt_status === 'completed' || s.prompt_status === 'failed');
        },
        isFailed: () => false,
        intervalMs: 5000, timeoutMs: 20 * 60 * 1000,
        onTick: (r) => {
          const list = (r.data?.shot_list || []).filter((s) => failedIds.has(Number(s.id)));
          emit('agent-d', 'AGENT-D', `[VideoAgent] 提示词优化进度 ${list.filter((s) => s.prompt_status === 'completed').length}/${failedIds.size}`, 'render');
        },
      });
      emit('agent-d', 'AGENT-D', `[VideoAgent] 提示词优化完成，重新生成 ${failedShots.length} 个分镜视频`, 'render');

      await this.giggle.generateVideosForShots({
        project_id: projectId, model: 'seedance-2.0-pro', second_model: 'seedance-2.0-pro',
        shot_id: failedShots.map((s) => Number(s.id)),
      });

      finalShots = await waitAllVideoTerminal(`重试第 ${retryRound} 轮进度`);
    }

    const stillFailed = finalShots.filter((x) => isFailed(x.video_generating_status));
    if (stillFailed.length > 0) {
      throw new Error(`${stillFailed.length} 个分镜视频经 ${MAX_VIDEO_RETRY} 轮重试仍然失败，停止导出`);
    }

    emit('agent-d', 'AGENT-D', '[VideoAgent] 分镜视频全部生成完成', 'render');
    out.steps.push({ step: 'video.retry', shotCount: finalShots.length });

    // 导出
    return await this._runExportOnly(projectId, input, emit);
  }

  async run(input, emit) {
    const phase1 = await this.runPhase1(input, emit);
    const phase2 = await this.runPhase2(input, emit, phase1);
    return phase2;
  }
}

module.exports = { DramaAgent };
