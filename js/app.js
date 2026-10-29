/* ==========================================================
   JESSED · Interfaz y lógica de la app
   ========================================================== */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = Moderation.norm;
  const ROUTES = ['inicio', 'explorar', 'retos', 'comunidad', 'perfil', 'admin'];
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    user: null,
    challenges: [],
    posts: [],
    leaders: [],
    route: 'inicio',
    cat: 'todas',
    q: '',
    lastRandom: null,
    pendingAction: null,
    authMode: 'login',
    prefill: null,
    scrollTo: null,
    confirmResolve: null
  };

  /* ---------------------------------------------------------- Utilidades */
  const catById = id => CATEGORIES.find(c => c.id === id);
  const actionById = id => ACTIONS.find(a => a.id === id);
  const initial = name => (String(name || 'T').trim()[0] || 'T').toUpperCase();
  const firstName = name => String(name || '').trim().split(/\s+/)[0];
  const same = (a, b) => String(a) === String(b);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function dayKey(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  }

  function todaysDaily() {
    const now = new Date();
    const doy = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(now.getFullYear(), 0, 0)) / 864e5);
    return ACTIONS[(doy * 37 + now.getFullYear()) % ACTIONS.length];
  }

  function computeStats(list = state.challenges) {
    const done = list.filter(c => c.status === 'completed').sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    const active = list.filter(c => c.status === 'accepted');
    const points = done.reduce((s, c) => s + (Number(c.points) || 0), 0);
    const byCat = {};
    done.forEach(c => { byCat[c.category] = (byCat[c.category] || 0) + 1; });
    const days = new Set(done.map(c => dayKey(c.completedAt)));
    let streak = 0;
    const d = new Date();
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (days.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
    let bestStreak = 0, run = 0, prev = null;
    [...days].sort().forEach(k => {
      const cur = new Date(k + 'T12:00:00');
      run = prev && Math.round((cur - prev) / 864e5) === 1 ? run + 1 : 1;
      bestStreak = Math.max(bestStreak, run);
      prev = cur;
    });
    return { done, active, points, byCat, streak, bestStreak, dailyCount: done.filter(c => c.isDaily).length };
  }

  function levelInfo(points) {
    let i = 0;
    LEVELS.forEach((l, idx) => { if (points >= l.min) i = idx; });
    const cur = LEVELS[i], next = LEVELS[i + 1];
    const pct = next ? Math.min(100, ((points - cur.min) / (next.min - cur.min)) * 100) : 100;
    return { cur, next, pct, index: i };
  }

  const earnedBadgeIds = (stats = computeStats()) => new Set(BADGES.filter(b => b.check(stats)).map(b => b.id));

  function timeAgo(iso) {
    const s = Math.max(1, Math.floor((Date.now() - new Date(iso)) / 1000));
    if (s < 60) return 'hace un momento';
    const m = Math.floor(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `hace ${plural(d, 'día', 'días')}`;
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  }
  const fmtDate = iso => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

  const activeRow = actionId => state.challenges.find(c => c.actionId === actionId && c.status === 'accepted');
  const doneCount = actionId => state.challenges.filter(c => c.actionId === actionId && c.status === 'completed').length;
  const myPosts = () => state.user ? state.posts.filter(p => same(p.userId, state.user.id)) : [];

  /* ---------------------------------------------------------- Toast, diálogos, confeti */
  let toastTimer;
  function toast(text, type = '') {
    const el = $('#toast');
    el.textContent = text;
    el.className = type;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
  }

  function openModal(id) {
    $('#' + id).hidden = false;
    document.body.classList.add('no-scroll');
    setTimeout(() => $('#' + id + ' input:not([type=file]):not([hidden]), #' + id + ' .primary')?.focus(), 60);
  }
  function closeModal(id) {
    const m = $('#' + id);
    if (!m || m.hidden) return;
    m.hidden = true;
    if (!$$('.modal').some(x => !x.hidden)) document.body.classList.remove('no-scroll');
    if (id === 'dialog' && state.confirmResolve) { const r = state.confirmResolve; state.confirmResolve = null; r(false); }
  }
  function showDialog(html) {
    if (state.confirmResolve) { const r = state.confirmResolve; state.confirmResolve = null; r(false); }
    $('#dialogBody').innerHTML = html;
    openModal('dialog');
  }

  function askConfirm(message, okLabel = 'Sí') {
    return new Promise(resolve => {
      showDialog(`<h2>${esc(message)}</h2>
        <div class="dialog-actions">
          <button class="primary dark" data-act="confirm-yes">${esc(okLabel)}</button>
          <button class="text-btn" data-close="dialog">Cancelar</button>
        </div>`);
      state.confirmResolve = resolve;
    });
  }

  function confetti() {
    if (reduceMotion) return;
    const cv = $('#confetti');
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#a6d45c', '#513579', '#64418e', '#e1d6ec', '#d8c596', '#739337'];
    const parts = Array.from({ length: 140 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 160, y: H * 0.38,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 4,
      r: 5 + Math.random() * 6, c: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35
    }));
    let t = 0;
    cv.hidden = false;
    (function frame() {
      ctx.clearRect(0, 0, W, H);
      parts.forEach(p => {
        p.vy += 0.33; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        ctx.restore();
      });
      if (++t < 160) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, W, H); cv.hidden = true; }
    })();
  }

  /* ---------------------------------------------------------- Cuenta */
  function openAuth(mode = 'login') {
    $('#authForm').reset();
    setAuthMode(mode);
    openModal('authModal');
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    const reg = mode === 'register';
    $('#authTitle').textContent = reg ? 'Únete a JESSED' : 'Qué gusto verte de nuevo';
    $('#authSubtitle').textContent = reg ? 'Crea tu cuenta para guardar tus retos, puntos e insignias.' : 'Entra para seguir sumando buenas acciones.';
    $('#nameField').hidden = !reg;
    $('#authSubmit').textContent = reg ? 'Crear mi cuenta ↗' : 'Entrar ↗';
    $('#authPass').autocomplete = reg ? 'new-password' : 'current-password';
    $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    $('#authError').textContent = '';
    $('#authEmail').placeholder = SCHOOL_DOMAIN ? `tu.nombre@${SCHOOL_DOMAIN}` : 'tu@correo.com';
    $('#authEmailLabel').textContent = SCHOOL_DOMAIN ? 'Correo de la escuela' : 'Correo';
    $('#authEmailHint').textContent = SCHOOL_DOMAIN ? `Usa tu correo de la escuela (@${SCHOOL_DOMAIN}).` : '';
  }

  async function submitAuth(e) {
    e.preventDefault();
    const reg = state.authMode === 'register';
    const name = $('#authName').value.trim();
    const email = $('#authEmail').value.trim();
    const password = $('#authPass').value;
    const errEl = $('#authError');
    errEl.textContent = '';
    if (reg && name.length < 2) { errEl.textContent = 'Escribe tu nombre (mínimo 2 letras).'; return; }
    if (reg && !Moderation.isClean(name)) { errEl.textContent = 'Elige un nombre respetuoso, por favor.'; return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { errEl.textContent = 'Escribe un correo válido.'; return; }
    if (!isSchoolEmail(email)) { errEl.textContent = SCHOOL_EMAIL_ERROR; return; }
    if (password.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }

    const btn = $('#authSubmit');
    btn.disabled = true;
    try {
      const res = reg ? await Store.signUp({ name, email, password }) : await Store.signIn({ email, password });
      if (res.needsConfirm) {
        closeModal('authModal');
        toast('📬 Te mandamos un correo para confirmar tu cuenta. Después entra con tu correo y contraseña.');
        return;
      }
      state.user = res.user;
      await loadUserData();
      closeModal('authModal');
      toast(reg ? `¡Bienvenido a JESSED, ${firstName(state.user.name)}! 💜` : `¡Hola de nuevo, ${firstName(state.user.name)}!`);
      await refreshPosts();
      renderAll();
      if (state.pendingAction) {
        const id = state.pendingAction;
        state.pendingAction = null;
        await accept(id);
      }
    } catch (err) {
      errEl.textContent = err.message || 'Algo salió mal. Inténtalo de nuevo.';
    } finally { btn.disabled = false; }
  }

  async function logout() {
    await Store.signOut();
    state.user = null;
    state.challenges = [];
    toast('Cerraste sesión. ¡Nos vemos pronto!');
    await refreshPosts();
    if (location.hash !== '#inicio') location.hash = '#inicio'; else renderAll();
  }

  async function loadUserData() {
    try { state.challenges = state.user ? await Store.getChallenges(state.user.id) : []; }
    catch (e) { state.challenges = []; toast(e.message, 'error'); }
  }

  async function refreshPosts() {
    try { state.posts = await Store.listPosts(state.user?.id); }
    catch (e) { state.posts = []; }
    try { state.leaders = await Store.leaderboard(); }
    catch (e) { state.leaders = []; }
  }

  /* ---------------------------------------------------------- Retos */
  async function accept(actionId) {
    const a = actionById(actionId);
    if (!a) return;
    if (!state.user) { state.pendingAction = actionId; closeModal('dialog'); openAuth('register'); return; }
    try {
      const row = await Store.acceptChallenge(state.user.id, a);
      state.challenges.unshift(row);
      closeModal('dialog');
      toast('Reto aceptado. ¡El primer paso ya está dado!');
      renderAll();
    } catch (e) { toast(e.message, 'error'); }
  }

  /* Verificación: nadie suma puntos solo con dar clic */
  const sentToday = () => state.challenges.filter(c => (c.status === 'review' || c.status === 'completed')
    && c.completedAt && dayKey(c.completedAt) === dayKey(new Date())).length;

  function limitReached() {
    if (sentToday() < VERIFY.MAX_PER_DAY) return false;
    toast(`Ya enviaste ${VERIFY.MAX_PER_DAY} acciones hoy. ¡Mañana puedes seguir sumando!`, 'error');
    return true;
  }

  function complete(rowId) {
    const row = state.challenges.find(c => same(c.id, rowId));
    if (!row || !state.user) return;
    const waitMs = VERIFY.MIN_WAIT_MIN * 60e3 - (Date.now() - new Date(row.acceptedAt));
    if (waitMs > 0) {
      const min = Math.ceil(waitMs / 60e3);
      toast(`Las buenas acciones toman tiempo. Podrás marcar este reto en ${plural(min, 'minuto', 'minutos')}.`, 'error');
      return;
    }
    if (limitReached()) return;
    showDialog(`
      <div class="eyebrow">VERIFICACIÓN</div>
      <h2>${esc(row.title)}</h2>
      <p>Cuéntanos qué hiciste. Un responsable de Olami ORT lo revisa antes de sumar tus puntos.</p>
      <form id="verifyForm" data-row="${esc(row.id)}" novalidate>
        <label class="lbl" for="verifyText">¿Qué hiciste, con quién y cuándo?</label>
        <textarea id="verifyText" maxlength="280" placeholder="Por ejemplo: hoy en el recreo ayudé a Daniel de 2°B a repasar fracciones para su examen."></textarea>
        <label class="check-label"><input type="checkbox" id="verifyHonest"> Prometo que de verdad hice esta acción. Sé que inventar acciones puede quitarme mis puntos.</label>
        <p class="form-error" id="verifyError" role="alert"></p>
        <div class="dialog-actions"><button class="primary dark" id="verifySubmit" type="submit">Enviar a verificación ✓</button><button type="button" class="text-btn" data-close="dialog">Cancelar</button></div>
      </form>`);
    setTimeout(() => $('#verifyText')?.focus(), 50);
  }

  function evidenceError(text) {
    if (text.length < VERIFY.MIN_EVIDENCE) return `Cuéntanos un poco más (mínimo ${VERIFY.MIN_EVIDENCE} caracteres).`;
    const check = Moderation.check(text);
    return check.ok ? '' : check.reason;
  }

  async function submitVerify(e) {
    e.preventDefault();
    const form = e.target;
    const row = state.challenges.find(c => same(c.id, form.dataset.row));
    if (!row || !state.user) return;
    const evidence = $('#verifyText').value.trim();
    const errEl = $('#verifyError');
    errEl.textContent = evidenceError(evidence);
    if (errEl.textContent) return;
    if (!$('#verifyHonest').checked) { errEl.textContent = 'Confirma que de verdad hiciste la acción.'; return; }
    if (limitReached()) return;
    const today = dayKey(new Date());
    const alreadyDaily = state.challenges.some(c => (c.status === 'completed' || c.status === 'review') && c.isDaily && dayKey(c.completedAt) === today);
    const isDaily = row.actionId === todaysDaily().id && !alreadyDaily;
    const base = actionById(row.actionId)?.points ?? row.points;
    const points = base + (isDaily ? DAILY_BONUS : 0);
    $('#verifySubmit').disabled = true;
    try {
      const upd = await Store.completeChallenge(state.user.id, row.id, { points, isDaily, evidence });
      Object.assign(row, upd);
      sentForReview(row, {});
      renderAll();
    } catch (err) { errEl.textContent = err.message; $('#verifySubmit').disabled = false; }
  }

  function sentForReview(row, opts) {
    showDialog(`
      <div class="eyebrow">¡GRACIAS POR TU JESED!</div>
      <h2>Tu acción está en verificación.</h2>
      <div class="big-points">+${row.points} puntos por confirmar</div>
      <p>Cuando un responsable de Olami ORT la apruebe, los puntos se suman a tu perfil.</p>
      <div class="dialog-actions">
        ${opts.shared
          ? '<span class="status">ENVIADA A REVISIÓN</span>'
          : `<button class="primary dark" data-act="share-done" data-title="${esc(row.title)}">Compartir en la comunidad ↗</button>`}
        <button class="text-btn" data-close="dialog">Seguir</button>
      </div>`);
  }

  function afterPoints(row, beforeBadges, beforeLevel, opts) {
    const after = computeStats();
    const newBadges = BADGES.filter(b => b.check(after) && !beforeBadges.has(b.id));
    celebrate(row, newBadges, levelInfo(after.points).index > beforeLevel, opts);
    renderAll();
  }

  async function cancel(rowId) {
    if (!(await askConfirm('¿Quitar este reto de tus retos en curso?', 'Quitar reto'))) return;
    closeModal('dialog');
    try {
      await Store.cancelChallenge(state.user.id, rowId);
      state.challenges = state.challenges.filter(c => !same(c.id, rowId));
      renderAll();
    } catch (e) { toast(e.message, 'error'); }
  }

  function celebrate(row, newBadges, leveledUp, opts = {}) {
    const s = computeStats();
    const lv = levelInfo(s.points);
    const cheer = CHEERS[(Math.random() * CHEERS.length) | 0];
    showDialog(`
      <div class="eyebrow">¡TU ACCIÓN CUENTA!</div>
      <h2>${esc(cheer)}</h2>
      <div class="big-points">+${row.points} puntos</div>
      ${row.isDaily ? `<p>Incluye +${DAILY_BONUS} por el reto de hoy ☀</p>` : ''}
      ${leveledUp ? `<p><strong>¡Subiste a nivel ${lv.cur.icon} ${esc(lv.cur.name)}!</strong></p>` : ''}
      ${newBadges.length ? `<p><strong>${newBadges.length === 1 ? 'Nueva insignia desbloqueada ✨' : 'Nuevas insignias desbloqueadas ✨'}</strong></p>
        <div class="new-badges">${newBadges.map(b => `<div class="badge-card earned"><div>${b.icon}</div><h3>${esc(b.name)}</h3></div>`).join('')}</div>` : ''}
      <div class="level-line"><span>${lv.cur.icon} ${esc(lv.cur.name)}</span><span>${s.points} pts</span></div>
      <div class="progress"><span style="width:${lv.pct}%"></span></div>
      <div class="dialog-actions">
        ${opts.shared
          ? '<span class="status">ENVIADA A REVISIÓN</span>'
          : `<button class="primary dark" data-act="share-done" data-title="${esc(row.title)}">Compartir en la comunidad ↗</button>`}
        <button class="text-btn" data-close="dialog">Seguir</button>
      </div>`);
    confetti();
  }

  function discover() {
    const pool = ACTIONS.filter(a => a.id !== state.lastRandom);
    const a = pool[Math.floor(Math.random() * pool.length)];
    state.lastRandom = a.id;
    const c = catById(a.category);
    const row = activeRow(a.id);
    showDialog(`
      <div class="eyebrow">TU PRÓXIMA BUENA ACCIÓN</div>
      <h2>${a.icon} ${esc(a.title)}</h2>
      <p>${esc(a.desc)}</p>
      <p>${esc(c.name)} · +${a.points} puntos</p>
      <div class="dialog-actions">
        ${row
          ? `<button class="primary dark" data-act="complete" data-row="${esc(row.id)}">Ya lo hice ✓</button>`
          : `<button class="primary" data-act="accept" data-id="${a.id}">Me sumo a este reto <span>↗</span></button>`}
        <button class="text-btn" data-act="discover">Otra idea ✧</button>
      </div>`);
  }

  /* ---------------------------------------------------------- Piezas reutilizables */
  function card(a) {
    const c = catById(a.category);
    const row = activeRow(a.id);
    const n = doneCount(a.id);
    const isDaily = todaysDaily().id === a.id;
    return `
      <article class="card">
        <div class="card-top"><span class="action-icon">${a.icon}</span><span class="category">${esc(c.name)}</span></div>
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.desc)}${n ? `<br><strong style="color:var(--ok)">✓ Lo has hecho ${plural(n, 'vez', 'veces')}</strong>` : ''}</p>
        ${isDaily ? '<div class="daily-mark">☀ RETO DE HOY · +' + DAILY_BONUS + ' BONUS</div>' : ''}
        <div class="card-bottom">
          <span class="points">✧ +${a.points} puntos</span>
          <span>
            ${row
              ? `<button class="mini-link" data-act="cancel" data-row="${esc(row.id)}">Quitar</button><button class="accept go" data-act="complete" data-row="${esc(row.id)}">Ya lo hice ✓</button>`
              : `<button class="accept" data-act="accept" data-id="${a.id}">Aceptar reto ↗</button>`}
          </span>
        </div>
      </article>`;
  }

  function statsHtml() {
    const s = computeStats();
    const earned = earnedBadgeIds(s).size;
    return `<div class="stats">
      <div class="stat"><span class="stat-icon">✧</span><div><strong>${s.points}</strong><small>Puntos de bondad</small></div></div>
      <div class="stat"><span class="stat-icon">♡</span><div><strong>${s.done.length}</strong><small>Acciones completadas</small></div></div>
      <div class="stat"><span class="stat-icon">☀</span><div><strong>${earned} / ${BADGES.length}</strong><small>Insignias desbloqueadas</small></div></div>
    </div>`;
  }

  function streakHtml() {
    const s = computeStats();
    const filled = Math.min(7, s.streak);
    return `<section class="streak-panel">
      <div>
        <div class="eyebrow">TU CONSTANCIA TAMBIÉN CUENTA</div>
        <h3>🔥 ${plural(s.streak, 'día', 'días')} de racha</h3>
        <p>Haz al menos una buena acción al día para mantenerla · Completa 7 días seguidos para ganar la insignia “Semana de Jesed”.</p>
      </div>
      <div class="week-dots">
        ${[1, 2, 3, 4, 5, 6, 7].map(n => `<span class="${n <= filled ? 'filled' : ''}">${n}</span>`).join('')}
        <small>Tu mejor racha: ${plural(s.bestStreak, 'día', 'días')}</small>
      </div>
    </section>`;
  }

  function composerHtml() {
    const locked = !state.user;
    return `<form class="own-form" id="ownForm" novalidate>
      <div class="section-head"><h2>Mi propia buena acción</h2><span class="category">+${CUSTOM_POINTS} PUNTOS</span></div>
      <label class="lbl" for="ownTitle">Ponle un título</label>
      <input class="search" id="ownTitle" maxlength="60" placeholder="Por ejemplo: invité a alguien a jugar">
      <label class="lbl" for="ownCat">¿Con quién o dónde ayudaste?</label>
      <select id="ownCat">${CATEGORIES.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <label class="lbl" for="ownDesc">Cuéntanos qué hiciste y cómo ayudó</label>
      <textarea id="ownDesc" maxlength="200" placeholder="Describe el gesto, el contexto y qué cambió. Evita incluir información privada de otras personas."></textarea>
      <span class="counter" id="ownCounter">0/200</span>
      <label class="lbl" for="ownPhoto">Foto de evidencia <span class="optional">· opcional</span></label>
      <p class="field-help">Puedes registrar tu acción sin foto. Si adjuntas una, procura no mostrar a otras personas sin su permiso.</p>
      <input type="file" id="ownPhoto" accept="image/*">
      <p class="field-help">Por ahora la foto solo se ve en tu pantalla; no se sube ni se guarda.</p>
      <div id="ownPhotoPreview"></div>
      <label class="check-label"><input type="checkbox" id="ownVoluntary"> Fue una acción voluntaria y no un castigo o una tarea impuesta.</label>
      <label class="check-label"><input type="checkbox" id="ownHonest"> Prometo que de verdad hice esta acción.</label>
      <label class="check-label"><input type="checkbox" id="ownShare" checked> Compartirla en la comunidad para inspirar a otros.</label>
      <div class="notice">Un responsable de Olami ORT la verifica antes de sumar los puntos. Si la compartes, pasa por revisión antes de publicarse. Repetir una publicación no multiplica los puntos.</div>
      <button class="primary" id="ownSubmit" type="submit">Registrar mi acción <span>↗</span></button>
      ${locked ? `<div class="locked-cover"><span>🔒 Entra con tu cuenta para registrar tu acción</span><button type="button" class="primary dark" data-act="login">Acceso Olami ORT ↗</button></div>` : ''}
    </form>`;
  }

  function reviewHtml() {
    const mine = myPosts();
    const label = { pending: 'EN REVISIÓN', approved: 'PUBLICADA', rejected: 'NO APROBADA' };
    return `<section class="review-box">
      <div class="section-head"><div><h2>Mis acciones en revisión</h2><p>Repetir una publicación no multiplica los puntos.</p></div><span class="category">${Store.mode === 'local' ? 'DEMO LOCAL' : 'EN LÍNEA'}</span></div>
      ${mine.length ? mine.map(p => `
        <div class="review-row">
          <strong>${esc(catById(p.category)?.name || 'Buena acción')}</strong><span class="status ${p.status}">${label[p.status] || p.status}</span>
          <p>${esc(p.content)}</p>
          <small>${timeAgo(p.createdAt)}</small>
        </div>`).join('')
        : `<p class="empty-line">${state.user ? 'Aquí aparecerán las acciones que compartas con la comunidad.' : 'Entra con tu cuenta para ver tus acciones.'}</p>`}
      <div class="notice">Un responsable de Olami ORT revisa cada publicación antes de mostrarla. Las palabras ofensivas, links y teléfonos se bloquean automáticamente.</div>
    </section>`;
  }

  function recognitionHtml() {
    const top = state.leaders[0];
    return `<section class="recognition">
      <div>
        <div class="eyebrow">RECONOCIMIENTOS DEL MES</div>
        <h2>El bien también se celebra.</h2>
        <p>Constancia, impacto y acciones aprobadas.<br>Reconocimiento en ceremonias de Olami ORT.</p>
        <button class="primary" data-act="go-leaders">Conocer a los destacados <span>↗</span></button>
      </div>
      <div class="diploma-mini">
        <span>✧</span>
        <small>OLAMI ORT · JESED</small>
        <strong>Alumno del mes</strong>
        <p>${top ? esc(top.name) : 'Buenas acciones'}</p>
        <small>${top ? `${top.points} PUNTOS ESTA SEMANA` : 'EJEMPLO DE DIPLOMA'}</small>
      </div>
    </section>`;
  }

  function postHtml(p, compact = false) {
    const cat = catById(p.category);
    const mine = state.user && same(p.userId, state.user.id);
    const approved = p.status === 'approved';
    return `<article class="post">
      <div class="post-head">
        <span class="avatar">${esc(initial(p.authorName))}</span>
        <div><strong>${esc(p.authorName)}</strong><small>${cat ? esc(cat.name) + ' · ' : ''}${timeAgo(p.createdAt)}</small></div>
        ${!approved ? `<span class="status ${p.status}">${p.status === 'pending' ? 'EN REVISIÓN' : 'NO APROBADA'}</span>` : ''}
      </div>
      <p>${esc(p.content)}</p>
      <div class="post-actions">
        <button class="like ${p.likedByMe ? 'liked' : ''}" data-act="like" data-post="${esc(p.id)}" ${approved ? '' : 'disabled'}>♡ Me inspira · ${p.likes}</button>
        ${compact ? '' : mine
          ? `<button class="mini-link" data-act="delete-post" data-post="${esc(p.id)}">Borrar</button>`
          : `<button class="mini-link" data-act="report" data-post="${esc(p.id)}" ${p.reportedByMe ? 'disabled' : ''}>${p.reportedByMe ? 'Reportada' : 'Reportar'}</button>`}
      </div>
    </article>`;
  }

  const SLOTS = { stats: statsHtml, streak: streakHtml, composer: composerHtml, review: reviewHtml, recognition: recognitionHtml };

  /* ---------------------------------------------------------- Render */
  function renderAll() { renderChrome(); renderRoute(); }

  function renderChrome() {
    const active = state.challenges.filter(c => c.status === 'accepted').length;
    $('#navCount').textContent = active;
    $('#sideAvatar').textContent = state.user ? initial(state.user.name) : 'T';
    $('#authSlot').innerHTML = state.user
      ? `<span class="access-btn" style="color:var(--ink)">Hola, ${esc(firstName(state.user.name))}</span>`
      : `<button class="access-btn" data-act="login">Acceso Olami ORT ↗</button>`;
    $$('.admin-link').forEach(a => { a.hidden = !state.user?.isAdmin; });
  }

  function renderCeremony() {
    const target = new Date(CEREMONY.date);
    const diff = target - Date.now();
    const when = target.toLocaleString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    let clock;
    if (diff > 0) {
      const d = Math.floor(diff / 864e5), h = Math.floor(diff / 36e5) % 24, m = Math.floor(diff / 6e4) % 60;
      clock = `<div class="ceremony-clock"><div><strong>${d}</strong><span>DÍAS</span></div><b>:</b><div><strong>${String(h).padStart(2, '0')}</strong><span>HORAS</span></div><b>:</b><div><strong>${String(m).padStart(2, '0')}</strong><span>MINUTOS</span></div></div>`;
    } else {
      clock = `<div class="ceremony-clock"><div><strong>🎉</strong><span>¡YA LLEGÓ!</span></div></div>`;
    }
    $('#ceremony').innerHTML = `
      <div class="ceremony-info">
        <div class="eyebrow">PRÓXIMA CEREMONIA${CEREMONY.example ? ' · FECHA DE EJEMPLO' : ''}</div>
        <h2>${esc(CEREMONY.title)}</h2>
        <p>${esc(when)}</p>
        <small>${esc(CEREMONY.note)}</small>
      </div>
      <div>${clock}${CEREMONY.example ? '<p class="ceremony-status">Cuenta regresiva de demostración · no es una fecha oficial.</p>' : ''}</div>`;
  }

  function onRoute() {
    const r = location.hash.replace(/^#/, '');
    state.route = ROUTES.includes(r) ? r : 'inicio';
    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + state.route; });
    $$('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === state.route));
    window.scrollTo(0, 0);
    renderRoute();
    if (['inicio', 'comunidad', 'perfil'].includes(state.route)) {
      refreshPosts().then(() => { renderRoute(); doScroll(); });
    } else doScroll();
  }

  function doScroll() {
    if (!state.scrollTo) return;
    const el = document.getElementById(state.scrollTo);
    state.scrollTo = null;
    if (el) setTimeout(() => el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }), 60);
  }

  function renderSlots() {
    const view = $('#view-' + state.route);
    // Conserva lo que el usuario esté escribiendo en el formulario
    const draft = $('#ownForm') ? {
      title: $('#ownTitle').value, cat: $('#ownCat').value, desc: $('#ownDesc').value,
      vol: $('#ownVoluntary').checked, share: $('#ownShare').checked, photo: $('#ownPhotoPreview').innerHTML
    } : null;
    $$('[data-slot]').forEach(el => {
      el.innerHTML = el.closest('.view') === view ? SLOTS[el.dataset.slot]() : '';
    });
    if ($('#ownForm')) {
      if (draft) {
        $('#ownTitle').value = draft.title; $('#ownCat').value = draft.cat; $('#ownDesc').value = draft.desc;
        $('#ownVoluntary').checked = draft.vol; $('#ownShare').checked = draft.share; $('#ownPhotoPreview').innerHTML = draft.photo;
      }
      if (state.prefill) {
        $('#ownTitle').value = state.prefill.title.slice(0, 60);
        if (state.prefill.cat) $('#ownCat').value = state.prefill.cat;
        state.prefill = null;
        setTimeout(() => $('#ownDesc').focus(), 120);
      }
      $('#ownCounter').textContent = `${$('#ownDesc').value.length}/200`;
    }
  }

  function renderRoute() {
    renderSlots();
    switch (state.route) {
      case 'inicio': renderHome(); break;
      case 'explorar': renderExplore(); break;
      case 'retos': renderRetos(); break;
      case 'comunidad': renderCommunity(); break;
      case 'perfil': renderProfile(); break;
      case 'admin': renderAdmin(); break;
    }
  }

  function renderHome() {
    const daily = todaysDaily();
    const featured = [daily, ...ACTIONS.filter(a => a.id !== daily.id && !activeRow(a.id))].slice(0, 3);
    $('#homeCards').innerHTML = featured.map(card).join('');
    const today = dayKey(new Date());
    const doneToday = state.challenges.some(x => x.status === 'completed' && x.isDaily && dayKey(x.completedAt) === today);
    const row = activeRow(daily.id);
    $('#dailyCard').innerHTML = `
      <div class="eyebrow">☀ EL RETO DE HOY · +${DAILY_BONUS} BONUS</div>
      <h3>${esc(daily.title)}.</h3>
      <p>${esc(daily.desc)}</p>
      ${doneToday ? '<span class="done-note">✓ ¡Ya cumpliste el reto de hoy! Mañana hay otro.</span>'
        : row ? `<button class="primary dark" data-act="complete" data-row="${esc(row.id)}">Ya lo hice ✓</button>`
        : `<button class="primary dark" data-act="accept" data-id="${daily.id}">Aceptar reto diario ↗</button>`}`;
    const approved = state.posts.filter(p => p.status === 'approved').slice(0, 2);
    $('#homePosts').innerHTML = approved.map(p => postHtml(p, true)).join('');
  }

  function renderExplore() {
    $('#filters').innerHTML = [{ id: 'todas', name: 'Todas' }, ...CATEGORIES]
      .map(c => `<button class="filter ${state.cat === c.id ? 'active' : ''}" data-act="cat" data-cat="${c.id}">${esc(c.name)}</button>`).join('');
    const q = norm(state.q.trim());
    const list = ACTIONS.filter(a => (state.cat === 'todas' || a.category === state.cat)
      && (!q || norm(`${a.title} ${a.desc} ${catById(a.category).name}`).includes(q)));
    $('#results').innerHTML = list.length ? list.map(card).join('')
      : '<div class="empty"><h3>No encontramos acciones con esa búsqueda.</h3><p>Prueba otra palabra o cambia la categoría.</p></div>';
  }

  function renderRetos() {
    const active = state.challenges.filter(c => c.status === 'accepted');
    $('#activeTitle').textContent = `Retos en curso · ${active.length}`;
    $('#activeCards').innerHTML = active.length
      ? active.map(r => actionById(r.actionId)).filter(Boolean).map(card).join('')
      : `<div class="empty"><h3>Tu próximo gesto te está esperando.</h3><p>Elige una acción y vuelve aquí cuando la hayas realizado.</p><a class="primary" href="#explorar">Explorar acciones ↗</a></div>`;
  }

  function renderCommunity() {
    const feed = state.posts.filter(p => p.status === 'approved');
    $('#feed').innerHTML = feed.length ? feed.map(p => postHtml(p)).join('')
      : '<div class="empty"><h3>Todavía no hay historias publicadas.</h3><p>Sé la primera persona en inspirar a la comunidad.</p></div>';
    const medals = ['🥇', '🥈', '🥉'];
    $('#destacados').innerHTML = `
      <h2>Destacados de la semana</h2>
      <p class="empty-line" style="font-style:normal">Quienes más bien han hecho en los últimos 7 días.</p>
      ${state.leaders.length ? state.leaders.map((r, i) => `
        <div class="winner-row"><span>${medals[i] || i + 1}</span><div><strong>${esc(r.name)}</strong><small>${plural(r.actions, 'acción', 'acciones')}</small></div><b>${r.points} pts</b></div>`).join('')
        : '<p class="empty-line">Aún no hay acciones esta semana. ¡Tu nombre puede ser el primero!</p>'}`;
  }

  function renderProfile() {
    const top = $('#profileTop'), body = $('#profileBody');
    if (!state.user) {
      top.innerHTML = `<div class="profile-card"><span class="avatar">T</span><div><h2>Tu espacio Jesed</h2><p>Entra con tu cuenta para guardar tus puntos, insignias e historial.</p></div><button class="primary" data-act="login">Acceso Olami ORT ↗</button></div>`;
      body.innerHTML = '';
      return;
    }
    const s = computeStats();
    const lv = levelInfo(s.points);
    const earned = earnedBadgeIds(s);
    const pending = myPosts().filter(p => p.status === 'pending').length;
    const inReview = state.challenges.filter(c => c.status === 'review');
    const rejected = state.challenges.filter(c => c.status === 'rejected');
    top.innerHTML = `
      <div class="profile-card">
        <span class="avatar">${esc(initial(state.user.name))}</span>
        <div>
          <h2>${esc(state.user.name)}</h2>
          <p>Miembro de la comunidad · Colegio Olami ORT${state.user.isAdmin ? ' · Moderador' : ''}</p>
          <div class="level-line"><span>${lv.cur.icon} Nivel ${esc(lv.cur.name)}</span><span>${lv.next ? `${lv.next.min - s.points} pts para ${esc(lv.next.name)}` : 'Nivel máximo'}</span></div>
          <div class="progress"><span style="width:${lv.pct}%"></span></div>
        </div>
        <button class="text-btn" data-act="logout">Cerrar sesión</button>
      </div>
      <div class="profile-summary">
        <div><div class="eyebrow">TU ACTIVIDAD</div><h3>🔥 ${plural(s.streak, 'día', 'días')} de racha</h3>
        <p>${s.points} puntos · ${plural(s.done.length, 'acción completada', 'acciones completadas')} · ${plural(inReview.length, 'acción por verificar', 'acciones por verificar')} · ${pending} publicaciones en revisión</p></div>
        <button class="primary" data-act="go-form">Registrar mi acción <span>↗</span></button>
      </div>`;
    body.innerHTML = `
      <div class="section-head"><h2>Tus insignias</h2></div>
      <div class="badge-grid">${BADGES.map(b => `
        <div class="badge-card ${earned.has(b.id) ? 'earned' : 'locked'}"><div>${b.icon}</div><h3>${esc(b.name)}</h3><p>${earned.has(b.id) ? '✓ Desbloqueada' : esc(b.desc)}</p></div>`).join('')}</div>
      ${inReview.length || rejected.length ? `<h2 class="subhead">Esperando verificación</h2>
      <div class="history">${[...inReview, ...rejected].map(h => `
        <div class="history-row"><span>${h.status === 'review' ? '⏳' : '✕'} ${esc(h.title)}<small>${fmtDate(h.completedAt)} · ${h.status === 'review' ? 'Un responsable la está revisando' : 'No fue aprobada'}</small></span><span>${h.status === 'review' ? `+${h.points} por confirmar` : '0 puntos'}</span></div>`).join('')}</div>` : ''}
      <h2 class="subhead">Tu historia de buenas acciones</h2>
      <div class="history">${s.done.length ? s.done.map(h => `
        <div class="history-row"><span>✓ ${esc(h.title)}<small>${fmtDate(h.completedAt)}${h.isDaily ? ' · Reto de hoy' : ''}${h.actionId === 'custom' ? ' · Acción propia' : ''}</small></span><span>+${h.points} puntos</span></div>`).join('')
        : '<p class="empty-line">Tu historia empieza con tu primera acción.</p>'}</div>
      ${Store.mode === 'local' ? '<div class="notice">Modo demo: tu cuenta y tu progreso se guardan únicamente en este navegador. Conecta la base de datos para cuentas reales.</div>' : ''}`;
  }

  async function renderAdmin() {
    const el = $('#adminContent');
    if (!state.user?.isAdmin) {
      el.innerHTML = '<div class="empty"><h3>Solo para moderadores.</h3><p>Esta sección es para el equipo que cuida la comunidad.</p></div>';
      return;
    }
    el.innerHTML = '<p class="empty-line">Cargando…</p>';
    try {
      const [toVerify, list] = await Promise.all([Store.listToVerify(), Store.listPending()]);
      el.innerHTML = `<section class="review-box">
        <div class="section-head"><div><h2>Acciones por verificar · ${toVerify.length}</h2><p>Los puntos solo se suman cuando apruebas. Si algo no parece real, recházalo.</p></div></div>
        ${toVerify.length ? toVerify.map(c => `
          <div class="review-row">
            <strong>${esc(c.authorName || 'Miembro')}</strong><span class="status">+${c.points} PTS</span>${c.actionId === 'custom' ? '<span class="status">ACCIÓN PROPIA</span>' : ''}
            <p><b>${esc(c.title)}</b><br>${esc(c.evidence || 'Sin descripción')}</p>
            <small>${esc(catById(c.category)?.name || '')} · aceptado ${timeAgo(c.acceptedAt)} · enviado ${timeAgo(c.completedAt)}</small>
            ${same(c.userId, state.user.id)
              ? '<p class="field-help">Es tu propia acción: la tiene que aprobar otro moderador.</p>'
              : `<div class="review-controls">
              <button class="accept go" data-act="verify-ok" data-row="${esc(c.id)}">Aprobar puntos</button>
              <button class="accept" data-act="verify-no" data-row="${esc(c.id)}">Rechazar</button>
            </div>`}
          </div>`).join('') : '<p class="empty-line">No hay acciones esperando verificación.</p>'}
      </section>
      <section class="review-box">
        <div class="section-head"><div><h2>Por revisar · ${list.length}</h2><p>Aprueba lo que inspire y respete a todos.</p></div></div>
        ${list.length ? list.map(p => `
          <div class="review-row">
            <strong>${esc(p.authorName)}</strong><span class="status">EN REVISIÓN</span>${p.reports ? `<span class="status rejected">${plural(p.reports, 'reporte', 'reportes')}</span>` : ''}
            <p>${esc(p.content)}</p>
            <small>${esc(catById(p.category)?.name || '')} · ${timeAgo(p.createdAt)}</small>
            <div class="review-controls">
              <button class="accept go" data-act="approve" data-post="${esc(p.id)}">Aprobar</button>
              <button class="accept" data-act="reject" data-post="${esc(p.id)}">Rechazar</button>
              <button class="mini-link link-danger" data-act="admin-delete" data-post="${esc(p.id)}">Eliminar</button>
            </div>
          </div>`).join('') : '<p class="empty-line">Todo al día. ¡Gracias por cuidar la comunidad!</p>'}
      </section>`;
    } catch (e) { el.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; }
  }

  /* ---------------------------------------------------------- Acciones de comunidad */
  async function submitOwn(e) {
    e.preventDefault();
    if (!state.user) { openAuth('login'); return; }
    const title = $('#ownTitle').value.trim();
    const category = $('#ownCat').value;
    const desc = $('#ownDesc').value.trim();
    const share = $('#ownShare').checked;
    if (title.length < 3) { toast('Ponle un título a tu acción.', 'error'); $('#ownTitle').focus(); return; }
    if (!Moderation.isClean(title)) { toast('Tu título tiene palabras que no van con el espíritu de Jesed.', 'error'); return; }
    const check = Moderation.check(desc);
    if (!check.ok) { toast(check.reason, 'error'); $('#ownDesc').focus(); return; }
    const evErr = evidenceError(desc);
    if (evErr) { toast(evErr, 'error'); $('#ownDesc').focus(); return; }
    if (!$('#ownVoluntary').checked) { toast('Confirma que fue una acción voluntaria.', 'error'); return; }
    if (!$('#ownHonest').checked) { toast('Confirma que de verdad hiciste esta acción.', 'error'); return; }
    if (limitReached()) return;

    const btn = $('#ownSubmit');
    btn.disabled = true;
    try {
      const row = await Store.addCustom(state.user.id, { text: title, category, points: CUSTOM_POINTS, evidence: desc });
      state.challenges.unshift(row);
      let shared = false;
      if (share) {
        try { await Store.createPost(state.user, { content: `${title} — ${desc}`, category }); shared = true; }
        catch (err) { toast(`Tu acción se guardó, pero no se pudo compartir: ${err.message}`, 'error'); }
      }
      $('#ownForm').reset();
      $('#ownPhotoPreview').innerHTML = '';
      await refreshPosts();
      sentForReview(row, { shared });
      renderAll();
    } catch (err) {
      toast(err.message, 'error');
    } finally { if (btn.isConnected) btn.disabled = false; }
  }

  async function toggleLike(postId) {
    if (!state.user) { openAuth('login'); return; }
    const p = state.posts.find(x => same(x.id, postId));
    if (!p) return;
    const liked = p.likedByMe;
    p.likedByMe = !liked; p.likes += liked ? -1 : 1;
    renderRoute();
    try { await Store.toggleLike(state.user.id, p.id, liked); }
    catch (e) { p.likedByMe = liked; p.likes += liked ? 1 : -1; renderRoute(); toast(e.message, 'error'); }
  }

  async function report(postId) {
    if (!state.user) { openAuth('login'); return; }
    if (!(await askConfirm('¿Reportar esta publicación? Si varias personas la reportan, se oculta hasta que la revise un responsable.', 'Reportar'))) return;
    closeModal('dialog');
    try {
      await Store.reportPost(state.user.id, postId);
      toast('Gracias por avisar. Un responsable lo revisará.');
      await refreshPosts();
      renderRoute();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function deletePost(postId, fromAdmin = false) {
    if (!(await askConfirm('¿Borrar esta publicación? No se puede deshacer.', 'Borrar'))) return;
    closeModal('dialog');
    try {
      await Store.deletePost(postId);
      toast('Publicación borrada.');
      if (fromAdmin) renderAdmin(); else { await refreshPosts(); renderRoute(); }
    } catch (e) { toast(e.message, 'error'); }
  }

  async function verify(rowId, approve) {
    try {
      await Store.verifyChallenge(rowId, approve);
      toast(approve ? 'Puntos aprobados ✓' : 'Acción rechazada.');
      await loadUserData();
      renderAdmin();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function moderate(postId, status) {
    try {
      await Store.setPostStatus(postId, status);
      toast(status === 'approved' ? 'Publicación aprobada ✓' : 'Publicación rechazada.');
      renderAdmin();
    } catch (e) { toast(e.message, 'error'); }
  }

  function goForm(prefill) {
    state.prefill = prefill || null;
    state.scrollTo = 'ownForm';
    closeModal('dialog');
    if (state.route === 'comunidad') { renderRoute(); doScroll(); } else location.hash = '#comunidad';
  }

  /* ---------------------------------------------------------- Eventos */
  function bindEvents() {
    document.addEventListener('click', async (e) => {
      const closer = e.target.closest('[data-close]');
      if (closer) { closeModal(closer.dataset.close); return; }
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      const busy = async (fn) => { el.disabled = true; try { await fn(); } finally { if (el.isConnected) el.disabled = false; } };

      switch (el.dataset.act) {
        case 'discover': discover(); break;
        case 'accept': await busy(() => accept(el.dataset.id)); break;
        case 'complete': await busy(() => complete(el.dataset.row)); break;
        case 'cancel': await cancel(el.dataset.row); break;
        case 'confirm-yes': if (state.confirmResolve) { const r = state.confirmResolve; state.confirmResolve = null; r(true); } break;
        case 'login': closeModal('dialog'); openAuth('login'); break;
        case 'register': openAuth('register'); break;
        case 'auth-mode': setAuthMode(el.dataset.mode); break;
        case 'logout': await logout(); break;
        case 'cat': state.cat = el.dataset.cat; renderExplore(); break;
        case 'like': await toggleLike(el.dataset.post); break;
        case 'report': await report(el.dataset.post); break;
        case 'delete-post': await deletePost(el.dataset.post); break;
        case 'approve': await busy(() => moderate(el.dataset.post, 'approved')); break;
        case 'reject': await busy(() => moderate(el.dataset.post, 'rejected')); break;
        case 'admin-delete': await deletePost(el.dataset.post, true); break;
        case 'verify-ok': await busy(() => verify(el.dataset.row, true)); break;
        case 'verify-no': await busy(() => verify(el.dataset.row, false)); break;
        case 'go-form': goForm(); break;
        case 'share-done': {
          const row = state.challenges.find(c => c.title === el.dataset.title);
          goForm({ title: el.dataset.title, cat: row?.category });
          break;
        }
        case 'go-feed': $('#feedHead').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }); break;
        case 'go-leaders':
          state.scrollTo = 'destacados';
          if (state.route === 'comunidad') doScroll(); else location.hash = '#comunidad';
          break;
      }
    });

    document.addEventListener('submit', (e) => {
      if (e.target.id === 'ownForm') submitOwn(e);
      if (e.target.id === 'verifyForm') submitVerify(e);
      if (e.target.id === 'authForm') submitAuth(e);
    });

    document.addEventListener('input', (e) => {
      if (e.target.id === 'ownDesc') $('#ownCounter').textContent = `${e.target.value.length}/200`;
      if (e.target.id === 'searchInput') { state.q = e.target.value; renderExplore(); }
    });

    document.addEventListener('change', (e) => {
      if (e.target.id !== 'ownPhoto') return;
      const file = e.target.files && e.target.files[0];
      const box = $('#ownPhotoPreview');
      if (!file) { box.innerHTML = ''; return; }
      if (!file.type.startsWith('image/')) { toast('Elige una imagen.', 'error'); e.target.value = ''; return; }
      const reader = new FileReader();
      reader.onload = () => { box.innerHTML = `<img class="evidence-photo" src="${reader.result}" alt="Vista previa de tu foto">`; };
      reader.readAsDataURL(file);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $$('.modal').filter(m => !m.hidden).forEach(m => closeModal(m.id));
    });

    window.addEventListener('hashchange', onRoute);
  }

  async function init() {
    bindEvents();
    renderCeremony();
    setInterval(renderCeremony, 30000);
    try {
      await Store.init();
      state.user = await Store.getUser();
      await loadUserData();
    } catch (e) {
      console.error(e);
      toast('No pudimos cargar tus datos. Revisa tu conexión.', 'error');
    }
    if (Store.mode === 'local') {
      $('#modeTag').title = 'Modo demo: el progreso se guarda en este navegador';
      $('#authModeNote').textContent = 'Modo demo: tu cuenta y tu progreso se guardan solo en este navegador. La primera cuenta creada es moderadora.';
    }
    renderChrome();
    onRoute();

    Store.onAuthChange(() => setTimeout(async () => {
      const u = await Store.getUser();
      if ((u?.id || null) !== (state.user?.id || null)) {
        state.user = u;
        await loadUserData();
        await refreshPosts();
        renderAll();
      }
    }, 0));
  }

  init();
})();
