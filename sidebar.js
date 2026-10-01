// Shared sidebar Alpine.js component — included on every page

// ─── Cmd+K / Ctrl+K command palette ──────────────────────────────────────────
// Jump to any application by company/role name from anywhere in the app.
// Selecting a result navigates to history.html?goto=<id>, which scrolls to
// and flashes that row (see the goto handling in history.html's init()).
(function () {
  let overlay = null;
  let allApps = null; // cached per-open; refetched each time the palette opens
  let selectedIndex = 0;
  let currentResults = [];

  function statusDotColor(status) {
    const map = {
      generated: '#c8cdd6', sent: '#f5a86a', interviewing: '#7dc4a0',
      offer: '#b09de8', rejected: '#f59ab0',
    };
    return map[status] || '#c8cdd6';
  }

  function render(query) {
    const list = overlay.querySelector('#cmdkResults');
    const q = query.trim().toLowerCase();
    currentResults = !allApps ? [] : allApps.filter(a =>
      (a.company_name || '').toLowerCase().includes(q) ||
      (a.job_title || '').toLowerCase().includes(q)
    ).slice(0, 8);
    selectedIndex = 0;

    if (!q) {
      list.innerHTML = '<div class="cmdk-empty">Type a company or role name…</div>';
      return;
    }
    if (currentResults.length === 0) {
      list.innerHTML = '<div class="cmdk-empty">No matches</div>';
      return;
    }
    list.innerHTML = currentResults.map((a, i) => `
      <div class="cmdk-item${i === 0 ? ' active' : ''}" data-index="${i}">
        <span class="cmdk-item-dot" style="background:${statusDotColor(a.app_status)}"></span>
        <div class="cmdk-item-text">
          <div class="cmdk-item-company">${escapeHtmlCmdk(a.company_name || 'Unknown company')}</div>
          <div class="cmdk-item-role">${escapeHtmlCmdk(a.job_title || '')}</div>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.cmdk-item').forEach(el => {
      el.addEventListener('click', () => goTo(currentResults[parseInt(el.dataset.index)]));
      el.addEventListener('mouseenter', () => setActive(parseInt(el.dataset.index)));
    });
  }

  function setActive(i) {
    selectedIndex = i;
    overlay.querySelectorAll('.cmdk-item').forEach((el, idx) => {
      el.classList.toggle('active', idx === i);
    });
  }

  function goTo(app) {
    if (!app) return;
    window.location.href = 'history.html?goto=' + app.id;
  }

  function escapeHtmlCmdk(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function closePalette() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  async function openPalette() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'cmdk-overlay';
    overlay.innerHTML = `
      <div class="cmdk-box" role="dialog" aria-label="Jump to application">
        <input type="text" id="cmdkInput" class="cmdk-input" placeholder="Jump to a company or role…" autocomplete="off">
        <div id="cmdkResults" class="cmdk-results"></div>
        <div class="cmdk-hint">↑↓ to navigate · Enter to open · Esc to close</div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePalette(); });

    const input = overlay.querySelector('#cmdkInput');
    input.focus();
    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(selectedIndex + 1, currentResults.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(selectedIndex - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); goTo(currentResults[selectedIndex]); }
    });

    render('');
    try {
      const res = await fetch('/api/history');
      allApps = res.ok ? await res.json() : [];
      render(input.value);
    } catch (e) { allApps = []; }
  }

  document.addEventListener('keydown', (e) => {
    const isK = e.key === 'k' || e.key === 'K';
    if ((e.metaKey || e.ctrlKey) && isK) {
      e.preventDefault();
      if (overlay) closePalette(); else openPalette();
    }
  });
})();

// ─── Milestone celebrations ──────────────────────────────────────────────────
// Fires a one-time toast (+ confetti for the bigger ones) the first time the
// user crosses a meaningful threshold: first application, first interview,
// first offer, and round numbers of total applications. Each milestone key
// fires exactly once ever (tracked in localStorage), regardless of which
// page or action triggered the check. Standalone — doesn't depend on any
// page's Alpine toast, so it works everywhere sidebar.js is loaded.
function showMilestoneToast(msg) {
  const el = document.createElement('div');
  el.className = 'milestone-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 4200);
}

window.checkMilestones = async function () {
  let stats;
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    stats = await res.json();
  } catch (e) { return; }

  let seen;
  try { seen = JSON.parse(localStorage.getItem('milestonesSeen') || '{}'); }
  catch (e) { seen = {}; }

  const fire = (key, msg, withConfetti) => {
    if (seen[key]) return;
    seen[key] = true;
    localStorage.setItem('milestonesSeen', JSON.stringify(seen));
    showMilestoneToast(msg);
    if (withConfetti && window.launchConfetti) window.launchConfetti();
  };

  const total = stats.total || 0;
  const interviewingOrFurther = (stats.interviewing || 0) + (stats.offers || 0);
  const offers = stats.offers || 0;

  if (total >= 1) fire('first_app', '🎉 Your first tracked application — the hunt begins!', false);
  [5, 10, 25, 50, 100].forEach(n => {
    if (total >= n) fire('apps_' + n, `🎉 ${n} applications tracked. Keep going!`, n >= 25);
  });
  if (interviewingOrFurther >= 1) fire('first_interview', '📅 Your first interview — nice work!', true);
  if (offers >= 1) fire('first_offer', '🏆 Your first offer! Congratulations!', true);
};

