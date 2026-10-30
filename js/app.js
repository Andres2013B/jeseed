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
    confirmResolve: null,
    sec: 'todas',          // filtro de sección en Comunidad ('todas', id de sección o 'guardadas')
    openComments: new Set(),
    comments: {},
    gallery: [],
    galleryIndex: 0,
    galleryPaused: false,
    campaigns: [],         // retos creados por maestros
    ceremony: null,        // ceremonia guardada por un moderador
    ranking: []            // copa de secciones del mes
  };

  /* ---------------------------------------------------------- Utilidades */
  const catById = id => CATEGORIES.find(c => c.id === id);
  const allActions = () => [...state.campaigns, ...ACTIONS];
  const actionById = id => allActions().find(a => a.id === id);
  const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const initial = name => (String(name || 'T').trim()[0] || 'T').toUpperCase();
  const firstName = name => String(name || '').trim().split(/\s+/)[0];
  const same = (a, b) => String(a) === String(b);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const secById = id => SECTIONS.find(s => s.id === id);

  /* Preferencias de cada persona en este navegador (meta, guardadas, avisos vistos) */
  const prefKey = k => `jesed_${k}_${state.user?.id || 'anon'}`;
  function pref(k, d) { try { const v = JSON.parse(localStorage.getItem(prefKey(k))); return v ?? d; } catch { return d; } }
  function setPref(k, v) { try { localStorage.setItem(prefKey(k), JSON.stringify(v)); } catch { /* nada */ } }

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
    $('#authTitle').textContent = reg ? 'Únete a Maayan Jessed' : 'Qué gusto verte de nuevo';
    $('#authSubtitle').textContent = reg ? 'Crea tu cuenta para guardar tus retos, puntos e insignias.' : 'Entra para seguir sumando buenas acciones.';
    $('#nameField').hidden = !reg;
    $('#sectionField').hidden = !reg;
    $('#forgotBtn').hidden = reg;
    if (!$('#authSection').options.length) {
      $('#authSection').innerHTML = '<option value="">Elige tu sección…</option>'
        + SECTIONS.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
        + '<option value="staff">Maestro / staff</option>';
    }
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
    const section = $('#authSection').value;
    const errEl = $('#authError');
    errEl.textContent = '';
    if (reg && !section) { errEl.textContent = 'Elige tu sección.'; return; }
    if (reg && name.length < 2) { errEl.textContent = 'Escribe tu nombre (mínimo 2 letras).'; return; }
    if (reg && !Moderation.isClean(name)) { errEl.textContent = 'Elige un nombre respetuoso, por favor.'; return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { errEl.textContent = 'Escribe un correo válido.'; return; }
    if (!isSchoolEmail(email)) { errEl.textContent = SCHOOL_EMAIL_ERROR; return; }
    if (password.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }

    const btn = $('#authSubmit');
    btn.disabled = true;
    try {
      const res = reg ? await Store.signUp({ name, email, password, section }) : await Store.signIn({ email, password });
      if (res.needsConfirm) {
        closeModal('authModal');
        toast('📬 Te mandamos un correo para confirmar tu cuenta. Después entra con tu correo y contraseña.');
        return;
      }
      state.user = res.user;
      await loadUserData();
      closeModal('authModal');
      toast(reg ? `¡Bienvenido a Maayan Jessed, ${firstName(state.user.name)}! 💜` : `¡Hola de nuevo, ${firstName(state.user.name)}!`);
      await refreshPosts();
      renderAll();
      renderGallery();
      if (state.pendingAction) {
        const id = state.pendingAction;
        state.pendingAction = null;
        await accept(id);
      }
    } catch (err) {
      errEl.textContent = err.message || 'Algo salió mal. Inténtalo de nuevo.';
      if (/confirma tu correo/i.test(errEl.textContent)) {
        errEl.insertAdjacentHTML('beforeend', ' <button type="button" class="text-btn" data-act="resend-confirm">Reenviar correo de confirmación ↗</button>');
      }
    } finally { btn.disabled = false; }
  }

  async function logout() {
    await Store.signOut();
    state.user = null;
    state.challenges = [];
    toast('Cerraste sesión. ¡Nos vemos pronto!');
    renderGallery();
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
    try { state.ranking = await Store.sectionRanking(); }
    catch (e) { state.ranking = []; }
    refreshGalleryIfChanged();
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

  /* Fotos de evidencia: se achican antes de subirlas (solo las ven los moderadores) */
  const photos = { ownPhoto: null, verifyPhoto: null, galleryPhoto: null };

  function shrinkImage(file, max = 1280) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo leer la foto.')), 'image/jpeg', 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la foto.')); };
      img.src = url;
    });
  }

  function photoField(id) {
    return `<label class="lbl" for="${id}">Foto de evidencia <span class="optional">· opcional</span></label>
      <p class="field-help">Solo la ven los moderadores. Procura no mostrar la cara de otras personas sin su permiso.</p>
      <input type="file" id="${id}" accept="image/*">
      <div id="${id}Preview"></div>`;
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
    photos.verifyPhoto = null;
    showDialog(`
      <div class="eyebrow">VERIFICACIÓN</div>
      <h2>${esc(row.title)}</h2>
      <p>Cuéntanos qué hiciste. Un responsable de Olami ORT lo revisa antes de sumar tus puntos.</p>
      <form id="verifyForm" data-row="${esc(row.id)}" novalidate>
        <label class="lbl" for="verifyText">¿Qué hiciste, con quién y cuándo?</label>
        <textarea id="verifyText" maxlength="280" placeholder="Por ejemplo: hoy en el recreo ayudé a Daniel de 2°B a repasar fracciones para su examen."></textarea>
        ${photoField('verifyPhoto')}
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
      const upd = await Store.completeChallenge(state.user.id, row.id, { points, isDaily, evidence, photo: photos.verifyPhoto });
      photos.verifyPhoto = null;
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
    const pool = allActions().filter(a => a.id !== state.lastRandom);
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
        ${a.endsAt ? `<div class="daily-mark campaign-mark">📣 RETO DE MAESTROS · HASTA ${esc(fmtDay(a.endsAt).toUpperCase())}</div>` : ''}
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
      ${photoField('ownPhoto')}
      <label class="check-label"><input type="checkbox" id="ownVoluntary"> Fue una acción voluntaria y no un castigo o una tarea impuesta.</label>
      <label class="check-label"><input type="checkbox" id="ownHonest"> Prometo que de verdad hice esta acción.</label>
      <label class="check-label"><input type="checkbox" id="ownShare" checked> Compartirla en la comunidad para inspirar a otros.</label>
      <label class="check-label"><input type="checkbox" id="ownAnon"> Publicar sin mi nombre (aparece como “Anónimo”).</label>
      <label class="check-label"><input type="checkbox" id="ownSharePhoto" checked> Si compartes, mostrar también la foto en la comunidad y en la galería (después de revisión).</label>
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
        <small>OLAMI ORT · MAAYAN JESSED</small>
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
    const sec = secById(p.section);
    const saved = pref('saved', []).includes(String(p.id));
    const open = state.openComments.has(String(p.id));
    return `<article class="post">
      <div class="post-head">
        <span class="avatar ${p.anonymous ? 'anon' : ''}">${p.anonymous ? '✧' : esc(initial(p.authorName))}</span>
        <div><strong>${esc(p.authorName)}</strong><small>${sec ? `<i class="sec-dot" style="background:${sec.color}"></i>${esc(sec.name)} · ` : ''}${cat ? esc(cat.name) + ' · ' : ''}${timeAgo(p.createdAt)}</small></div>
        ${!approved ? `<span class="status ${p.status}">${p.status === 'pending' ? 'EN REVISIÓN' : 'NO APROBADA'}</span>` : ''}
      </div>
      <p>${esc(p.content)}</p>
      ${p.photoUrl ? `<img class="post-photo" src="${esc(p.photoUrl)}" alt="Foto de la buena acción" loading="lazy">` : ''}
      <div class="post-actions">
        <button class="like ${p.likedByMe ? 'liked' : ''}" data-act="like" data-post="${esc(p.id)}" ${approved ? '' : 'disabled'}>♡ Me inspira · ${p.likes}</button>
        ${approved ? `<button class="like ${open ? 'on' : ''}" data-act="comments" data-post="${esc(p.id)}">💬 ${p.comments || 0}</button>
        <button class="like ${saved ? 'on' : ''}" data-act="save" data-post="${esc(p.id)}" aria-pressed="${saved}">${saved ? '★ Guardada' : '☆ Guardar'}</button>` : ''}
        ${compact ? '' : mine
          ? `<button class="mini-link" data-act="delete-post" data-post="${esc(p.id)}">Borrar</button>`
          : `<button class="mini-link" data-act="report" data-post="${esc(p.id)}" ${p.reportedByMe ? 'disabled' : ''}>${p.reportedByMe ? 'Reportada' : 'Reportar'}</button>`}
      </div>
      ${open ? commentsHtml(p) : ''}
    </article>`;
  }

  function commentsHtml(p) {
    const list = state.comments[p.id];
    return `<div class="comments">
      ${!list ? '<p class="empty-line">Cargando comentarios…</p>'
        : list.length ? list.map(c => `
          <div class="comment"><span class="avatar">${esc(initial(c.authorName))}</span>
            <div><strong>${esc(c.authorName)}</strong> <small>${timeAgo(c.createdAt)}</small><p>${esc(c.content)}</p></div>
            ${state.user && (same(c.userId, state.user.id) || state.user.isAdmin) ? `<button class="mini-link" data-act="del-comment" data-post="${esc(p.id)}" data-id="${esc(c.id)}">Borrar</button>` : ''}
          </div>`).join('')
        : '<p class="empty-line">Sé la primera persona en dejar un mensaje bonito.</p>'}
      ${state.user
        ? `<form class="comment-form" data-post="${esc(p.id)}"><input class="search" name="c" maxlength="280" placeholder="Escribe algo que anime…" autocomplete="off"><button class="accept go">Enviar</button></form>`
        : '<button class="text-btn" data-act="login">Entra para comentar ↗</button>'}
    </div>`;
  }

  /* Meta semanal: cuántas acciones quiero enviar esta semana */
  function weekStart() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  function goalHtml() {
    if (!state.user) return '';
    const goal = pref('goal', 3);
    const since = weekStart();
    const done = state.challenges.filter(c => (c.status === 'review' || c.status === 'completed') && c.completedAt && new Date(c.completedAt) >= since).length;
    const pct = Math.min(100, Math.round(done / goal * 100));
    return `<section class="goal">
      <div class="goal-ring" style="--p:${pct}"><strong>${Math.min(done, goal)}<small>/${goal}</small></strong></div>
      <div class="goal-copy">
        <div class="eyebrow">MI META DE LA SEMANA</div>
        <h3>${done >= goal ? '¡Meta cumplida! 🎉' : `${plural(goal - done, 'acción más', 'acciones más')} para tu meta`}</h3>
        <div class="goal-pick" role="group" aria-label="Cambiar meta semanal">
          ${[1, 2, 3, 4, 5, 7].map(n => `<button class="${n === goal ? 'active' : ''}" data-act="goal" data-n="${n}" aria-pressed="${n === goal}">${n}</button>`).join('')}
        </div>
      </div>
    </section>`;
  }

  /* Copa de secciones: puntos aprobados de cada sección este mes */
  function cupHtml() {
    const month = new Date().toLocaleDateString('es-MX', { month: 'long' });
    const rows = SECTIONS.map(s => ({ ...s, ...(state.ranking.find(r => r.section === s.id) || { points: 0, actions: 0 }) }))
      .sort((a, b) => b.points - a.points);
    const max = Math.max(1, ...rows.map(r => r.points));
    const mine = state.user?.section;
    return `<section class="cup">
      <div class="cup-head"><div><div class="eyebrow">🏆 COPA DE SECCIONES · ${esc(month.toUpperCase())}</div>
        <h2>${rows[0].points ? `¡${esc(rows[0].name)} va a la cabeza!` : '¿Qué sección empieza a sumar?'}</h2>
        <p>Cada acción aprobada suma puntos a tu sección. Se reinicia cada mes.</p></div></div>
      <div class="cup-rows">${rows.map((r, i) => `
        <div class="cup-row ${r.id === mine ? 'mine' : ''}">
          <span class="cup-pos">${r.points && i === 0 ? '🏆' : i + 1}</span>
          <span class="cup-name">${esc(r.name)}${r.id === mine ? '<small>Tu sección</small>' : ''}</span>
          <span class="cup-bar"><i style="width:${Math.round(r.points / max * 100)}%;background:${r.color}"></i></span>
          <b>${r.points} pts</b>
        </div>`).join('')}</div>
    </section>`;
  }

  const SLOTS = { cup: cupHtml, goal: goalHtml, stats: statsHtml, streak: streakHtml, composer: composerHtml, review: reviewHtml, recognition: recognitionHtml };

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
    const n = noticeList().filter(x => x.fresh).length;
    $('#noticeCount').textContent = n;
    $('#noticeCount').hidden = !n;
  }

  function renderCeremony() {
    const C = { ...CEREMONY, ...(state.ceremony || {}) };
    $('#ceremony').hidden = !!C.hidden || !C.date;
    if ($('#ceremony').hidden) return;
    const target = new Date(C.date);
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
        <div class="eyebrow">PRÓXIMA CEREMONIA${C.example ? ' · FECHA DE EJEMPLO' : ''}</div>
        <h2>${esc(C.title)}</h2>
        <p>${esc(when)}</p>
        <small>${esc(C.note)}</small>
      </div>
      <div>${clock}${C.example ? '<p class="ceremony-status">Cuenta regresiva de demostración · no es una fecha oficial.</p>' : ''}</div>`;
  }

  function onRoute() {
    toggleMenu(false);
    const r = location.hash.replace(/^#/, '');
    state.route = ROUTES.includes(r) ? r : 'inicio';
    $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + state.route; });
    $$('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === state.route));
    window.scrollTo(0, 0);
    renderRoute();
    if (['inicio', 'comunidad', 'perfil'].includes(state.route)) {
      refreshPosts().then(() => { renderAll(); doScroll(); });
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
    $('#campaignsHome').innerHTML = state.campaigns.length ? `
      <section class="campaigns">
        <div class="section-head"><div><span class="eyebrow">📣 RETOS DE LOS MAESTROS</span><h2>Esta temporada en Olami ORT</h2><p>Retos especiales con fecha límite. ¡Súmate antes de que terminen!</p></div>
        ${state.campaigns.length > 3 ? '<button class="text-btn" data-act="cat-maestros">Ver todos ↗</button>' : ''}</div>
        <div class="grid">${state.campaigns.slice(0, 3).map(card).join('')}</div>
      </section>` : '';
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
    $('#filters').innerHTML = [{ id: 'todas', name: 'Todas' }, ...(state.campaigns.length ? [{ id: 'maestros', name: '📣 Retos de maestros' }] : []), ...CATEGORIES]
      .map(c => `<button class="filter ${state.cat === c.id ? 'active' : ''}" data-act="cat" data-cat="${c.id}">${esc(c.name)}</button>`).join('');
    const q = norm(state.q.trim());
    const list = allActions().filter(a => (state.cat === 'todas' || (state.cat === 'maestros' ? a.endsAt : a.category === state.cat))
      && (!q || norm(`${a.title} ${a.desc} ${catById(a.category).name}`).includes(q)));
    $('#results').innerHTML = list.length ? list.map(card).join('')
      : '<div class="empty"><h3>No encontramos acciones con esa búsqueda.</h3><p>Prueba otra palabra o cambia la categoría.</p></div>';
  }

  function renderRetos() {
    const active = state.challenges.filter(c => c.status === 'accepted');
    $('#activeTitle').textContent = `Retos en curso · ${active.length}`;
    const count = st => state.challenges.filter(c => c.status === st).length;
    $('#retosSummary').innerHTML = state.user
      ? `<span><b>${active.length}</b> por hacer</span><span><b>${count('review')}</b> en revisión</span><span><b>${count('completed')}</b> aprobadas</span><span><b>${count('rejected')}</b> no aprobadas</span>`
      : '';
    $('#activeCards').innerHTML = active.length
      ? active.map(r => actionById(r.actionId)).filter(Boolean).map(card).join('')
      : `<div class="empty"><h3>Tu próximo gesto te está esperando.</h3><p>Elige una acción y vuelve aquí cuando la hayas realizado.</p><a class="primary" href="#explorar">Explorar acciones ↗</a></div>`;
  }

  function renderCommunity() {
    const chips = [{ id: 'todas', name: 'Todas' }, ...SECTIONS, { id: 'guardadas', name: '★ Guardadas' }];
    $('#sectionFilters').innerHTML = chips.map(c => `<button class="filter ${state.sec === c.id ? 'active' : ''}" data-act="sec" data-sec="${c.id}">${c.color ? `<i class="sec-dot" style="background:${c.color}"></i>` : ''}${esc(c.name)}</button>`).join('');
    const saved = pref('saved', []);
    const feed = state.posts.filter(p => p.status === 'approved'
      && (state.sec === 'todas' || (state.sec === 'guardadas' ? saved.includes(String(p.id)) : p.section === state.sec)));
    $('#feed').innerHTML = feed.length ? feed.map(p => postHtml(p)).join('')
      : `<div class="empty"><h3>${state.sec === 'guardadas' ? 'Aún no guardas publicaciones.' : 'Todavía no hay historias aquí.'}</h3><p>${state.sec === 'guardadas' ? 'Toca ☆ Guardar en las que te inspiren para tenerlas a la mano.' : 'Sé la primera persona en inspirar a la comunidad.'}</p></div>`;
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
          <label class="sec-select">Sección:
            <select id="profileSection">
              <option value="">Sin elegir</option>
              ${SECTIONS.map(s => `<option value="${s.id}" ${state.user.section === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
              <option value="staff" ${state.user.section === 'staff' ? 'selected' : ''}>Maestro / staff</option>
            </select>
          </label>
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
      const [toVerify, list, feedback] = await Promise.all([Store.listToVerify(), Store.listPending(), Store.listFeedback().catch(() => [])]);
      el.innerHTML = `<section class="review-box">
        <div class="section-head"><div><h2>Acciones por verificar · ${toVerify.length}</h2><p>Los puntos solo se suman cuando apruebas. Si algo no parece real, recházalo.</p></div></div>
        ${toVerify.length ? toVerify.map(c => `
          <div class="review-row">
            <strong>${esc(c.authorName || 'Miembro')}</strong><span class="status">+${c.points} PTS</span>${c.actionId === 'custom' ? '<span class="status">ACCIÓN PROPIA</span>' : ''}
            <p><b>${esc(c.title)}</b><br>${esc(c.evidence || 'Sin descripción')}</p>
            ${c.photoUrl ? `<a href="${esc(c.photoUrl)}" target="_blank" rel="noopener"><img class="evidence-photo" src="${esc(c.photoUrl)}" alt="Foto de evidencia de ${esc(c.authorName || 'el alumno')}"></a>` : '<small>Sin foto</small><br>'}
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
            ${p.photoUrl ? `<img class="evidence-photo" src="${esc(p.photoUrl)}" alt="Foto que se publicará"><p class="field-help">📸 Si apruebas, esta foto se ve en la comunidad y en la galería. Revisa que nadie salga sin permiso.</p>` : ''}
            <small>${esc(catById(p.category)?.name || '')} · ${timeAgo(p.createdAt)}</small>
            <div class="review-controls">
              <button class="accept go" data-act="approve" data-post="${esc(p.id)}">Aprobar</button>
              <button class="accept" data-act="reject" data-post="${esc(p.id)}">Rechazar</button>
              <button class="mini-link link-danger" data-act="admin-delete" data-post="${esc(p.id)}">Eliminar</button>
            </div>
          </div>`).join('') : '<p class="empty-line">Todo al día. ¡Gracias por cuidar la comunidad!</p>'}
      </section>
      <section class="review-box">
        <div class="section-head"><div><h2>Retos de maestros · ${state.campaigns.length}</h2><p>Crea retos especiales con fecha límite. Aparecen en “Mi día” y en Explorar para todos.</p></div></div>
        <form id="campaignForm" class="admin-form" novalidate>
          <div class="admin-grid">
            <label><span>Ícono</span><input class="search" id="campIcon" maxlength="4" value="📣"></label>
            <label class="wide"><span>Título del reto</span><input class="search" id="campTitle" maxlength="60" placeholder="Por ejemplo: Colecta de invierno"></label>
          </div>
          <label><span>¿Qué hay que hacer?</span><input class="search" id="campDesc" maxlength="160" placeholder="Trae una cobija o suéter en buen estado al salón antes del viernes."></label>
          <div class="admin-grid three">
            <label><span>Categoría</span><select class="search" id="campCat">${CATEGORIES.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
            <label><span>Puntos</span><select class="search" id="campPoints"><option>10</option><option selected>15</option><option>20</option></select></label>
            <label><span>Termina el</span><input class="search" type="date" id="campEnd" min="${new Date().toISOString().slice(0, 10)}"></label>
          </div>
          <button class="primary dark" id="campSubmit" type="submit">Crear reto <span>＋</span></button>
        </form>
        ${state.campaigns.map(c => `
          <div class="review-row"><strong>${esc(c.icon)} ${esc(c.title)}</strong><span class="status">HASTA ${esc(fmtDay(c.endsAt).toUpperCase())}</span><span class="status approved">+${c.points} PTS</span>
            <p>${esc(c.desc)}</p>
            <button class="mini-link link-danger" data-act="camp-del" data-id="${esc(c.id)}">Quitar reto</button></div>`).join('')}
      </section>
      <section class="review-box">
        <div class="section-head"><div><h2>Ceremonia de reconocimiento</h2><p>Cambia la fecha y el texto de la cuenta regresiva que ven todos arriba.</p></div></div>
        ${(() => {
          const C = { ...CEREMONY, ...(state.ceremony || {}) };
          const local = C.date ? new Date(new Date(C.date).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
          return `<form id="ceremonyForm" class="admin-form" novalidate>
            <label><span>Título</span><input class="search" id="cerTitle" maxlength="70" value="${esc(C.title)}"></label>
            <div class="admin-grid">
              <label><span>Fecha y hora</span><input class="search" type="datetime-local" id="cerDate" value="${local}"></label>
              <label class="wide"><span>Nota</span><input class="search" id="cerNote" maxlength="120" value="${esc(C.note)}"></label>
            </div>
            <label class="check-label"><input type="checkbox" id="cerHidden" ${C.hidden ? 'checked' : ''}> Ocultar la cuenta regresiva por ahora</label>
            <button class="primary dark" type="submit">Guardar ceremonia ✓</button>
          </form>`;
        })()}
      </section>
      <section class="review-box">
        <div class="section-head"><div><h2>Fotos extra para la galería · ${state.gallery.length}</h2><p>La galería de “Mi día” se llena sola con las fotos de las publicaciones que apruebas. Aquí puedes agregar fotos de actividades del colegio (Eishel, DAR…).</p></div></div>
        <form id="galleryForm" class="gallery-form" novalidate>
          ${photoField('galleryPhoto').replace('Foto de evidencia', 'Foto').replace('Solo la ven los moderadores. ', '')}
          <label class="lbl" for="galleryTitle">Programa o actividad</label>
          <input class="search" id="galleryTitle" maxlength="40" placeholder="Por ejemplo: Eishel">
          <label class="lbl" for="galleryCaption">Descripción corta</label>
          <input class="search" id="galleryCaption" maxlength="90" placeholder="Por ejemplo: Visita a la casa de abuelos">
          <button class="primary dark" id="gallerySubmit" type="submit" style="margin-top:16px">Agregar a la galería <span>＋</span></button>
        </form>
        <div class="gallery-admin">${state.gallery.map(g => `
          <figure><img src="${esc(g.url)}" alt="${esc(g.title)}"><figcaption>${esc(g.title)}<button class="mini-link link-danger" data-act="gallery-del" data-id="${esc(g.id)}">Quitar</button></figcaption></figure>`).join('')}</div>
      </section>
      <section class="review-box">
        <div class="section-head"><div><h2>Opiniones · ${feedback.length}</h2><p>Lo que la comunidad nos dice para mejorar.</p></div></div>
        ${feedback.length ? feedback.map(f => `<div class="review-row"><strong>${esc(f.authorName)}</strong><p>${esc(f.content)}</p><small>${timeAgo(f.createdAt)}</small></div>`).join('')
          : '<p class="empty-line">Todavía no hay opiniones.</p>'}
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
      const photo = photos.ownPhoto;
      const row = await Store.addCustom(state.user.id, { text: title, category, points: CUSTOM_POINTS, evidence: desc, photo });
      photos.ownPhoto = null;
      state.challenges.unshift(row);
      let shared = false;
      if (share) {
        try {
          await Store.createPost(state.user, {
            content: `${title} — ${desc}`, category, anonymous: $('#ownAnon').checked,
            photo: $('#ownSharePhoto').checked ? photo : null
          });
          shared = true;
        }
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

  /* ---------------------------------------------------------- Comentarios y guardadas */
  async function toggleComments(postId) {
    const id = String(postId);
    if (state.openComments.has(id)) { state.openComments.delete(id); renderRoute(); return; }
    state.openComments.add(id);
    renderRoute();
    try { state.comments[id] = await Store.listComments(id); }
    catch (e) { state.comments[id] = []; toast(e.message, 'error'); }
    renderRoute();
  }

  async function submitComment(form) {
    const id = form.dataset.post;
    const input = form.elements.c;
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    try {
      await Store.addComment(state.user, id, text);
      state.comments[id] = await Store.listComments(id);
      const p = state.posts.find(x => same(x.id, id));
      if (p) p.comments = state.comments[id].length;
      renderRoute();
      $(`.comment-form[data-post="${CSS.escape(id)}"] input`)?.focus();
    } catch (e) { toast(e.message, 'error'); input.disabled = false; }
  }

  async function deleteComment(postId, commentId) {
    if (!(await askConfirm('¿Borrar este comentario?', 'Borrar'))) return;
    closeModal('dialog');
    try {
      await Store.deleteComment(commentId);
      state.comments[postId] = await Store.listComments(postId);
      const p = state.posts.find(x => same(x.id, postId));
      if (p) p.comments = state.comments[postId].length;
      renderRoute();
    } catch (e) { toast(e.message, 'error'); }
  }

  function toggleSave(postId) {
    if (!state.user) { openAuth('login'); return; }
    const id = String(postId);
    const saved = pref('saved', []);
    setPref('saved', saved.includes(id) ? saved.filter(x => x !== id) : [...saved, id]);
    toast(saved.includes(id) ? 'Quitada de tus guardadas.' : 'Guardada ★ La encuentras en Comunidad → Guardadas.');
    renderRoute();
  }

  /* ---------------------------------------------------------- Avisos */
  function noticeList() {
    if (!state.user) return [];
    const seen = pref('seen', []);
    const items = [];
    state.challenges.forEach(c => {
      if (c.status === 'completed') items.push({ key: `c:${c.id}:ok`, icon: '✅', text: `Aprobaron tu acción “${c.title}”: +${c.points} puntos.`, at: c.verifiedAt || c.completedAt });
      if (c.status === 'rejected') items.push({ key: `c:${c.id}:no`, icon: '✕', text: `Tu acción “${c.title}” no fue aprobada.`, at: c.verifiedAt || c.completedAt });
    });
    myPosts().forEach(p => {
      if (p.status === 'approved') items.push({ key: `p:${p.id}:ok`, icon: '📣', text: 'Tu publicación ya está en la comunidad.', at: p.createdAt });
      if (p.status === 'rejected') items.push({ key: `p:${p.id}:no`, icon: '✕', text: 'Una de tus publicaciones no fue aprobada.', at: p.createdAt });
    });
    return items.map(x => ({ ...x, fresh: !seen.includes(x.key) }))
      .sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 20);
  }

  function openNotices() {
    if (!state.user) { openAuth('login'); return; }
    const list = noticeList();
    showDialog(`
      <div class="eyebrow">AVISOS</div>
      <h2>Lo nuevo para ti</h2>
      ${list.length ? `<div class="notice-list">${list.map(n => `
        <div class="notice-item ${n.fresh ? 'fresh' : ''}"><span>${n.icon}</span><p>${esc(n.text)}<small>${timeAgo(n.at)}</small></p></div>`).join('')}</div>`
        : '<p>No hay avisos todavía. Cuando un responsable revise tus acciones, te avisamos aquí.</p>'}`);
    setPref('seen', list.map(n => n.key).concat(pref('seen', [])).slice(0, 300));
    renderChrome();
  }

  /* ---------------------------------------------------------- Menú "más", compartir y opiniones */
  function toggleMore(force) {
    const menu = $('#moreMenu');
    const show = force ?? menu.hidden;
    menu.hidden = !show;
    $('[data-act="more"]').setAttribute('aria-expanded', String(show));
  }

  async function shareApp() {
    toggleMore(false);
    const url = location.origin + location.pathname;
    const data = { title: 'Maayan Jessed · Olami ORT', text: 'Únete a Maayan Jessed: pequeñas acciones, grandes cambios.', url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(url);
      toast('Link copiado 🔗 ¡Compártelo!');
    } catch { toast(url); }
  }

  function openFeedback() {
    toggleMore(false);
    showDialog(`
      <div class="eyebrow">TU OPINIÓN</div>
      <h2>¿Cómo podemos mejorar?</h2>
      <p>Cuéntanos qué te gusta, qué no funciona o qué idea tienes. Lo leen los responsables.</p>
      <form id="feedbackForm" novalidate>
        <textarea id="feedbackText" maxlength="500" placeholder="Escribe aquí…"></textarea>
        <p class="form-error" id="feedbackError" role="alert"></p>
        <div class="dialog-actions"><button class="primary dark" type="submit">Enviar opinión ↗</button></div>
      </form>`);
    setTimeout(() => $('#feedbackText')?.focus(), 50);
  }

  async function submitFeedback(e) {
    e.preventDefault();
    const text = $('#feedbackText').value.trim();
    const check = Moderation.isClean(text);
    if (text.length < 5) { $('#feedbackError').textContent = 'Escribe un poco más.'; return; }
    if (!check) { $('#feedbackError').textContent = 'Usa palabras respetuosas, por favor.'; return; }
    try {
      await Store.sendFeedback(state.user, text);
      closeModal('dialog');
      toast('¡Gracias! Recibimos tu opinión 💜');
    } catch (err) { $('#feedbackError').textContent = err.message; }
  }

  /* ---------------------------------------------------------- Meta y sección */
  function setGoal(n) {
    setPref('goal', n);
    renderRoute();
  }

  async function setSection(section) {
    try {
      const u = await Store.updateProfile(state.user.id, { section });
      if (u) state.user = u;
      toast('Sección actualizada.');
      renderAll();
    } catch (e) { toast(e.message, 'error'); }
  }

  /* ---------------------------------------------------------- Galería "Jesed en acción" */
  let galleryTimer = null;

  async function loadGallery() {
    try { state.gallery = await Store.listGallery(); }
    catch { state.gallery = []; }
    renderGallery();
  }

  // Fotos de la galería: las que suben los moderadores + las de publicaciones aprobadas
  function galleryItems() {
    const fromPosts = state.posts
      .filter(p => p.status === 'approved' && p.photoUrl)
      .map(p => {
        const text = String(p.content || '');
        return { id: 'p' + p.id, url: p.photoUrl, title: p.authorName, caption: text.length > 90 ? text.slice(0, 88) + '…' : text, at: p.createdAt };
      });
    const curated = state.gallery.map(g => ({ ...g, at: g.createdAt }));
    return [...curated, ...fromPosts].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 24);
  }

  let galleryKey = '';
  function refreshGalleryIfChanged() {
    const key = galleryItems().map(g => g.id).join(',') + '|' + (state.user?.id || '');
    if (key !== galleryKey) renderGallery();
  }

  function renderGallery() {
    const box = $('#gallery');
    const list = galleryItems();
    galleryKey = list.map(g => g.id).join(',') + '|' + (state.user?.id || '');
    clearInterval(galleryTimer);
    if (!list.length) {
      box.hidden = false;
      box.innerHTML = `<div class="gallery-empty"><div class="eyebrow">JESED EN ACCIÓN</div><strong>📸 Aquí aparecerán las fotos de la comunidad</strong>
        <p>Comparte tu buena acción con una foto: cuando un responsable la apruebe, se verá en esta galería.</p>
        <button class="primary" data-act="go-form">Compartir con foto <span>↗</span></button></div>`;
      return;
    }
    box.hidden = false;
    state.galleryIndex %= list.length;
    const cur = list[state.galleryIndex];
    box.innerHTML = `
      <div class="gallery-head">
        <div><div class="eyebrow">JESED EN ACCIÓN · FOTOS DE LA COMUNIDAD</div><h2>${esc(cur.title)}</h2><p>${esc(cur.caption || '')}</p></div>
        <div class="gallery-ctrl">
          <button data-act="gallery-prev" aria-label="Foto anterior">‹</button>
          <button data-act="gallery-pause" aria-label="${state.galleryPaused ? 'Reproducir' : 'Pausar'}">${state.galleryPaused ? '▶' : 'Ⅱ'}</button>
          <button data-act="gallery-next" aria-label="Foto siguiente">›</button>
        </div>
      </div>
      <div class="gallery-strip">${list.map((g, i) => `
        <button class="polaroid ${i === state.galleryIndex ? 'current' : ''}" data-act="gallery-go" data-i="${i}" style="--tilt:${[-3, 2, -1.5, 3, -2.5][i % 5]}deg">
          <img src="${esc(g.url)}" alt="${esc(g.title)}${g.caption ? ': ' + esc(g.caption) : ''}" loading="lazy">
          <span>${esc(g.title)}</span>
        </button>`).join('')}</div>`;
    const curEl = box.querySelector('.polaroid.current');
    const strip = box.querySelector('.gallery-strip');
    if (curEl && strip) strip.scrollTo({ left: curEl.offsetLeft - (strip.clientWidth - curEl.clientWidth) / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
    if (!state.galleryPaused && !reduceMotion && list.length > 1) {
      galleryTimer = setInterval(() => { if (state.route === 'inicio' && !document.hidden) galleryGo(state.galleryIndex + 1); }, 4500);
    }
  }

  function galleryGo(i) {
    const n = galleryItems().length;
    if (!n) return;
    state.galleryIndex = (i + n) % n;
    renderGallery();
  }

  async function submitGallery(e) {
    e.preventDefault();
    const title = $('#galleryTitle').value.trim();
    const caption = $('#galleryCaption').value.trim();
    if (!photos.galleryPhoto) { toast('Elige una foto.', 'error'); return; }
    if (title.length < 2) { toast('Escribe el nombre del programa o actividad.', 'error'); return; }
    const btn = $('#gallerySubmit');
    btn.disabled = true;
    try {
      await Store.addGalleryPhoto(photos.galleryPhoto, { title, caption });
      photos.galleryPhoto = null;
      await loadGallery();
      toast('Foto agregada a la galería 📸');
      renderAdmin();
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  }

  async function deleteGallery(id) {
    if (!(await askConfirm('¿Quitar esta foto de la galería?', 'Quitar'))) return;
    closeModal('dialog');
    try { await Store.deleteGalleryPhoto(id); await loadGallery(); renderAdmin(); }
    catch (e) { toast(e.message, 'error'); }
  }

  /* ---------------------------------------------------------- Retos de maestros y ceremonia */
  async function loadCampaigns() {
    try { state.campaigns = await Store.listCampaigns(); }
    catch { state.campaigns = []; }
  }

  async function submitCampaign(e) {
    e.preventDefault();
    const c = {
      icon: $('#campIcon').value.trim() || '📣', title: $('#campTitle').value.trim(), desc: $('#campDesc').value.trim(),
      category: $('#campCat').value, points: Number($('#campPoints').value), endsAt: $('#campEnd').value
    };
    if (c.title.length < 3) { toast('Ponle un título al reto.', 'error'); return; }
    if (c.desc.length < 10) { toast('Explica qué hay que hacer (mínimo 10 letras).', 'error'); return; }
    if (!c.endsAt || c.endsAt < new Date().toISOString().slice(0, 10)) { toast('Elige una fecha de fin a partir de hoy.', 'error'); return; }
    if (!Moderation.isClean(`${c.title} ${c.desc}`)) { toast('Revisa las palabras del reto.', 'error'); return; }
    $('#campSubmit').disabled = true;
    try {
      await Store.addCampaign(c);
      await loadCampaigns();
      toast('Reto creado 📣 Ya lo ven todos.');
      renderAdmin();
    } catch (err) { toast(err.message, 'error'); $('#campSubmit').disabled = false; }
  }

  async function deleteCampaign(id) {
    if (!(await askConfirm('¿Quitar este reto? Quien ya lo aceptó lo conserva en su historial.', 'Quitar'))) return;
    closeModal('dialog');
    try { await Store.deleteCampaign(id); await loadCampaigns(); renderAdmin(); }
    catch (e) { toast(e.message, 'error'); }
  }

  async function submitCeremony(e) {
    e.preventDefault();
    const date = $('#cerDate').value;
    const value = {
      title: $('#cerTitle').value.trim() || CEREMONY.title,
      date: date ? new Date(date).toISOString() : '',
      note: $('#cerNote').value.trim(),
      hidden: $('#cerHidden').checked,
      example: false
    };
    try {
      await Store.saveCeremony(value);
      state.ceremony = value;
      renderCeremony();
      toast('Ceremonia guardada ✓');
    } catch (err) { toast(err.message, 'error'); }
  }

  /* ---------------------------------------------------------- Recuperar contraseña */
  function openForgot() {
    const email = $('#authEmail').value.trim();
    closeModal('authModal');
    showDialog(`
      <div class="eyebrow">RECUPERAR ACCESO</div>
      <h2>¿Olvidaste tu contraseña?</h2>
      <p>Escribe tu correo y te mandamos un link para crear una nueva.</p>
      <form id="forgotForm" novalidate>
        <label class="field"><span>Correo</span><input class="search" id="forgotEmail" type="email" autocomplete="email" value="${esc(email)}" placeholder="tu@correo.com"></label>
        <p class="form-error" id="forgotError" role="alert"></p>
        <div class="dialog-actions"><button class="primary dark" type="submit">Mandar link ↗</button><button type="button" class="text-btn" data-act="login">Volver a entrar</button></div>
      </form>`);
    setTimeout(() => $('#forgotEmail')?.focus(), 50);
  }

  async function submitForgot(e) {
    e.preventDefault();
    const email = $('#forgotEmail').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { $('#forgotError').textContent = 'Escribe un correo válido.'; return; }
    try {
      await Store.resetPassword(email);
      showDialog(`<div class="eyebrow">REVISA TU CORREO</div><h2>📬 Te mandamos un link</h2>
        <p>Si <b>${esc(email)}</b> tiene cuenta, te llegará un correo para crear una contraseña nueva. Revisa también la carpeta de spam.</p>
        <div class="dialog-actions"><button class="primary" data-close="dialog">Entendido</button></div>`);
    } catch (err) { $('#forgotError').textContent = err.message; }
  }

  function openNewPassword() {
    showDialog(`
      <div class="eyebrow">NUEVA CONTRASEÑA</div>
      <h2>Crea tu nueva contraseña</h2>
      <form id="newPassForm" novalidate>
        <label class="field"><span>Nueva contraseña</span><input class="search" id="newPass" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></label>
        <label class="field"><span>Repítela</span><input class="search" id="newPass2" type="password" autocomplete="new-password"></label>
        <p class="form-error" id="newPassError" role="alert"></p>
        <div class="dialog-actions"><button class="primary dark" type="submit">Guardar contraseña ✓</button></div>
      </form>`);
    setTimeout(() => $('#newPass')?.focus(), 50);
  }

  async function submitNewPassword(e) {
    e.preventDefault();
    const a = $('#newPass').value, b = $('#newPass2').value;
    const err = $('#newPassError');
    if (a.length < 6) { err.textContent = 'Mínimo 6 caracteres.'; return; }
    if (a !== b) { err.textContent = 'Las contraseñas no coinciden.'; return; }
    try {
      await Store.updatePassword(a);
      closeModal('dialog');
      history.replaceState(null, '', location.pathname + '#inicio');
      toast('¡Listo! Tu contraseña se cambió 🔑');
    } catch (e2) { err.textContent = e2.message; }
  }

  /* Menú lateral en celular */
  function toggleMenu(force) {
    const open = force ?? !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', open);
    $('.drawer-backdrop').hidden = !open;
    $('.menu-btn').setAttribute('aria-expanded', String(open));
  }

  /* ---------------------------------------------------------- Eventos */
  function bindEvents() {
    document.addEventListener('click', async (e) => {
      const closer = e.target.closest('[data-close]');
      if (closer) { closeModal(closer.dataset.close); return; }
      if (!e.target.closest('.more')) toggleMore(false);
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
        case 'sec': state.sec = el.dataset.sec; renderCommunity(); break;
        case 'forgot': openForgot(); break;
        case 'resend-confirm':
          await busy(async () => {
            try {
              await Store.resendConfirmation($('#authEmail').value.trim());
              $('#authError').textContent = '📬 Te reenviamos el correo. Revisa también la carpeta de spam.';
            } catch (err) { $('#authError').textContent = err.message; }
          });
          break;
        case 'menu': toggleMenu(); break;
        case 'menu-close': toggleMenu(false); break;
        case 'ideas': state.cat = 'todas'; state.q = ''; if ($('#searchInput')) $('#searchInput').value = ''; if (state.route === 'explorar') renderExplore(); break;
        case 'camp-del': await deleteCampaign(el.dataset.id); break;
        case 'cat-maestros': state.cat = 'maestros'; location.hash = '#explorar'; break;
        case 'comments': await toggleComments(el.dataset.post); break;
        case 'del-comment': await deleteComment(el.dataset.post, el.dataset.id); break;
        case 'save': toggleSave(el.dataset.post); break;
        case 'goal': setGoal(Number(el.dataset.n)); break;
        case 'notices': openNotices(); break;
        case 'more': toggleMore(); break;
        case 'share-app': await shareApp(); break;
        case 'feedback': openFeedback(); break;
        case 'gallery-prev': galleryGo(state.galleryIndex - 1); break;
        case 'gallery-next': galleryGo(state.galleryIndex + 1); break;
        case 'gallery-go': state.galleryPaused = true; galleryGo(Number(el.dataset.i)); break;
        case 'gallery-pause': state.galleryPaused = !state.galleryPaused; renderGallery(); break;
        case 'gallery-del': await deleteGallery(el.dataset.id); break;
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
      if (e.target.id === 'feedbackForm') submitFeedback(e);
      if (e.target.id === 'galleryForm') submitGallery(e);
      if (e.target.id === 'campaignForm') submitCampaign(e);
      if (e.target.id === 'ceremonyForm') submitCeremony(e);
      if (e.target.id === 'forgotForm') submitForgot(e);
      if (e.target.id === 'newPassForm') submitNewPassword(e);
      if (e.target.classList.contains('comment-form')) { e.preventDefault(); submitComment(e.target); }
    });

    document.addEventListener('input', (e) => {
      if (e.target.id === 'ownDesc') $('#ownCounter').textContent = `${e.target.value.length}/200`;
      if (e.target.id === 'searchInput') { state.q = e.target.value; renderExplore(); }
    });

    document.addEventListener('change', async (e) => {
      const id = e.target.id;
      if (id === 'profileSection') { await setSection(e.target.value); return; }
      if (!(id in photos)) return;
      const file = e.target.files && e.target.files[0];
      const box = $('#' + id + 'Preview');
      photos[id] = null;
      if (!file) { box.innerHTML = ''; return; }
      if (!file.type.startsWith('image/')) { toast('Elige una imagen.', 'error'); e.target.value = ''; box.innerHTML = ''; return; }
      try {
        photos[id] = await shrinkImage(file);
        box.innerHTML = `<img class="evidence-photo" src="${URL.createObjectURL(photos[id])}" alt="Vista previa de tu foto">`;
      } catch (err) { toast(err.message, 'error'); e.target.value = ''; box.innerHTML = ''; }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { $$('.modal').filter(m => !m.hidden).forEach(m => closeModal(m.id)); toggleMore(false); toggleMenu(false); }
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
      await Promise.all([
        loadUserData(),
        loadCampaigns(),
        Store.getCeremony().then(c => { state.ceremony = c; }).catch(() => {})
      ]);
      renderCeremony();
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
    loadGallery();
    if (Store.recovery) openNewPassword();

    Store.onAuthChange((event) => setTimeout(async () => {
      if (event === 'PASSWORD_RECOVERY' && !$('#newPassForm')) openNewPassword();
      const u = await Store.getUser();
      if ((u?.id || null) !== (state.user?.id || null)) {
        state.user = u;
        await loadUserData();
        await refreshPosts();
        renderAll();
        renderGallery();
      }
    }, 0));
  }

  init();
})();
