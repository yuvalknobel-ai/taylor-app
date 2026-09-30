// localdb.js — local-first data layer for Taylor.
//
// Everything this app stores lives in the browser's IndexedDB. There is no
// server, no account, no sync. This file does two things:
//
//   1. A tiny promise-based IndexedDB wrapper (DB.get/put/delete/all).
//   2. A `window.fetch` override that intercepts every `/api/...` call the
//      existing pages already make and answers it from IndexedDB instead of
//      the network — so every page's Alpine.js code runs completely
//      unmodified.
//
// Load this script FIRST, before sidebar.js / auth.js / demo.js / any page
// script, on every page.
(function () {
  'use strict';

  // ── IndexedDB wrapper ───────────────────────────────────────────────────
  const DB_NAME = 'taylor_local';
  const DB_VERSION = 1;
  const STORES = ['applications', 'categories', 'tasks', 'files', 'meta'];
  let _dbPromise = null;

  function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function tx(store, mode) {
    return openDb().then(db => db.transaction(store, mode).objectStore(store));
  }

  const DB = {
    async all(store) {
      const os = await tx(store, 'readonly');
      return new Promise((resolve, reject) => {
        const req = os.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async get(store, id) {
      const os = await tx(store, 'readonly');
      return new Promise((resolve, reject) => {
        const req = os.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },
    async put(store, obj) {
      const os = await tx(store, 'readwrite');
      return new Promise((resolve, reject) => {
        const req = os.put(obj);
        req.onsuccess = () => resolve(obj);
        req.onerror = () => reject(req.error);
      });
    },
    async delete(store, id) {
      const os = await tx(store, 'readwrite');
      return new Promise((resolve, reject) => {
        const req = os.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    },
  };

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  function nowIso() { return new Date().toISOString(); }

  // ── File blobs (CVs) ────────────────────────────────────────────────────
  // output_cv_path on an application is a virtual marker "local-file:<id>".
  // resolveApp() swaps that marker for a live blob: URL just before handing
  // the record to the page, so every existing <a :href="app.output_cv_path">
  // and iframe src keeps working with zero page-side changes.
  async function storeFile(file) {
    const id = uuid();
    await DB.put('files', { id, filename: file.name || 'cv.pdf', type: file.type || 'application/pdf', blob: file });
    return id;
  }
  async function resolveApp(app) {
    if (!app) return app;
    const out = { ...app };
    if (out.output_cv_path && out.output_cv_path.startsWith('local-file:')) {
      const fileId = out.output_cv_path.slice('local-file:'.length);
      const rec = await DB.get('files', fileId);
      out.output_cv_path = rec ? URL.createObjectURL(rec.blob) : null;
    }
    return out;
  }
  async function resolveApps(apps) { return Promise.all(apps.map(resolveApp)); }

  // ── Small helpers mirroring the old backend's filters ──────────────────
  const isActiveSaved = a => (a.saved === 1 || a.saved === undefined || a.saved === null) && !a.archived;
  const notArchived = a => !a.archived;

  async function nextCategoryColor() {
    const CATEGORY_COLORS = ['#60a5fa', '#a78bfa', '#f59ab0', '#f5a072', '#f5d47a', '#67e8f9', '#7dc4a0', '#f5a86a'];
    const cats = await DB.all('categories');
    return CATEGORY_COLORS[cats.length % CATEGORY_COLORS.length];
  }

  // ── Route table ──────────────────────────────────────────────────────────
  // Each entry: [method, RegExp matching pathname, async handler(match, body, url)]
  // handler returns a plain JS value (serialized as JSON) or {__status: n, ...}
  // to signal a non-200 response.
  function jsonResponse(data, status) {
    status = status || 200;
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function parseBody(init) {
    if (!init || !init.body) return {};
    if (typeof init.body === 'string') {
      try { return JSON.parse(init.body); } catch (e) { return {}; }
    }
    return {};
  }

  const routes = [];
  function route(method, pattern, handler) {
    routes.push({ method, re: new RegExp('^' + pattern + '$'), handler });
  }

  // ── Auth / config (no real accounts — a single local profile) ──────────
  route('GET', '/api/config', async () => ({
    is_demo: false,
    display_name: 'You',
    generator_enabled: false,
    ai_features_enabled: false,
  }));

  route('GET', '/api/auth/me', async () => {
    const meta = (await DB.get('meta', 'profile')) || { id: 'local-me', name: '', target_role: '' };
    return { id: 'local-me', name: meta.name || '', target_role: meta.target_role || '', is_guest: false };
  });
  route('PATCH', '/api/auth/profile', async (m, body) => {
    const meta = { id: 'profile', name: body.name || '', target_role: body.target_role || '' };
    await DB.put('meta', meta);
    return { id: 'local-me', name: meta.name, target_role: meta.target_role, is_guest: false };
  });
  route('POST', '/api/auth/logout', async () => ({ ok: true }));

  // ── Usage (AI is always off locally) ─────────────────────────────────────
  route('GET', '/api/usage', async () => ({
    calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, cost_display: '$0.000',
  }));
  route('POST', '/api/usage/reset', async () => ({ ok: true }));

  // ── Applications: list views ─────────────────────────────────────────────
  route('GET', '/api/history', async () => {
    const apps = (await DB.all('applications')).filter(isActiveSaved)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return resolveApps(apps.map(a => ({ ...a, category_ids: a.category_ids || [] })));
  });

  route('GET', '/api/applications/archived', async () => {
    const apps = (await DB.all('applications')).filter(a => a.archived)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return resolveApps(apps.map(a => ({ ...a, category_ids: a.category_ids || [] })));
  });

  route('GET', '/api/interviewing', async () => {
    const apps = (await DB.all('applications'))
      .filter(a => ['interviewing', 'offer'].includes(a.app_status) && isActiveSaved(a))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (b.created_at || '').localeCompare(a.created_at || ''));
    const resolved = await resolveApps(apps);
    return resolved.map(a => ({ ...a, steps: a.steps || [], jd_summary: null, company_brief: null }));
  });

  route('GET', '/api/sidebar', async () => {
    const cats = (await DB.all('categories')).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const apps = (await DB.all('applications')).filter(isActiveSaved);
    const result = [];
    for (const cat of cats) {
      const catApps = apps.filter(a => (a.category_ids || []).includes(cat.id))
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      result.push({ ...cat, applications: await resolveApps(catApps) });
    }
    const uncategorised = apps.filter(a => (!a.category_ids || a.category_ids.length === 0) && a.output_cv_path)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return { categories: result, uncategorised: await resolveApps(uncategorised) };
  });

  // ── Applications: mutations ──────────────────────────────────────────────
  route('POST', '/api/applications/manual', async (m, body) => {
    const allowed = new Set(['generated', 'sent', 'interviewing', 'rejected', 'offer']);
    const status = allowed.has(body.app_status) ? body.app_status : 'interviewing';
    const app = {
      id: uuid(),
      company_name: body.company_name || null,
      job_title: body.job_title || null,
      app_status: status,
      notes: body.notes || null,
      referral_name: body.referral_name || null,
      process_notes: null,
      interview_stage: null,
      salary_asked: null,
      rejection_reason: null,
      flags: null,
      output_cv_path: null,
      saved: 1,
      archived: 0,
      sort_order: 0,
      category_ids: [],
      steps: [],
      created_at: nowIso(),
    };
    await DB.put('applications', app);
    return { ...app, steps: [], jd_summary: null, company_brief: null };
  });

  route('POST', '/api/applications/upload-finished', async (m, body, url, init) => {
    const fd = init.body; // FormData
    const file = fd.get('cv_file');
    const fileId = await storeFile(file);
    const app = {
      id: uuid(),
      company_name: fd.get('company_name') || null,
      job_title: fd.get('job_title') || null,
      app_status: fd.get('app_status') || 'generated',
      notes: fd.get('notes') || null,
      referral_name: fd.get('referral_name') || null,
      process_notes: null,
      interview_stage: null,
      salary_asked: null,
      rejection_reason: null,
      flags: null,
      output_cv_path: 'local-file:' + fileId,
      saved: 1,
      archived: 0,
      sort_order: 0,
      category_ids: [],
      steps: [],
      created_at: nowIso(),
    };
    await DB.put('applications', app);
    return { ok: true, application_id: app.id, filename: file.name || 'cv.pdf' };
  });

  route('POST', '/api/applications/[^/]+/replace-cv', async (m, body, url, init) => {
    const appId = url.pathname.split('/')[3];
    const app = await DB.get('applications', appId);
    if (!app) return { __status: 404, detail: 'Application not found' };
    const fd = init.body;
    const file = fd.get('cv_file');
    const fileId = await storeFile(file);
    app.output_cv_path = 'local-file:' + fileId;
    await DB.put('applications', app);
    const resolved = await resolveApp(app);
    return { ok: true, output_cv_path: resolved.output_cv_path };
  });

  route('PATCH', '/api/applications/[^/]+/status', async (m, body, url) => {
    const appId = url.pathname.split('/')[3];
    const app = await DB.get('applications', appId);
    if (!app) return { __status: 404, detail: 'Application not found' };
    app.app_status = body.status;
    await DB.put('applications', app);
    return { ok: true };
  });

  route('PATCH', '/api/applications/[^/]+/details', async (m, body, url) => {
    const appId = url.pathname.split('/')[3];
    const app = await DB.get('applications', appId);
    if (!app) return { __status: 404, detail: 'Application not found' };
    const allowed = ['referral_name', 'salary_asked', 'company_name', 'job_title', 'created_at', 'interview_stage', 'notes', 'flags', 'rejection_reason'];
    for (const f of allowed) if (f in body) app[f] = body[f];
    await DB.put('applications', app);
    return { ok: true };
  });

  route('PATCH', '/api/applications/[^/]+/process-notes', async (m, body, url) => {
    const appId = url.pathname.split('/')[3];
    const app = await DB.get('applications', appId);
    if (!app) return { __status: 404, detail: 'Application not found' };
    app.process_notes = body.notes || '';
    await DB.put('applications', app);
    return { ok: true };
  });

  route('POST', '/api/applications/reorder', async (m, body) => {
    const ids = body.ids || [];
    for (let i = 0; i < ids.length; i++) {
      const app = await DB.get('applications', ids[i]);
      if (app) { app.sort_order = i; await DB.put('applications', app); }
    }
    return { ok: true };
  });

  route('DELETE', '/api/applications/[^/]+/permanent', async (m, body, url) => {
    const appId = url.pathname.split('/')[3];
    await DB.delete('applications', appId);
    return { ok: true };
  });

  route('POST', '/api/applications/[^/]+/restore', async (m, body, url) => {
    const appId = url.pathname.split('/')[3];
    const app = await DB.get('applications', appId);
    if (!app) return { __status: 404, detail: 'Application not found' };
    app.archived = 0;
    await DB.put('applications', app);
    return { ok: true };
  });

  route('DELETE', '/api/applications/[^/]+', async (m, body, url) => {
    const appId = url.pathname.split('/')[3];
    const app = await DB.get('applications', appId);
    if (!app) return { __status: 404, detail: 'Application not found' };
    app.archived = 1;
    await DB.put('applications', app);
    return { ok: true };
  });

  // ── Interview prep — AI is always off locally ────────────────────────────
  route('POST', '/api/applications/[^/]+/interview-prep', async () => ({
    __status: 404, detail: 'AI features are disabled on this instance',
  }));

  // ── Application categories ───────────────────────────────────────────────
  route('POST', '/api/applications/[^/]+/categories', async (m, body, url) => {
    const appId = url.pathname.split('/')[3];
    const app = await DB.get('applications', appId);
    if (!app) return { __status: 404, detail: 'Application not found' };
    app.category_ids = app.category_ids || [];
    if ('category_id' in body) {
      if (!app.category_ids.includes(body.category_id)) app.category_ids.push(body.category_id);
    } else {
      app.category_ids = body.category_ids || [];
    }
    await DB.put('applications', app);
    return { ok: true };
  });
  route('DELETE', '/api/applications/[^/]+/categories', async (m, body, url) => {
    const appId = url.pathname.split('/')[3];
    const catId = url.searchParams.get('category_id');
    const app = await DB.get('applications', appId);
    if (!app) return { __status: 404, detail: 'Application not found' };
    app.category_ids = (app.category_ids || []).filter(id => id !== catId);
    await DB.put('applications', app);
    return { ok: true };
  });

  // ── Categories ────────────────────────────────────────────────────────────
  route('GET', '/api/categories', async () => {
    const cats = (await DB.all('categories')).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const apps = (await DB.all('applications')).filter(isActiveSaved);
    return cats.map(cat => {
      const catApps = apps.filter(a => (a.category_ids || []).includes(cat.id))
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      return { ...cat, applications: catApps, count: catApps.length };
    });
  });
  route('POST', '/api/categories', async (m, body) => {
    const name = (body.name || '').trim();
    if (!name) return { __status: 400, detail: 'name required' };
    const existing = (await DB.all('categories')).find(c => c.name === name);
    if (existing) return { __status: 409, detail: 'Category already exists' };
    const cat = { id: uuid(), name, color: await nextCategoryColor(), created_at: nowIso() };
    await DB.put('categories', cat);
    return { ...cat, count: 0 };
  });
  route('PATCH', '/api/categories/[^/]+', async (m, body, url) => {
    const id = url.pathname.split('/')[3];
    const cat = await DB.get('categories', id);
    if (!cat) return { __status: 404, detail: 'Category not found' };
    const name = (body.name || '').trim();
    if (!name) return { __status: 400, detail: 'name required' };
    cat.name = name;
    await DB.put('categories', cat);
    return cat;
  });
  route('DELETE', '/api/categories/[^/]+', async (m, body, url) => {
    const id = url.pathname.split('/')[3];
    const cat = await DB.get('categories', id);
    if (!cat) return { __status: 404, detail: 'Category not found' };
    await DB.delete('categories', id);
    const apps = await DB.all('applications');
    for (const a of apps) {
      if ((a.category_ids || []).includes(id)) {
        a.category_ids = a.category_ids.filter(cid => cid !== id);
        await DB.put('applications', a);
      }
    }
    return { ok: true };
  });

  // ── Tasks ─────────────────────────────────────────────────────────────────
  route('GET', '/api/tasks', async () => {
    return (await DB.all('tasks')).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (b.created_at || '').localeCompare(a.created_at || ''));
  });
  route('POST', '/api/tasks', async (m, body) => {
    const title = (body.title || '').trim();
    if (!title) return { __status: 400, detail: 'title required' };
    const tasks = await DB.all('tasks');
    const minOrder = tasks.length ? Math.min(...tasks.map(t => t.sort_order || 0)) : 0;
    const task = { id: uuid(), title, done: 0, due_date: body.due_date || null, sort_order: minOrder - 1, created_at: nowIso(), updated_at: nowIso() };
    await DB.put('tasks', task);
    return task;
  });
  route('POST', '/api/tasks/reorder', async (m, body) => {
    const ids = body.ids || [];
    for (let i = 0; i < ids.length; i++) {
      const t = await DB.get('tasks', ids[i]);
      if (t) { t.sort_order = i; t.updated_at = nowIso(); await DB.put('tasks', t); }
    }
    return { ok: true };
  });
  route('PATCH', '/api/tasks/[^/]+', async (m, body, url) => {
    const id = url.pathname.split('/')[3];
    const task = await DB.get('tasks', id);
    if (!task) return { __status: 404, detail: 'Task not found' };
    if ('title' in body) {
      const t = (body.title || '').trim();
      if (!t) return { __status: 400, detail: 'title cannot be empty' };
      task.title = t;
    }
    if ('done' in body) task.done = body.done ? 1 : 0;
    if ('due_date' in body) task.due_date = body.due_date;
    task.updated_at = nowIso();
    await DB.put('tasks', task);
    return task;
  });
  route('DELETE', '/api/tasks/[^/]+', async (m, body, url) => {
    const id = url.pathname.split('/')[3];
    await DB.delete('tasks', id);
    return { ok: true };
  });

  // ── Interview steps (nested inside each application record) ─────────────
  async function findAppByStepId(stepId) {
    const apps = await DB.all('applications');
    return apps.find(a => (a.steps || []).some(s => s.id === stepId)) || null;
  }

  route('POST', '/api/applications/[^/]+/steps', async (m, body, url) => {
    const appId = url.pathname.split('/')[3];
    const app = await DB.get('applications', appId);
    if (!app) return { __status: 404, detail: 'Application not found' };
    app.steps = app.steps || [];
    const maxOrder = app.steps.reduce((mx, s) => Math.max(mx, s.sort_order || 0), 0);
    const step = {
      id: uuid(),
      step_name: body.step_name || 'New step',
      step_date: body.step_date || null,
      interviewer: body.interviewer || null,
      notes: body.notes || null,
      outcome: body.outcome || 'pending',
      sort_order: maxOrder + 1,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    app.steps.push(step);
    await DB.put('applications', app);
    return step;
  });

  route('PATCH', '/api/steps/[^/]+', async (m, body, url) => {
    const stepId = url.pathname.split('/')[3];
    const app = await findAppByStepId(stepId);
    if (!app) return { __status: 404, detail: 'Step not found' };
    const step = app.steps.find(s => s.id === stepId);
    for (const f of ['step_name', 'step_date', 'interviewer', 'notes', 'outcome']) {
      if (f in body) step[f] = body[f];
    }
    step.updated_at = nowIso();
    await DB.put('applications', app);
    return step;
  });

  route('DELETE', '/api/steps/[^/]+', async (m, body, url) => {
    const stepId = url.pathname.split('/')[3];
    const app = await findAppByStepId(stepId);
    if (app) {
      app.steps = app.steps.filter(s => s.id !== stepId);
      await DB.put('applications', app);
    }
    return { ok: true };
  });

  // ── Week summary + digest (dashboard "this week" card) ──────────────────
  route('GET', '/api/week-summary', async () => {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const windowStart = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const interviewEnd = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const apps = (await DB.all('applications')).filter(notArchived);
    const createdRecently = a => {
      const c = (a.created_at || '').slice(0, 10);
      return c >= windowStart && c <= todayIso;
    };
    const cvsToSend = apps.filter(a => (a.saved === 1 || a.saved == null) && (a.app_status || 'generated') === 'generated').length;
    const sentRecent = apps.filter(a => createdRecently(a) && ['sent', 'interviewing', 'rejected', 'offer'].includes(a.app_status)).length;
    const interviews = [];
    for (const a of apps) {
      for (const s of (a.steps || [])) {
        if (s.step_date && s.step_date >= todayIso && s.step_date <= interviewEnd) {
          interviews.push({ step_name: s.step_name, step_date: s.step_date, outcome: s.outcome, company_name: a.company_name, job_title: a.job_title });
        }
      }
    }
    interviews.sort((a, b) => (a.step_date || '').localeCompare(b.step_date || ''));
    return { week_start: todayIso, week_end: interviewEnd, interviews, interviews_count: interviews.length, cvs_to_send: cvsToSend, sent_this_week: sentRecent };
  });

  route('GET', '/api/digest', async () => {
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const apps = await DB.all('applications');
    const stale = [];
    for (const a of apps) {
      if (a.app_status === 'sent' && a.created_at) {
        const days = Math.floor((now - new Date(a.created_at)) / 86400000);
        if (days >= 7) stale.push({ ...a, days_waiting: days });
      }
    }
    const upcoming_steps = [];
    for (const a of apps) {
      for (const s of (a.steps || [])) {
        if (s.outcome === 'pending' && s.step_date && s.step_date >= todayIso && s.step_date <= weekEnd) {
          upcoming_steps.push({ ...s, company_name: a.company_name, job_title: a.job_title });
        }
      }
    }
    upcoming_steps.sort((a, b) => (a.step_date || '').localeCompare(b.step_date || ''));
    const interviewing_no_steps = apps.filter(a => a.app_status === 'interviewing' && (!a.steps || a.steps.length === 0));
    return { stale_sent: stale, upcoming_steps, interviewing_no_steps, generated_at: now.toISOString() };
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  route('GET', '/api/stats', async () => {
    const apps = (await DB.all('applications')).filter(isActiveSaved)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

    const total = apps.length;
    const tracked = apps.filter(a => a.saved === 1 || a.saved == null).length;
    const by_status = {};
    for (const a of apps) { const s = a.app_status || 'generated'; by_status[s] = (by_status[s] || 0) + 1; }

    const sentStatuses = ['sent', 'interviewing', 'rejected', 'offer'];
    const sent = apps.filter(a => sentStatuses.includes(a.app_status)).length;
    const interviewing = apps.filter(a => a.app_status === 'interviewing').length;
    const offers = by_status['offer'] || 0;
    const rejected = by_status['rejected'] || 0;
    const interviewedTotal = interviewing + offers;
    const response_rate = sent ? Math.round((interviewedTotal / sent) * 100) : 0;
    const offer_rate = interviewedTotal ? Math.round((offers / interviewedTotal) * 100) : 0;
    const rejection_rate = sent ? Math.round((rejected / sent) * 100) : 0;

    const cats = (await DB.all('categories')).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const by_category = cats.map(cat => {
      const catApps = apps.filter(a => (a.category_ids || []).includes(cat.id));
      return {
        id: cat.id, name: cat.name, color: cat.color,
        total: catApps.filter(a => a.app_status !== 'generated').length,
        interviewing: catApps.filter(a => ['interviewing', 'offer'].includes(a.app_status)).length,
        offer: catApps.filter(a => a.app_status === 'offer').length,
      };
    });

    const referredSent = apps.filter(a => a.referral_name && sentStatuses.includes(a.app_status));
    const coldSent = apps.filter(a => !a.referral_name && sentStatuses.includes(a.app_status));
    const referred = referredSent.length;
    const referredInterviewing = referredSent.filter(a => ['interviewing', 'offer'].includes(a.app_status)).length;
    const coldInterviewing = coldSent.filter(a => ['interviewing', 'offer'].includes(a.app_status)).length;
    const referred_response_rate = referred ? Math.round((referredInterviewing / referred) * 100) : 0;
    const cold_response_rate = coldSent.length ? Math.round((coldInterviewing / coldSent.length) * 100) : 0;

    const monthly = {};
    for (const a of apps) {
      if (a.created_at && a.app_status !== 'generated') {
        const month = a.created_at.slice(0, 7);
        monthly[month] = (monthly[month] || 0) + 1;
      }
    }
    const monthly_list = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, count]) => ({ month, count }));

    const STAGE_ORDER = ['CV Sent', 'Phone Screen', '1st Interview', '2nd Interview', '3rd Interview', 'Final Round', 'Offer'];
    const by_stage = {};
    for (const a of apps) {
      const idx = STAGE_ORDER.indexOf(a.interview_stage);
      if (idx !== -1) {
        for (let i = 0; i <= idx; i++) by_stage[STAGE_ORDER[i]] = (by_stage[STAGE_ORDER[i]] || 0) + 1;
      }
    }

    const by_rejection_reason = {};
    for (const a of apps) {
      if (a.app_status === 'rejected') {
        const reason = (a.rejection_reason || '').trim() || 'Not specified';
        by_rejection_reason[reason] = (by_rejection_reason[reason] || 0) + 1;
      }
    }

    let top_label = null;
    for (const cat of by_category) {
      if (cat.total >= 2) {
        const rate = Math.round((cat.interviewing / cat.total) * 100);
        if (!top_label || rate > top_label.rate) {
          top_label = { name: cat.name, color: cat.color, rate, sent: cat.total, interviews: cat.interviewing };
        }
      }
    }

    const insights = [];
    if (referred >= 2 && coldSent.length >= 2 && referred_response_rate > cold_response_rate) {
      const gap = referred_response_rate - cold_response_rate;
      insights.push({ icon: '🤝', text: `Your referred applications get a reply ${referred_response_rate}% of the time vs ${cold_response_rate}% without a referral — a ${gap}-point gap.` });
    }
    if (top_label && top_label.sent >= 2) {
      insights.push({ icon: '🏷️', text: `Your "${top_label.name}" label has your best response rate — ${top_label.rate}% (${top_label.interviews}/${top_label.sent}).` });
    }
    if (Object.keys(by_rejection_reason).length) {
      const [topReason, topCount] = Object.entries(by_rejection_reason).sort((a, b) => b[1] - a[1])[0];
      if (topReason !== 'Not specified' && topCount >= 2) {
        insights.push({ icon: '💡', text: `"${topReason}" has come up in ${topCount} rejections — your most frequent reason so far.` });
      }
    }

    return {
      total, tracked, by_status, sent, interviewing, offers, rejected,
      response_rate, offer_rate, rejection_rate, by_category,
      referred, referred_interviewing: referredInterviewing,
      referred_response_rate, cold_response_rate, top_label, insights,
      monthly: monthly_list, by_stage, stage_order: STAGE_ORDER, by_rejection_reason,
    };
  });

  // ── window.fetch override ────────────────────────────────────────────────
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const urlStr = typeof input === 'string' ? input : input.url;
    // Only intercept same-origin /api/ calls — everything else (fonts, CDN
    // scripts) goes through the real network exactly as before.
    if (!urlStr || urlStr.indexOf('/api/') === -1) return realFetch(input, init);

    const url = new URL(urlStr, location.href);
    const method = ((init && init.method) || 'GET').toUpperCase();
    const isFormData = init && init.body && typeof FormData !== 'undefined' && init.body instanceof FormData;
    const body = isFormData ? {} : await parseBody(init);
    const fakeInit = isFormData ? { ...init, body: init.body } : init;

    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      try {
        const result = await r.handler(m, body, url, fakeInit || {});
        if (result && typeof result === 'object' && '__status' in result) {
          const { __status, ...rest } = result;
          return jsonResponse(rest, __status);
        }
        return jsonResponse(result, 200);
      } catch (e) {
        console.error('localdb route error', method, url.pathname, e);
        return jsonResponse({ detail: String(e && e.message || e) }, 500);
      }
    }
    // Unmatched /api/ call — fail soft with 404 rather than hitting a real
    // network that doesn't exist on a static host.
    console.warn('localdb: unhandled API call', method, url.pathname);
    return jsonResponse({ detail: 'Not found (local-only build)' }, 404);
  };

  // Exposed for the Settings modal's Export/Import/Clear data buttons.
  window.TaylorLocalData = {
    async exportAll() {
      const [applications, categories, tasks] = await Promise.all([
        DB.all('applications'), DB.all('categories'), DB.all('tasks'),
      ]);
      // Files (CV blobs) are exported as base64 so the JSON stays a single file.
      const files = await DB.all('files');
      const filesOut = [];
      for (const f of files) {
        const b64 = await blobToBase64(f.blob);
        filesOut.push({ id: f.id, filename: f.filename, type: f.type, data: b64 });
      }
      const meta = (await DB.get('meta', 'profile')) || null;
      return { version: 1, exported_at: nowIso(), applications, categories, tasks, files: filesOut, meta };
    },
    async importAll(payload) {
      if (!payload || payload.version !== 1) throw new Error('Unrecognised export file');
      for (const a of payload.applications || []) await DB.put('applications', a);
      for (const c of payload.categories || []) await DB.put('categories', c);
      for (const t of payload.tasks || []) await DB.put('tasks', t);
      for (const f of payload.files || []) {
        const blob = base64ToBlob(f.data, f.type);
        await DB.put('files', { id: f.id, filename: f.filename, type: f.type, blob });
      }
      if (payload.meta) await DB.put('meta', payload.meta);
    },
    async clearAll() {
      for (const name of STORES) {
        const os = await tx(name, 'readwrite');
        await new Promise((resolve, reject) => {
          const req = os.clear();
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    },
  };

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  function base64ToBlob(b64, type) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: type || 'application/pdf' });
  }
})();