// Check once per page load. Most mutating actions already navigate or
// reload (the shared "Track a new application" modal, bulk imports), which
// naturally re-triggers this; the couple of in-place actions that don't
// (adding a process card, changing a status without leaving the page) call
// window.checkMilestones() directly themselves.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.checkMilestones());
} else {
  window.checkMilestones();
}

// Small celebratory confetti burst — used when an application moves to
// Interviewing or Offer. Self-contained canvas animation, no dependencies.
window.launchConfetti = function () {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#f97316'];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 200,
    r: 4 + Math.random() * 5,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 4,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.2,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.angle += p.spin; p.vy += 0.08;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - frame / 160);
      if (p.shape === 'rect') ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      else { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    });
    frame++;
    if (frame < 180) requestAnimationFrame(draw);
    else canvas.remove();
  }
  draw();
};

// Feature flag bootstrap: read /api/config early and mark <html data-generator="off">
// so the CSS rule in style.css hides every .gen-only element (nav item, CTA, etc.)
// before Alpine or the rest of the page paints. Runs on every page since sidebar.js
// is included everywhere.
(function () {
  try {
    fetch('/api/config')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) {
        if (c && c.generator_enabled === true) {
          document.documentElement.setAttribute('data-generator', 'on');
        }
        if (c && c.ai_features_enabled === true) {
          document.documentElement.setAttribute('data-ai', 'on');
        }
      })
      .catch(function () {});
  } catch (_) {}
})();

