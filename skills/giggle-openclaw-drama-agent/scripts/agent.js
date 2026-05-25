const { poll } = require('./giggleClient');

function normStatus(v) {
  return String(v || '').trim().toLowerCase();
}

function isSuccessStatus(v) {
  const st = normStatus(v);
  return st === 'completed' || st === 'success' || st === 'done' || st === 'finished';
}

function isFailedStatus(v) {
  const st = normStatus(v);
  return st === 'failed' || st === 'error' || st === 'timeout' || st === 'cancelled';
}

class DramaAgent {
  constructor({ giggle, pollIntervalMs = 5000, pollTimeoutMs = 30 * 60 * 1000 }) {
    this.giggle = giggle;
    this.pollIntervalMs = pollIntervalMs;
    this.pollTimeoutMs = pollTimeoutMs;
  }

  async run(input, emit) {
    const out = { status: 'running', projectId: null, export: null, steps: [] };

    emit('system', 'SYSTEM', 'Pipeline started', 'script');

    emit('agent-a', 'AGENT-A', '[ScriptAgent] Creating project...', 'script');
    const projectResp = await this.giggle.createProject({
      name: input.projectName || `AI短剧-${Date.now()}`,
      type: 'director',
      aspect: input.aspect || '9:16',
    });
    const projectId = projectResp.data?.project_id;
    out.projectId = projectId;
    out.steps.push({ step: 'project.create', projectId });
    emit('agent-a', 'AGENT-A', `[ScriptAgent] Project created: ${projectId}`, 'script');

    emit('agent-a', 'AGENT-A', '[ScriptAgent] Expanding user story...', 'script');
    const storyTask = await this.giggle.storyExpansion({
      project_id: projectId,
      diy_story: input.idea,
      video_duration: String(input.videoDuration || 60),
      style_id: input.styleId || 1,
      aspect: input.aspect || '9:16',
      language: input.language || 'zh-CN',
    });
    const storyTaskId = storyTask.data?.task_id;

    const storyDone = await poll({
      fn: () => this.giggle.getExpandedStory(storyTaskId),
      isDone: (r) => isSuccessStatus(r.data?.status),
      isFailed: (r) => isFailedStatus(r.data?.status),
      intervalMs: this.pollIntervalMs,
      timeoutMs: this.pollTimeoutMs,
      onTick: (r) => emit('agent-a', 'AGENT-A', `[ScriptAgent] story status: ${r.data?.status || 'unknown'}`, 'script'),
    });
    out.steps.push({ step: 'script.expand', taskId: storyTaskId, status: storyDone.data?.status, storyData: storyDone.data || {} });
    emit('agent-a', 'AGENT-A', '[ScriptAgent] Script ready', 'script');

    emit('agent-b', 'AGENT-B', '[CastingAgent] Generating characters...', 'casting');
    await this.giggle.generateCharacters(projectId);
    const characterDone = await poll({
      fn: () => this.giggle.listCharacters(projectId),
      isDone: (r) => {
        const statusOk = isSuccessStatus(r.data?.status);
        const list = r.data?.character_list || [];
        const listOk = list.length > 0 && list.every((x) => isSuccessStatus(x.generating_status));
        return statusOk || listOk;
      },
      isFailed: (r) => {
        if (isFailedStatus(r.data?.status)) return true;
        const list = r.data?.character_list || [];
        return list.some((x) => isFailedStatus(x.generating_status));
      },
      intervalMs: this.pollIntervalMs,
      timeoutMs: this.pollTimeoutMs,
      onTick: (r) => emit('agent-b', 'AGENT-B', `[CastingAgent] status: ${r.data?.status || 'unknown'}`, 'casting'),
    });
    const characterList = characterDone.data?.character_list || [];
    out.steps.push({ step: 'character.generate', count: characterList.length, characterList });
    emit('agent-b', 'AGENT-B', `[CastingAgent] Completed: ${characterList.length} characters`, 'casting');

    emit('agent-c', 'AGENT-C', '[StoryboardAgent] Auto-generating shots...', 'storyboard');
    await this.giggle.autoGenerateStoryboard(projectId);
    const storyboardDone = await poll({
      fn: () => this.giggle.listStoryboard(projectId),
      isDone: (r) => {
        const statusOk = isSuccessStatus(r.data?.status);
        const shotsList = r.data?.shot_list || [];
        const shotsOk = shotsList.length > 0;
        return statusOk || shotsOk;
      },
      isFailed: (r) => {
        if (isFailedStatus(r.data?.status)) return true;
        const shotsList = r.data?.shot_list || [];
        return shotsList.some((x) => isFailedStatus(x.generating_status) || isFailedStatus(x.video_generating_status));
      },
      intervalMs: this.pollIntervalMs,
      timeoutMs: this.pollTimeoutMs,
      onTick: (r) => emit('agent-c', 'AGENT-C', `[StoryboardAgent] status: ${r.data?.status || 'unknown'}`, 'storyboard'),
    });
    const shots = storyboardDone.data?.shot_list || [];
    out.steps.push({ step: 'storyboard.generate', shotCount: shots.length, shots });
    emit('agent-c', 'AGENT-C', `[StoryboardAgent] Completed: ${shots.length} shots`, 'storyboard');

    emit('agent-c', 'AGENT-C', '[StoryboardAgent] Auto-generating shot images...', 'storyboard');
    await this.giggle.autoGenerateImages(projectId);
    const firstShotId = shots[0]?.id || shots[0]?.parent_id;
    if (firstShotId) {
      await poll({
        fn: () => this.giggle.storyboardDetail(projectId, firstShotId),
        isDone: (r) => {
          const list = r.data?.[0]?.img_list || [];
          return list.length > 0 && list.every((x) => isSuccessStatus(x.generating_status));
        },
        isFailed: (r) => (r.data?.[0]?.img_list || []).some((x) => isFailedStatus(x.generating_status)),
        intervalMs: this.pollIntervalMs,
        timeoutMs: this.pollTimeoutMs,
        onTick: () => emit('agent-c', 'AGENT-C', '[StoryboardAgent] image generation in progress...', 'storyboard'),
      });
    }
    out.steps.push({ step: 'storyboard.image.generate' });
    emit('agent-c', 'AGENT-C', '[StoryboardAgent] Images ready', 'storyboard');

    emit('agent-d', 'AGENT-D', '[VideoAgent] Auto-generating videos...', 'render');
    await this.giggle.autoGenerateVideos({
      project_id: projectId,
      model: input.videoModel || 'kling',
      duration: input.shotDuration || 5,
      generate_audio: true,
      second_model: input.secondModel || 'minimax',
    });

    if (firstShotId) {
      await poll({
        fn: () => this.giggle.storyboardVideoDetail(projectId, firstShotId),
        isDone: (r) => {
          const list = r.data?.[0]?.video_list || [];
          return list.length > 0 && list.every((x) => isSuccessStatus(x.generating_status));
        },
        isFailed: (r) => (r.data?.[0]?.video_list || []).some((x) => isFailedStatus(x.generating_status)),
        intervalMs: this.pollIntervalMs,
        timeoutMs: this.pollTimeoutMs,
        onTick: () => emit('agent-d', 'AGENT-D', '[VideoAgent] video generation in progress...', 'render'),
      });
    }
    out.steps.push({ step: 'video.generate' });
    emit('agent-d', 'AGENT-D', '[VideoAgent] Video clips ready', 'render');

    emit('agent-e', 'AGENT-E', '[DistributionAgent] Exporting final film...', 'distribute');
    const exportResp = await this.giggle.exportEntireFilm({
      project_id: projectId,
      subtitle_enabled: input.subtitleEnabled ?? true,
      bgm_volume: input.bgmVolume ?? 0.3,
    });

    const exported = await poll({
      fn: async () => {
        const r = await this.giggle.myAssets();
        const current = (r.data || []).find((p) => p.project_id === projectId);
        return current || {};
      },
      isDone: (r) => Number(r.progress || 0) >= 1 || isSuccessStatus(r.project_status),
      isFailed: (r) => isFailedStatus(r.project_status),
      intervalMs: this.pollIntervalMs,
      timeoutMs: this.pollTimeoutMs,
      onTick: (r) => emit('agent-e', 'AGENT-E', `[DistributionAgent] export progress: ${Math.round((r.progress || 0) * 100)}%`, 'distribute'),
    });

    out.export = {
      taskId: exportResp.data?.task_id,
      status: exported.project_status || 'completed',
      progress: exported.progress || 1,
      videoDownloadUrl: exported.video_download_url || '',
      videoSignedUrl: exported.video_signed_url || '',
      videoThumbnailUrl: exported.video_thumbnail_url || '',
    };
    out.steps.push({ step: 'video.export', ...out.export });

    out.status = 'completed';
    emit('system', 'SYSTEM', '[Pipeline complete] Final video generated', 'distribute');
    return out;
  }
}

module.exports = { DramaAgent };
