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

    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await res.json().catch(() => ({}));
    const code = json && Object.prototype.hasOwnProperty.call(json, 'code') ? String(json.code) : null;
    const codeOk = code === null || code === '0' || code === '200';
    if (!res.ok || !codeOk) {
      throw new Error(`Giggle API error (${method} ${path}): ${json.msg || res.statusText}`);
    }
    return json;
  }

  createProject(input) {
    return this.request('POST', '/api/v1/project/create', { body: input });
  }

  storyExpansion(input) {
    return this.request('POST', '/api/v1/script/storyExpansion', { body: input });
  }

  getExpandedStory(taskId) {
    return this.request('GET', '/api/v1/script/getExpandedStory', { query: { task_id: taskId } });
  }

  generateCharacters(projectId) {
    return this.request('POST', '/api/v1/character/generate', { body: { project_id: projectId } });
  }

  listCharacters(projectId) {
    return this.request('GET', '/api/v1/character/list', { query: { project_id: projectId } });
  }

  autoGenerateStoryboard(projectId) {
    return this.request('POST', '/api/v1/storyboard/auto-generate', { body: { project_id: projectId } });
  }

  listStoryboard(projectId) {
    return this.request('GET', '/api/v1/storyboard/list', { query: { project_id: projectId } });
  }

  autoGenerateImages(projectId) {
    return this.request('POST', '/api/v1/storyboard/auto-generate-image', { body: { project_id: projectId } });
  }

  storyboardDetail(projectId, parentId) {
    return this.request('GET', '/api/v1/storyboard/detail', { query: { project_id: projectId, parent_id: parentId } });
  }

  autoGenerateVideos(input) {
    return this.request('POST', '/api/v1/storyboard/auto-generate-video', { body: input });
  }

  storyboardVideoDetail(projectId, parentId) {
    return this.request('GET', '/api/v1/storyboard/video-detail', { query: { project_id: projectId, parent_id: parentId } });
  }

  exportEntireFilm(input) {
    return this.request('POST', '/api/v1/video-edit/export-entire-film', { body: input });
  }

  myAssets() {
    return this.request('GET', '/api/v1/project/my_assets');
  }
}

async function poll({ fn, isDone, isFailed, intervalMs, timeoutMs, onTick }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const current = await fn();
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
