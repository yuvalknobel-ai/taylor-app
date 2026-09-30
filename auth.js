// Shared profile widget, included on every app page. This app has no
// accounts or server — "me" is just a name + target role saved locally in
// this browser's IndexedDB (see localdb.js). This file:
//  - top-right: shows "Hi, <name>" (defaulting to "there")
//  - personalizes the hero greeting + target-role tag from that local profile
//  - shows a one-time "what's your name / what role are you targeting" intro
//    for anyone who hasn't filled it in yet
(async function () {
  let me;
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return;
    me = await res.json();
  } catch (e) { return; }

  renderTopRight(me);
  personalizeGreeting(me);
  if (!me.name) showIntro(me);

  function renderTopRight(me) {
    const bar = document.querySelector('.topnav-right');
    if (!bar) return;
    const wrap = document.createElement('div');
    wrap.className = 'auth-widget';
    wrap.innerHTML = '<span class="auth-hi">Hi, ' + escapeHtml(me.name || 'there') + '</span>';
    bar.insertBefore(wrap, bar.firstChild);
  }

  function personalizeGreeting(me) {
    const greeting = document.getElementById('heroGreeting');
    if (greeting) greeting.textContent = 'Hey ' + (me.name || 'there') + ' 👋';
    const tag = document.getElementById('targetRoleTag');
    if (tag) {
      if (me.target_role) {
        tag.textContent = 'Focusing on ' + me.target_role + ' roles';
        tag.style.display = '';
      } else {
        tag.style.display = 'none';
      }
    }
    const tagline = document.getElementById('brandTagline');
    if (tagline) {
      tagline.textContent = (me.name ? me.name + "'s" : 'Your') + ' personal application tracker';
    }
    // Fill inline name placeholders (empty states, notes) with the chosen name.
    // If the user has no name yet, the fallback text already in the span stays.
    if (me.name) {
      document.querySelectorAll('.user-name').forEach(function (el) { el.textContent = me.name; });
    }
  }

  function showIntro(me) {
    const overlay = document.createElement('div');
    overlay.className = 'intro-overlay';
    overlay.innerHTML =
      '<div class="intro-card">' +
        '<div class="intro-title">Welcome 👋</div>' +
        '<div class="intro-sub">Two quick things so Taylor can tailor itself to you.</div>' +
        '<div class="intro-field">' +
          '<label>What’s your name?</label>' +
          '<input type="text" id="introName" placeholder="Your name" autofocus>' +
        '</div>' +
        '<div class="intro-field">' +
          '<label>What role are you targeting?</label>' +
          '<input type="text" id="introRole" placeholder="e.g. Product Manager">' +
        '</div>' +
        '<div class="intro-actions">' +
          '<button class="btn btn-ghost btn-sm" id="introSkip">Skip for now</button>' +
          '<button class="btn btn-primary btn-sm" id="introGo">Let’s go →</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    const nameInput = document.getElementById('introName');
    const roleInput = document.getElementById('introRole');
    document.getElementById('introSkip').onclick = () => overlay.remove();
    document.getElementById('introGo').onclick = async () => {
      const name = nameInput.value.trim();
      const target_role = roleInput.value.trim();
      if (!name && !target_role) { overlay.remove(); return; }
      try {
        const res = await fetch('/api/auth/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, target_role }),
        });
        const updated = await res.json();
        personalizeGreeting(updated);
        const hi = document.querySelector('.auth-hi');
        if (hi) hi.textContent = 'Hi, ' + (updated.name || 'there');
      } catch (e) {}
      overlay.remove();
    };
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') roleInput.focus(); });
    roleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('introGo').click(); });
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
})();
