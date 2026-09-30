// demo.js — token counter + guided tour (loaded on every page)

// Set tab title to "Taylor Demo" on demo instances
fetch('/api/config').then(r => r.json()).then(c => {
  if (c.is_demo) document.title = 'Taylor Demo';
});

// ── Settings ──────────────────────────────────────────────────────────────────
// Local-only build: no server, no accounts. Settings here are either pure
// client-side (dark mode) or act on the IndexedDB store directly (export /
// import / clear, via window.TaylorLocalData from localdb.js).
function isDarkMode() { return localStorage.getItem('darkMode') === '1'; }
function applyDarkMode() {
  document.documentElement.setAttribute('data-theme', isDarkMode() ? 'dark' : '');
}
applyDarkMode();

function openSettingsModal() {
  let modal = document.getElementById('settingsModal');
  if (modal) { modal.remove(); return; }

  modal = document.createElement('div');
  modal.id = 'settingsModal';
  modal.style.cssText = `
    position: fixed; top: 50px; right: 16px; z-index: 9999;
    background: var(--card-bg, #fff); border: 1px solid var(--border, #e2e8f0);
    border-radius: 10px; padding: 18px 20px; min-width: 280px;
    box-shadow: 0 8px 24px rgba(0,0,0,.15); font-size: 14px; color: var(--text, #1e2330);
  `;
  const darkOn = isDarkMode();
  modal.innerHTML = `
    <div style="font-weight:600;margin-bottom:12px;font-size:15px">⚙️ Settings</div>
    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 0">
      <input type="checkbox" id="darkModeChk" ${darkOn ? 'checked' : ''} style="width:16px;height:16px;accent-color:#6366f1">
      <span>🌙 Dark mode</span>
    </label>
    <div style="margin:14px 0 4px;padding-top:12px;border-top:1px solid var(--border,#e2e8f0);font-size:12.5px;color:#8a8f9c;line-height:1.5">
      Your data lives only in this browser. Back it up or move it to another
      device with export/import.
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
      <button id="exportDataBtn" style="text-align:left;font-size:13px;padding:6px 8px;border:1px solid var(--border,#e2e8f0);border-radius:6px;cursor:pointer;background:transparent;color:inherit">⬇ Export my data (.json)</button>
      <button id="importDataBtn" style="text-align:left;font-size:13px;padding:6px 8px;border:1px solid var(--border,#e2e8f0);border-radius:6px;cursor:pointer;background:transparent;color:inherit">⬆ Import data</button>
      <button id="clearDataBtn" style="text-align:left;font-size:13px;padding:6px 8px;border:1px solid #f5a8a8;border-radius:6px;cursor:pointer;background:transparent;color:#c0392b">🗑 Clear all data</button>
    </div>
    <input type="file" id="importDataInput" accept="application/json" style="display:none">
    <div style="margin-top:14px;text-align:right">
      <button onclick="document.getElementById('settingsModal').remove()" style="font-size:13px;padding:4px 12px;border:1px solid var(--border,#e2e8f0);border-radius:6px;cursor:pointer;background:transparent;color:inherit">Close</button>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('darkModeChk').addEventListener('change', (e) => {
    localStorage.setItem('darkMode', e.target.checked ? '1' : '0');
    applyDarkMode();
  });

  document.getElementById('exportDataBtn').addEventListener('click', async () => {
    if (!window.TaylorLocalData) return;
    const data = await window.TaylorLocalData.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taylor-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  const importInput = document.getElementById('importDataInput');
  document.getElementById('importDataBtn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file || !window.TaylorLocalData) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await window.TaylorLocalData.importAll(payload);
      alert('Import complete. Reloading…');
      location.reload();
    } catch (e) {
      alert('Could not import this file: ' + (e && e.message || e));
    }
  });

  document.getElementById('clearDataBtn').addEventListener('click', async () => {
    if (!window.TaylorLocalData) return;
    if (!confirm('This deletes every application, label, task and saved CV in this browser. This cannot be undone. Continue?')) return;
    await window.TaylorLocalData.clearAll();
    location.reload();
  });

  // Close when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function outsideClick(e) {
      if (!modal.contains(e.target) && e.target.id !== 'settingsGearBtn') {
        modal.remove();
        document.removeEventListener('click', outsideClick);
      }
    });
  }, 100);
}

// Inject settings gear button next to token counter
function injectSettingsBtn() {
  const tc = document.getElementById('tokenCounter');
  if (tc && !document.getElementById('settingsGearBtn')) {
    const btn = document.createElement('button');
    btn.id = 'settingsGearBtn';
    btn.title = 'Settings';
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>`;
    btn.style.cssText = 'background:none;border:none;cursor:pointer;padding:5px;opacity:0.5;line-height:0;margin-left:4px;vertical-align:middle;border-radius:6px;color:currentColor;transition:opacity 0.15s,background 0.15s;';
    btn.onmouseenter = () => { btn.style.opacity = '1'; btn.style.background = 'rgba(255,255,255,0.1)'; };
    btn.onmouseleave = () => { btn.style.opacity = '0.5'; btn.style.background = 'none'; };
    btn.onclick = (e) => { e.stopPropagation(); openSettingsModal(); };
    tc.after(btn);
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectSettingsBtn);
} else {
  injectSettingsBtn();
}