// ─── Shared "Track a new application" modal ──────────────────────────────────
// Any page can call `openAddAppModal({ defaultStatus, onCreated })` to pop up a
// small form and create an application via POST /api/applications/manual.
// - defaultStatus: pre-selects the status ("sent", "interviewing", …). Default: "sent".
// - onCreated(app): called with the created application. If omitted, we navigate
//   the user to a page that shows the new card (Interviewing for interviewing,
//   Database otherwise) so they see immediate confirmation.
window.openAddAppModal = function (opts) {
  opts = opts || {};
  const defaultStatus = opts.defaultStatus || 'sent';
  const onCreated = opts.onCreated;

  // If already open, do nothing.
  if (document.getElementById('addAppModal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'addAppModal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="addAppTitle">
      <div class="modal-header">
        <h2 id="addAppTitle">Track a new application</h2>
        <p>Log a role you applied to. Everything below the basics is optional.</p>
      </div>
      <div class="field">
        <label>Company</label>
        <input id="aa_company" type="text" autocomplete="off" placeholder="e.g. Acme Corp">
      </div>
      <div class="field">
        <label>Role</label>
        <input id="aa_role" type="text" autocomplete="off" placeholder="e.g. HR Business Partner">
      </div>
      <div class="field">
        <label>Stage</label>
        <select id="aa_status">
          <option value="sent">Applied (waiting on reply)</option>
          <option value="interviewing">Interviewing</option>
          <option value="offer">Offer</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div class="field">
        <label>Referred by <span class="label-optional">optional</span></label>
        <input id="aa_referral" type="text" autocomplete="off" placeholder="Name of the person who referred you">
      </div>
      <div class="field">
        <label>CV file (PDF) <span class="label-optional">optional</span></label>
        <div id="aa_dropzone" class="drop-zone">
          <div id="aa_dropzone_empty" class="drop-zone-inner">
            <span class="drop-zone-icon">📄</span>
            <span class="drop-zone-text">Drop PDF here or <u>click to browse</u></span>
          </div>
          <div id="aa_dropzone_full" class="drop-zone-inner" style="display:none">
            <span class="drop-zone-icon">✅</span>
            <span id="aa_filename" class="drop-zone-text"></span>
            <button type="button" class="drop-zone-clear" id="aa_clear_file">✕</button>
          </div>
        </div>
        <input id="aa_file" type="file" accept=".pdf" style="display:none">
      </div>
      <div class="field">
        <label>Notes <span class="label-optional">optional</span></label>
        <textarea id="aa_notes" rows="3" placeholder="Salary asked, links, anything you want to remember…"></textarea>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-primary" id="aa_submit">Save</button>
        <button type="button" class="btn btn-ghost" id="aa_cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const statusSel = overlay.querySelector('#aa_status');
  statusSel.value = defaultStatus;

  const close = () => overlay.remove();
  overlay.querySelector('#aa_cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  // ─── Optional CV file drop-zone wiring ───
  const fileInput   = overlay.querySelector('#aa_file');
  const dropZone    = overlay.querySelector('#aa_dropzone');
  const dzEmpty     = overlay.querySelector('#aa_dropzone_empty');
  const dzFull      = overlay.querySelector('#aa_dropzone_full');
  const filenameEl  = overlay.querySelector('#aa_filename');
  const clearFileBtn = overlay.querySelector('#aa_clear_file');

  function showFile(file) {
    filenameEl.textContent = file.name;
    dzEmpty.style.display = 'none';
    dzFull.style.display  = '';
    dropZone.classList.add('drop-zone-done');
  }
  function clearFile() {
    fileInput.value = '';
    dzEmpty.style.display = '';
    dzFull.style.display  = 'none';
    dropZone.classList.remove('drop-zone-done');
  }
  dropZone.addEventListener('click', (e) => {
    if (e.target === clearFileBtn) return;
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) showFile(fileInput.files[0]);
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drop-zone-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drop-zone-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drop-zone-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') {
      const dt = new DataTransfer();
      dt.items.add(f);
      fileInput.files = dt.files;
      showFile(f);
    }
  });
  clearFileBtn.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

  overlay.querySelector('#aa_submit').addEventListener('click', async () => {
    const btn = overlay.querySelector('#aa_submit');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    const company  = overlay.querySelector('#aa_company').value.trim();
    const role     = overlay.querySelector('#aa_role').value.trim();
    const referral = overlay.querySelector('#aa_referral').value.trim();
    const notes    = overlay.querySelector('#aa_notes').value.trim();
    const status   = statusSel.value;
    const file     = fileInput.files[0];
    try {
      let res, app;
      if (file) {
        // With a CV attached, go through the upload-finished pipeline.
        const fd = new FormData();
        fd.append('cv_file', file);
        fd.append('company_name', company);
        fd.append('job_title', role);
        fd.append('app_status', status);
        fd.append('notes', notes);
        fd.append('referral_name', referral);
        res = await fetch('/api/applications/upload-finished', { method: 'POST', body: fd });
        if (!res.ok) throw new Error('save failed');
        const out = await res.json();
        app = { id: out.application_id, app_status: status };
      } else {
        res = await fetch('/api/applications/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_name:  company  || null,
            job_title:     role     || null,
            app_status:    status,
            notes:         notes    || null,
            referral_name: referral || null,
          }),
        });
        if (!res.ok) throw new Error('save failed');
        app = await res.json();
      }
      close();
      if (typeof onCreated === 'function') {
        onCreated(app);
      } else {
        // Send the user somewhere they can see the new card.
        window.location.href = app.app_status === 'interviewing' ? 'interviewing.html' : 'history.html';
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Save';
      alert('Could not save. Please try again.');
    }
  });

  // Autofocus company field
  setTimeout(() => overlay.querySelector('#aa_company').focus(), 20);
};

function sidebarData() {
  return {
    categories: [],
    uncategorised: [],
    expanded: {},
    editingCat: {},
    loading: true,
    showNewCat: false,
    newCatName: '',

    async init() {
      await this.load();
    },

    async load() {
      this.loading = true;
      const res = await fetch('/api/sidebar');
      const data = await res.json();
      this.categories = data.categories;
      this.uncategorised = data.uncategorised;
      this.loading = false;
    },

    toggle(id) {
      this.expanded[id] = !this.expanded[id];
    },

    appUrl(app) {
      // output_cv_path is already a blob: URL (resolved by localdb.js's
      // fetch shim from the stored file bytes) — use it directly.
      return app.output_cv_path || null;
    },

    statusDot(status) {
      const map = {
        generated:    '#f5d47a',
        sent:         '#f5a86a',
        rejected:     '#f59ab0',
        interviewing: '#7dc4a0',
        offer:        '#b09de8',
      };
      return map[status] || '#c8cdd6';
    },

    async addCategory() {
      const name = this.newCatName.trim();
      if (!name) return;
      await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      this.newCatName = '';
      this.showNewCat = false;
      await this.load();
    },

    async renameCategory(id, newName) {
      this.editingCat = { ...this.editingCat, [id]: false };
      const name = (newName || '').trim();
      const cat = this.categories.find(c => c.id === id);
      if (!name || (cat && name === cat.name)) return;
      await fetch(`/api/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      await this.load();
    },

    async deleteCategory(id, e) {
      e.stopPropagation();
      if (!confirm('Delete this category? Applications will not be deleted.')) return;
      await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      await this.load();
    },

    totalApps() {
      const seen = new Set();
      this.categories.forEach(c => c.applications.forEach(a => seen.add(a.id)));
      this.uncategorised.forEach(a => seen.add(a.id));
      return seen.size;
    },
  };
}
