const form = document.querySelector('#form');
const promptEl = document.querySelector('#prompt');
const modelEl = document.querySelector('#model');
const seedsEl = document.querySelector('#seeds');
const submit = document.querySelector('#submit');
const statusEl = document.querySelector('#status');
const resultEl = document.querySelector('#result');
const historyEl = document.querySelector('#history');

function setStatus(html, cls = '') {
  statusEl.className = `card muted ${cls}`;
  statusEl.innerHTML = html;
}

function filesFrom(job) {
  const output = job?.output || job?.result?.output || job?.result || job;
  return output?.files || [];
}

function isFbxFile(file) {
  const label = String(file?.name || file?.url || '').split('?')[0].toLowerCase();
  return label.endsWith('.fbx');
}

function fileLinksFrom(job) {
  return filesFrom(job).filter(f => f.url).map(f => {
    const label = escapeHtml(f.name || f.url);
    const url = escapeHtml(f.url);
    const viewerButton = isFbxFile(f)
      ? ` <button class="inline-button" type="button" data-fbx-url="${url}" data-fbx-name="${label}">View animation</button>`
      : '';
    return `<li><a href="${url}" target="_blank" rel="noopener">${label}</a>${viewerButton}</li>`;
  }).join('');
}

function showResult(job) {
  resultEl.classList.remove('hidden');
  const links = fileLinksFrom(job);
  resultEl.innerHTML = `
    <h2 class="good">Done</h2>
    ${links ? `<ul>${links}</ul>` : '<p>No public file URLs were returned.</p>'}
    <details><summary>Raw response</summary><pre>${escapeHtml(JSON.stringify(job, null, 2))}</pre></details>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { body });
  return body;
}

async function loadHistory() {
  try {
    const body = await api('/api/history');
    const jobs = body.jobs || [];
    if (!jobs.length) { historyEl.textContent = 'No jobs yet.'; return; }
    historyEl.innerHTML = jobs.map(j => {
      const links = fileLinksFrom(j);
      const prompt = escapeHtml(j.prompt || '(prompt unavailable)');
      const status = escapeHtml(j.status || 'UNKNOWN');
      return `<article class="history-item"><div><strong>${status}</strong> <small>${escapeHtml(j.updatedAt || j.createdAt || '')}</small></div><p>${prompt}</p>${links ? `<ul>${links}</ul>` : `<button type="button" data-job="${escapeHtml(j.id)}">Refresh</button>`}</article>`;
    }).join('');
  } catch (err) {
    historyEl.innerHTML = `<span class="bad">Could not load history: ${escapeHtml(err.message)}</span>`;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-fbx-url]');
  if (!button) return;
  window.loadFbxViewer?.(button.dataset.fbxUrl, button.dataset.fbxName || 'Animation');
});

historyEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-job]');
  if (!button) return;
  button.disabled = true;
  try { await api(`/api/jobs/${encodeURIComponent(button.dataset.job)}`); await loadHistory(); }
  finally { button.disabled = false; }
});

async function poll(jobId) {
  let delay = 2500;
  for (;;) {
    const body = await api(`/api/jobs/${encodeURIComponent(jobId)}`);
    const state = body.status || body.state || 'UNKNOWN';
    setStatus(`<strong>Status:</strong> ${escapeHtml(state)}<br><small>Job ${escapeHtml(jobId)}</small>`);
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(state)) {
      if (state === 'COMPLETED') { showResult(body); await loadHistory(); }
      else {
        resultEl.classList.remove('hidden');
        resultEl.innerHTML = `<h2 class="bad">${escapeHtml(state)}</h2><pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre>`;
      }
      return;
    }
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay + 1000, 10000);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submit.disabled = true;
  resultEl.classList.add('hidden');
  setStatus('Submitting job to RunPod…');
  try {
    const body = await api('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: promptEl.value, model: modelEl.value, num_seeds: Number(seedsEl.value || 1) }),
    });
    const jobId = body.id || body.jobId;
    if (!jobId) throw Object.assign(new Error('RunPod did not return a job id.'), { body });
    setStatus(`<strong>Queued:</strong> ${escapeHtml(jobId)}<br><small>Cold starts can take a while.</small>`);
    await poll(jobId);
  } catch (err) {
    setStatus(`<span class="bad">${escapeHtml(err.message)}</span>`);
    resultEl.classList.remove('hidden');
    resultEl.innerHTML = `<pre>${escapeHtml(JSON.stringify(err.body || err, null, 2))}</pre>`;
  } finally {
    await loadHistory();
    submit.disabled = false;
  }
});

loadHistory();
setInterval(loadHistory, 30000);