// ── Token counter ─────────────────────────────────────────────────────────────
// Always $0 / 0 calls in the local-only build (no AI calls ever happen), and
// the counter itself is hidden via CSS — pollUsage() below is harmless but
// effectively a no-op against the localdb shim's fixed zero response.
async function pollUsage() {
  try {
    const r = await fetch('/api/usage');
    if (!r.ok) return;
    const d = await r.json();
    const calls = document.getElementById('tcCalls');
    const cost  = document.getElementById('tcCost');
    if (calls) calls.textContent = d.calls;
    if (cost)  cost.textContent  = d.cost_display;
  } catch(e) {}
}
pollUsage();
setInterval(pollUsage, 4000);

// ── Guided tour ───────────────────────────────────────────────────────────────
const TOURS = {
  '/home': [
    {
      selector: '.hero-banner',
      title: '1. Your home base',
      body: 'A quick snapshot of your job search. Tailor a fresh CV for any role with the "Try it now" button.',
    },
    {
      selector: '.digest-widget',
      title: '2. Needs your attention',
      body: 'Upcoming interview steps surface here so nothing slips through. Click "View" to jump straight to the process.',
    },
    {
      selector: '.dash-stats',
      title: '3. Your scoreboard',
      body: 'Live counts of applications, sent, interviewing, and offers. Click any tile to jump to the matching page.',
    },
    {
      selector: '.sidebar',
      title: '4. Your applications',
      body: 'Everything you have tracked, organised into labels like Startups, Corporate, or Remote.',
    },
  ],
  '/': [
    {
      selector: '.form-card',
      title: '1. Paste the job description',
      body: 'Drop any job posting here — plain text or a URL. Claude reads it and extracts the role, requirements, and key themes automatically.',
    },
    {
      selector: '.cv-library-btn',
      title: '2. Pick your base CV',
      body: 'Choose which of your tailored CVs to use as the starting point. The app stores every version so you can always pick the most relevant one.',
    },
    {
      selector: '.btn-primary.btn-lg',
      title: '3. AI pre-flight check',
      body: 'Before generating suggestions, Claude scores the fit (0–100) and surfaces the top themes from the JD — so every suggestion is laser-targeted.',
    },
  ],
  '/review': [
    {
      selector: '.fit-block',
      title: '1. Fit score',
      body: 'Claude scores how well your CV matches this specific role. Green pills = requirements you meet. Red pills = gaps to address or acknowledge.',
    },
    {
      selector: '.jd-summary-card',
      title: '2. Role at a glance',
      body: 'Key facts extracted from the job description automatically — experience required, contract type, location, salary if mentioned.',
    },
    {
      selector: '.card',
      title: '3. AI suggestion cards',
      body: 'Each card shows the original text vs. the AI-tailored version, with a reason tied to the JD. Approve, reject, or ask Claude to try a different angle.',
    },
    {
      selector: '.generate-bar',
      title: '4. Generate tailored PDF',
      body: 'One click renders a professional single-page PDF with only your approved changes applied. Your original CV is never touched.',
    },
  ],
  '/history': [
    {
      selector: '.history-toolbar',
      title: '1. Application tracker',
      body: 'Every application is logged here — company, role, fit score, status, referral, and interview stage. Full history in one place.',
    },
    {
      selector: '.sidebar',
      title: '2. Categories & pipeline',
      body: 'Organise applications into custom categories — Startups, Corporate, Remote… Each one tracks its own pipeline at a glance.',
    },
    {
      selector: '.history-table',
      title: '3. Full data',
      body: 'Sort by status, score, or date. Update the stage inline, download any CV, or export everything to CSV with one click.',
    },
  ],
  '/interviewing': [
    {
      selector: '.page-header',
      title: '1. Active processes',
      body: 'Only applications marked "Interviewing" appear here — no noise from the rest of your pipeline.',
    },
    {
      selector: '.process-card',
      title: '2. Process card',
      body: 'Track interview steps, dates, interviewers, and outcomes. Add free-text notes as you go — impressions, things to prepare, who you spoke with.',
    },
    {
      selector: '.prep-section',
      title: '3. Interview prep',
      body: 'Click "Generate prep questions" and Claude reads the JD + your CV to produce tailored questions with suggested answers — specific to your experience.',
    },
  ],
  '/scanner': [
    {
      selector: '.main-inner',
      title: 'Job scanner',
      body: 'Paste multiple job descriptions at once. Claude scans all of them, scores your fit for each, and surfaces the best matches — so you know where to focus.',
    },
  ],
  '/stats': [
    {
      selector: '.ai-usage-bar',
      title: '1. AI usage tracker',
      body: 'Every Claude API call is tracked in real time — number of calls, tokens used, and total cost. This entire session costs less than a cup of coffee.',
    },
    {
      selector: '.stats-funnel',
      title: '2. Application funnel',
      body: 'Response rate, interview conversion, offer rate — calculated live from your data. See exactly how your job search is performing.',
    },
    {
      selector: '.main-inner',
      title: '3. Full analytics',
      body: 'Monthly volume, referral lift, category breakdown, stage funnel. All generated from the applications you\'ve tracked.',
    },
  ],
};

