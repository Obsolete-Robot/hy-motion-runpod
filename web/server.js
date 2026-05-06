const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3017);
const ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || 'uytph7tbhb3j9q';
const API_KEY_FILE = process.env.RUNPOD_API_KEY_FILE || '/home/david/.config/runpod/api-key';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || '/srv/apps/hy-motion-web-data';
const HISTORY_FILE = path.join(DATA_DIR, 'jobs.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function readRunpodKey() {
  return fs.readFileSync(API_KEY_FILE, 'utf8').trim();
}

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; }
}

function saveHistory(items) {
  const tmp = HISTORY_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(items.slice(0, 100), null, 2));
  fs.renameSync(tmp, HISTORY_FILE);
}

function upsertJob(patch) {
  const items = loadHistory();
  const idx = items.findIndex(j => j.id === patch.id);
  const now = new Date().toISOString();
  if (idx >= 0) items[idx] = { ...items[idx], ...patch, updatedAt: now };
  else items.unshift({ createdAt: now, updatedAt: now, ...patch });
  saveHistory(items);
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (Buffer.byteLength(data) > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function runpodFetch(pathname, options = {}) {
  const key = readRunpodKey();
  const response = await fetch(`https://api.runpod.ai/v2/${ENDPOINT_ID}${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    const err = new Error(`RunPod ${response.status}`);
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function handleApi(req, res, url) {
  try {
    if (req.method === 'GET' && url.pathname === '/api/history') {
      return json(res, 200, { jobs: loadHistory() });
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      const body = await runpodFetch('/health', { method: 'GET', headers: { 'content-type': undefined } });
      return json(res, 200, { ok: true, endpointId: ENDPOINT_ID, runpod: body });
    }

    if (req.method === 'POST' && url.pathname === '/api/jobs') {
      const raw = await readBody(req);
      const input = JSON.parse(raw || '{}');
      const prompt = String(input.prompt || '').trim();
      if (!prompt) return json(res, 400, { error: 'Prompt is required.' });
      if (prompt.length > 1000) return json(res, 400, { error: 'Prompt is too long.' });

      const body = await runpodFetch('/run', {
        method: 'POST',
        body: JSON.stringify({
          input: {
            prompt,
            model: input.model || 'lite',
            num_seeds: Number(input.num_seeds || 1),
            timeout_seconds: Number(input.timeout_seconds || 900),
          },
          policy: {
            executionTimeout: Number(input.executionTimeout || 900000),
            ttl: Number(input.ttl || 3600000),
          },
        }),
      });
      const id = body.id || body.jobId;
      if (id) upsertJob({ id, prompt, model: input.model || 'lite', num_seeds: Number(input.num_seeds || 1), status: body.status || 'SUBMITTED', runpod: body });
      return json(res, 200, body);
    }

    const statusMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (req.method === 'GET' && statusMatch) {
      const jobId = encodeURIComponent(statusMatch[1]);
      const body = await runpodFetch(`/status/${jobId}`, { method: 'GET', headers: { 'content-type': undefined } });
      upsertJob({ id: statusMatch[1], status: body.status || body.state || 'UNKNOWN', result: body });
      return json(res, 200, body);
    }

    return json(res, 404, { error: 'Not found' });
  } catch (err) {
    return json(res, err.status || 500, {
      error: err.message || 'Server error',
      detail: err.body || undefined,
    });
  }
}

function serveStatic(req, res, url) {
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.normalize(filePath).replace(/^\.\.(\/|\\|$)/, '');
  const fullPath = path.join(PUBLIC_DIR, filePath);
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const ext = path.extname(fullPath);
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'content-type': `${types[ext] || 'application/octet-stream'}; charset=utf-8` });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  return serveStatic(req, res, url);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`HY-Motion web listening on http://127.0.0.1:${PORT}`);
});
