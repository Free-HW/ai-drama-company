const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class GiggleClient {
  constructor({ baseUrl, apiKey, authMode = 'x-auth' }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.authMode = authMode;
  }

  headers() {
    const base = { 'Content-Type': 'application/json' };
    if (!this.apiKey) return base;
    if (this.authMode === 'bearer') {
      base.Authorization = `Bearer ${this.apiKey}`;
    } else {
      base['x-auth'] = this.apiKey;
    }
    return base;
  }

  async request(method, path, { body, query } = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      });
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s 请求超时
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    const json = await res.json().catch(() => ({}));
    const code = json && Object.prototype.hasOwnProperty.call(json, 'code') ? String(json.code) : null;
    const codeOk = code === null || code === '0' || code === '200';
    if (!res.ok || !codeOk) {
      throw new Error(`Giggle API error (${method} ${path}): ${json.msg || res.statusText}`);
    }
    return json;
  }

  // 1. 创建项目
  createProject(input) {
    return this.request('POST', '/api/v1/project/create', {
      body: {
        name: input.name,
        type: 'short-film',
        aspect: input.aspect || '9:16',
        mode: 'professional',
      },
    });
  }

  // 2. 扩写剧本（异步）
  storyExpansion(input) {
    return this.request('POST', '/api/v1/script/storyExpansion', { body: input });
  }

  // 3. 查询剧本扩写结果
  getExpandedStory(taskId) {
    return this.request('GET', '/api/v1/script/getExpandedStory', { query: { task_id: taskId } });
  }

  // 4. 生成角色
  generateCharacters(projectId) {
    return this.request('POST', '/api/v1/character/generate', { body: { project_id: projectId } });
  }

  // 5. 获取角色列表
  listCharacters(projectId) {
    return this.request('GET', '/api/v1/character/list', { query: { project_id: projectId } });
  }

  // 6. 存储角色到角色库
  uploadCharacterToLibrary(input) {
    return this.request('POST', '/api/v1/character-library/upload-local-image', { body: input });
  }

  // 删除角色库中的角色（parent_id = library_character_id）
  deleteCharacterFromLibrary(libraryCharacterId) {
    return this.request('POST', '/api/v1/character-library/delete', {
      body: { parent_id: Number(libraryCharacterId) },
    });
  }

  // 7. 生成分镜列表
  autoGenerateStoryboard(projectId) {
    return this.request('POST', '/api/v1/storyboard-shots/auto-generate', {
      body: { project_id: projectId },
    });
  }

  // 7b. 生成全部分镜图
  autoGenerateImages(projectId, model = 'seedream45') {
    return this.request('POST', '/api/v1/storyboard-shots/auto-generate-image', {
      body: { project_id: projectId, model },
    });
  }

  // 8. 获取分镜列表（图/视频统一）
  listShots(projectId, shotId) {
    const query = { project_id: projectId };
    if (shotId) query.shot = shotId;
    return this.request('GET', '/api/v1/storyboard-shots/list', { query });
  }

  // 9. 一键优化视频提示词
  optimizeVideoPrompts(projectId, model = 'seedance-2.0-pro') {
    return this.request('POST', '/api/v1/storyboard-shots/optimize-prompt', {
      body: { project_id: projectId, model },
    });
  }

  // 10. 批量生成分镜视频
  generateVideosForShots(input) {
    return this.request('POST', '/api/v1/storyboard-shots/generate-video-for-shot', { body: input });
  }

  // 12. 导出完整视频（异步）
  exportEntireFilm(input) {
    return this.request('POST', '/api/v1/video-edit/export-entire-film', { body: input });
  }

  // 13. 获取导出视频结果
  getExportedAssets(projectId) {
    return this.request('GET', '/api/v1/project/my_assets', { query: { project_id: projectId } });
  }

  // 14. 从角色库添加角色到项目
  addCharacterByLibrary(input) {
    return this.request('POST', '/api/v1/character/add_by_library', { body: input });
  }

  // 15. 优化单个分镜视频提示词（异步）
  optimizePromptForShot(input) {
    return this.request('POST', '/api/v1/storyboard-shots/optimize-prompt-for-shot', { body: input });
  }

  // 16. 生成单个分镜图片（异步）
  generateImageForShot(input) {
    return this.request('POST', '/api/v1/storyboard-shots/generate-image', { body: input });
  }

  // 17. 获取图片生成模型列表
  getImageModelList(scene = 'Video', modelType = 'Img2Img') {
    return this.request('GET', '/api/v1/payment/model-list', { query: { scene, model_type: modelType } });
  }
}

async function poll({ fn, isDone, isFailed, intervalMs, timeoutMs, onTick }) {
  const start = Date.now();
  let fnErrCount = 0;
  while (Date.now() - start < timeoutMs) {
    let current;
    try {
      current = await fn();
      fnErrCount = 0; // 成功后重置计数
    } catch (e) {
      // 请求超时（AbortError）直接重试，不计入失败次数
      if (e.name === 'AbortError' || e.message?.includes('abort')) {
        await sleep(intervalMs);
        continue;
      }
      fnErrCount++;
      if (fnErrCount >= 3) throw e; // 连续 3 次非超时失败才真正抛出
      await sleep(intervalMs);
      continue;
    }
    if (onTick) onTick(current);
    if (isDone(current)) return current;
    if (isFailed && isFailed(current)) {
      const msg = current?.data?.err_msg || current?.msg || 'Task failed during polling.';
      throw new Error(msg);
    }
    await sleep(intervalMs);
  }
  throw new Error('Polling timeout reached.');
}

module.exports = { GiggleClient, poll };