let tourSteps = [];
let tourIndex = 0;
let tourOverlay, tourSpotlight, tourTooltip;

function startTour() {
  // If already open, restart from step 1
  if (tourOverlay) endTour();

  const path = location.pathname.replace(/\/$/, '') || '/';
  const key = Object.keys(TOURS).find(k => path === k) || '/';
  tourSteps = TOURS[key] || TOURS['/'];
  tourIndex = 0;

  // Build overlay
  tourOverlay = document.createElement('div');
  tourOverlay.className = 'tour-overlay';

  tourSpotlight = document.createElement('div');
  tourSpotlight.className = 'tour-spotlight';

  tourTooltip = document.createElement('div');
  tourTooltip.className = 'tour-tooltip';

  tourOverlay.appendChild(tourSpotlight);
  tourOverlay.appendChild(tourTooltip);
  document.body.appendChild(tourOverlay);

  showTourStep(0);
}

function showTourStep(i) {
  if (i >= tourSteps.length) { endTour(); return; }
  tourIndex = i;
  const step = tourSteps[i];

  // Spotlight the target element (skip if missing or hidden)
  let el = document.querySelector(step.selector);
  if (el && el.getClientRects().length === 0) el = null;
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Wait for scroll to settle, then position
  setTimeout(() => {
    if (!tourOverlay) return; // tour was closed
    const pad = 8;
    if (el) {
      const r = el.getBoundingClientRect();
      Object.assign(tourSpotlight.style, {
        top:    (r.top - pad) + 'px',
        left:   (r.left - pad) + 'px',
        width:  (r.width + pad * 2) + 'px',
        height: (r.height + pad * 2) + 'px',
      });
      // Place tooltip below element if space, else above; always centered horizontally
      const below = r.bottom + 200 < window.innerHeight;
      tourTooltip.style.top  = below
        ? (r.bottom + 12) + 'px'
        : Math.max(12, r.top - 200) + 'px';
    } else {
      Object.assign(tourSpotlight.style, { top: '-999px', left: '-999px', width: '0', height: '0' });
      tourTooltip.style.top = '30%';
    }
    // Always center horizontally with safe margins
    tourTooltip.style.left      = '50%';
    tourTooltip.style.transform = 'translateX(-50%)';
  }, 350);

  tourTooltip.innerHTML = `
    <div class="tour-tooltip-title">${step.title}</div>
    <div class="tour-tooltip-body">${step.body}</div>
    <div class="tour-tooltip-footer">
      <span class="tour-step-count">${i + 1} / ${tourSteps.length}</span>
      <div class="tour-tooltip-btns">
        <button class="tour-btn-skip" onclick="endTour()">Skip</button>
        <button class="tour-btn-next" onclick="showTourStep(${i + 1})">
          ${i + 1 < tourSteps.length ? 'Next →' : 'Done ✓'}
        </button>
      </div>
    </div>
  `;
}

function endTour() {
  if (tourOverlay) { tourOverlay.remove(); tourOverlay = null; }
}

// Close tour on Escape
document.addEventListener('keydown', e => { if (e.key === 'Escape') endTour(); });
