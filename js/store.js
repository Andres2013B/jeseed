/* ==========================================================
   JESED · Capa de datos
   - Si js/config.js tiene datos de Supabase → base de datos real (cuentas, progreso y comunidad compartida).
   - Si no → MODO DEMO con localStorage (todo vive en este navegador).
   Ambas versiones exponen exactamente los mismos métodos.
   ========================================================== */
window.Store = (() => {
  const cfg = window.JESED_CONFIG || {};
  const hasSupabase = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient);
  return hasSupabase ? createSupabaseStore(cfg) : createLocalStore();

  /* ---------------------------------------------------------- MODO DEMO */
  function createLocalStore() {
    const K = {
      users: 'jesed_users', session: 'jesed_session', ch: 'jesed_challenges',
      posts: 'jesed_posts', likes: 'jesed_likes', reports: 'jesed_reports', seeded: 'jesed_seeded'
    };
    const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio o bloqueado */ } };
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const nowIso = () => new Date().toISOString();
    const pub = u => ({ id: u.id, name: u.name, email: u.email, isAdmin: !!u.isAdmin });
    const same = (a, b) => String(a) === String(b);
    const toDataUrl = blob => !blob ? Promise.resolve(null) : new Promise(res => {
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob);
    });

    async function hash(text) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('jesed:' + text));
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
      } catch { return 'plain:' + text; }
    }

    function seed() {
      if (read(K.seeded, false)) return;
      const h = 3600e3, t = Date.now();
      write(K.posts, [
        { id: 's1', userId: 'seed-1', authorName: 'Ana', category: 'amigos', status: 'approved', createdAt: new Date(t - 50 * h).toISOString(),
          content: 'En el recreo vi a un niño de primero jugando solo y lo invitamos a la cascarita. Al final ya era el capitán 😄' },
        { id: 's2', userId: 'seed-2', authorName: 'David', category: 'familia', status: 'approved', createdAt: new Date(t - 20 * h).toISOString(),
          content: 'Hoy le ayudé a mi abuela con el súper y me contó historias increíbles de cuando era joven. 10/10 recomiendo.' },
        { id: 's3', userId: 'seed-3', authorName: 'Sara', category: 'comunidad', status: 'approved', createdAt: new Date(t - 5 * h).toISOString(),
          content: 'Con mi grupo juntamos ropa que ya no usábamos y la llevamos a un albergue. Fue más fácil de lo que pensábamos.' }
      ]);
      write(K.likes, [
        { postId: 's1', userId: 'seed-2' }, { postId: 's1', userId: 'seed-3' }, { postId: 's2', userId: 'seed-3' },
        { postId: 's3', userId: 'seed-1' }, { postId: 's3', userId: 'seed-2' }
      ]);
      write(K.seeded, true);
    }

    function decoratePost(p, userId) {
      const likes = read(K.likes, []);
      const reports = read(K.reports, []);
      return {
        ...p,
        likes: likes.filter(l => same(l.postId, p.id)).length,
        likedByMe: !!userId && likes.some(l => same(l.postId, p.id) && same(l.userId, userId)),
        reportedByMe: !!userId && reports.some(r => same(r.postId, p.id) && same(r.userId, userId)),
        reports: reports.filter(r => same(r.postId, p.id)).length
      };
    }

    return {
      mode: 'local',
      async init() { seed(); },
      onAuthChange() { /* no aplica en modo demo */ },

      async getUser() {
        const id = read(K.session, null);
        const u = read(K.users, []).find(x => same(x.id, id));
        if (u && !isSchoolEmail(u.email)) { try { localStorage.removeItem(K.session); } catch { /* nada */ } return null; }
        return u ? pub(u) : null;
      },
      async signUp({ name, email, password }) {
        email = email.trim().toLowerCase();
        if (!isSchoolEmail(email)) throw new Error(SCHOOL_EMAIL_ERROR);
        const users = read(K.users, []);
        if (users.some(u => u.email === email)) throw new Error('Ya existe una cuenta con ese correo.');
        const u = { id: uid(), name: name.trim(), email, passHash: await hash(password), isAdmin: users.length === 0, createdAt: nowIso() };
        users.push(u);
        write(K.users, users);
        write(K.session, u.id);
        return { user: pub(u) };
      },
      async signIn({ email, password }) {
        email = email.trim().toLowerCase();
        if (!isSchoolEmail(email)) throw new Error(SCHOOL_EMAIL_ERROR);
        const u = read(K.users, []).find(x => x.email === email);
        if (!u || u.passHash !== await hash(password)) throw new Error('Correo o contraseña incorrectos.');
        write(K.session, u.id);
        return { user: pub(u) };
      },
      async signOut() { try { localStorage.removeItem(K.session); } catch { /* nada */ } },

      async getChallenges(userId) {
        return read(K.ch, []).filter(c => same(c.userId, userId))
          .sort((a, b) => new Date(b.acceptedAt) - new Date(a.acceptedAt));
      },
      async acceptChallenge(userId, action) {
        const all = read(K.ch, []);
        if (all.some(c => same(c.userId, userId) && c.actionId === action.id && c.status === 'accepted')) {
          throw new Error('Ya tienes este reto activo.');
        }
        const row = {
          id: uid(), userId, actionId: action.id, category: action.category, title: action.title,
          points: action.points, isDaily: false, status: 'accepted', acceptedAt: nowIso(), completedAt: null
        };
        all.push(row);
        write(K.ch, all);
        return row;
      },
      async completeChallenge(userId, rowId, { points, isDaily, evidence, photo }) {
        const photoData = await toDataUrl(photo);
        const all = read(K.ch, []);
        const row = all.find(c => same(c.id, rowId) && same(c.userId, userId));
        if (!row) throw new Error('No encontramos ese reto.');
        if (row.status !== 'accepted') throw new Error('Este reto ya fue enviado.');
        Object.assign(row, { status: 'review', points, isDaily, evidence, photo: photoData, completedAt: nowIso() });
        write(K.ch, all);
        return { ...row };
      },
      async addCustom(userId, { text, category, points, evidence, photo }) {
        const photoData = await toDataUrl(photo);
        const all = read(K.ch, []);
        const row = {
          id: uid(), userId, actionId: 'custom', category, title: text, points, evidence, photo: photoData,
          isDaily: false, status: 'review', acceptedAt: nowIso(), completedAt: nowIso()
        };
        all.push(row);
        write(K.ch, all);
        return { ...row };
      },
      async cancelChallenge(userId, rowId) {
        write(K.ch, read(K.ch, []).filter(c => !(same(c.id, rowId) && same(c.userId, userId) && c.status === 'accepted')));
      },

      async listToVerify() {
        const users = read(K.users, []);
        return read(K.ch, []).filter(c => c.status === 'review')
          .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt))
          .map(c => ({ ...c, photoUrl: c.photo || null, authorName: users.find(u => same(u.id, c.userId))?.name || 'Miembro' }));
      },
      async verifyChallenge(rowId, approve) {
        const all = read(K.ch, []);
        const row = all.find(c => same(c.id, rowId));
        if (!row || row.status !== 'review') throw new Error('Esta acción ya fue revisada.');
        Object.assign(row, { status: approve ? 'completed' : 'rejected', verifiedAt: nowIso() });
        write(K.ch, all);
      },

      async listPosts(userId) {
        return read(K.posts, [])
          .filter(p => p.status === 'approved' || (userId && same(p.userId, userId)))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 50)
          .map(p => decoratePost(p, userId));
      },
      async createPost(user, { content, category }) {
        const check = Moderation.check(content);
        if (!check.ok) throw new Error(check.reason);
        const posts = read(K.posts, []);
        const hourAgo = Date.now() - 3600e3;
        if (posts.filter(p => same(p.userId, user.id) && new Date(p.createdAt) > hourAgo).length >= 5) {
          throw new Error('Llegaste al límite de publicaciones por hora. ¡Intenta más tarde!');
        }
        posts.push({ id: uid(), userId: user.id, authorName: user.name, content: content.trim(), category: category || null, status: 'pending', createdAt: nowIso() });
        write(K.posts, posts);
      },
      async toggleLike(userId, postId, liked) {
        let likes = read(K.likes, []);
        if (liked) likes = likes.filter(l => !(same(l.postId, postId) && same(l.userId, userId)));
        else if (!likes.some(l => same(l.postId, postId) && same(l.userId, userId))) likes.push({ postId, userId });
        write(K.likes, likes);
      },
      async reportPost(userId, postId) {
        const reports = read(K.reports, []);
        if (!reports.some(r => same(r.postId, postId) && same(r.userId, userId))) reports.push({ postId, userId, createdAt: nowIso() });
        write(K.reports, reports);
        if (reports.filter(r => same(r.postId, postId)).length >= 3) {
          const posts = read(K.posts, []);
          const p = posts.find(x => same(x.id, postId));
          if (p) { p.status = 'pending'; write(K.posts, posts); }
        }
      },
      async deletePost(postId) {
        write(K.posts, read(K.posts, []).filter(p => !same(p.id, postId)));
      },

      async listPending() {
        return read(K.posts, []).filter(p => p.status === 'pending')
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
          .map(p => decoratePost(p, null));
      },
      async setPostStatus(postId, status) {
        const posts = read(K.posts, []);
        const p = posts.find(x => same(x.id, postId));
        if (p) { p.status = status; write(K.posts, posts); }
      },

      async leaderboard() {
        const since = Date.now() - 7 * 864e5;
        const users = read(K.users, []);
        const totals = {};
        read(K.ch, []).forEach(c => {
          if (c.status !== 'completed' || new Date(c.completedAt) < since) return;
          totals[c.userId] = totals[c.userId] || { points: 0, actions: 0 };
          totals[c.userId].points += c.points;
          totals[c.userId].actions += 1;
        });
        return Object.entries(totals)
          .map(([id, t]) => ({ name: users.find(u => same(u.id, id))?.name || 'Miembro', ...t }))
          .sort((a, b) => b.points - a.points).slice(0, 10);
      },
      async communityStats() {
        return {
          totalActions: read(K.ch, []).filter(c => c.status === 'completed').length,
          totalMembers: read(K.users, []).length
        };
      }
    };
  }

  /* ---------------------------------------------------------- SUPABASE */
  function createSupabaseStore(cfg) {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

    function friendly(msg = '') {
      const m = msg.toLowerCase();
      if (m.includes('database error saving new user')) return SCHOOL_DOMAIN ? SCHOOL_EMAIL_ERROR : 'No se pudo crear la cuenta. Inténtalo de nuevo.';
      if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
      if (m.includes('already registered')) return 'Ya existe una cuenta con ese correo.';
      if (m.includes('email not confirmed')) return 'Primero confirma tu correo (revisa tu bandeja de entrada).';
      if (m.includes('password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
      if (m.includes('rate limit')) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
      if (m.includes('failed to fetch')) return 'No hay conexión con el servidor. Revisa tu internet.';
      return msg || 'Algo salió mal. Inténtalo de nuevo.';
    }
    const fail = (error) => { if (error) throw new Error(friendly(error.message)); };

    async function profile(user) {
      const { data } = await sb.from('profiles').select('display_name,is_admin').eq('id', user.id).maybeSingle();
      return {
        id: user.id,
        email: user.email,
        name: data?.display_name || user.user_metadata?.display_name || (user.email || '').split('@')[0],
        isAdmin: !!data?.is_admin
      };
    }
    const mapCh = r => ({
      id: r.id, userId: r.user_id, actionId: r.action_id, category: r.category, title: r.title, points: r.points,
      isDaily: r.is_daily, status: r.status, acceptedAt: r.accepted_at, completedAt: r.completed_at,
      evidence: r.evidence, photoPath: r.photo_path
    });

    async function uploadPhoto(userId, blob) {
      if (!blob) return null;
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await sb.storage.from('evidencias').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw new Error('No se pudo subir la foto. Inténtalo de nuevo o envía sin foto.');
      return path;
    }
    const mapPost = (r, liked = new Set(), reported = new Set()) => ({
      id: r.id, userId: r.user_id, authorName: r.author_name, content: r.content, category: r.category,
      status: r.status, createdAt: r.created_at,
      likes: r.post_likes?.[0]?.count ?? 0,
      reports: r.post_reports?.[0]?.count ?? 0,
      likedByMe: liked.has(String(r.id)),
      reportedByMe: reported.has(String(r.id))
    });

    return {
      mode: 'supabase',
      async init() {},
      onAuthChange(cb) { sb.auth.onAuthStateChange((event) => cb(event)); },

      async getUser() {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return null;
        if (!isSchoolEmail(session.user.email)) { await sb.auth.signOut(); return null; }
        return profile(session.user);
      },
      async signUp({ name, email, password }) {
        if (!isSchoolEmail(email)) throw new Error(SCHOOL_EMAIL_ERROR);
        const { data, error } = await sb.auth.signUp({
          email, password,
          options: { data: { display_name: name }, emailRedirectTo: location.origin + location.pathname }
        });
        fail(error);
        if (!data.session) return { needsConfirm: true };
        return { user: await profile(data.user) };
      },
      async signIn({ email, password }) {
        if (!isSchoolEmail(email)) throw new Error(SCHOOL_EMAIL_ERROR);
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        fail(error);
        return { user: await profile(data.user) };
      },
      async signOut() { await sb.auth.signOut(); },

      async getChallenges(userId) {
        const { data, error } = await sb.from('user_challenges').select('*').eq('user_id', userId).order('accepted_at', { ascending: false });
        fail(error);
        return data.map(mapCh);
      },
      async acceptChallenge(userId, action) {
        const { data, error } = await sb.from('user_challenges')
          .insert({ action_id: action.id, category: action.category, title: action.title, points: action.points })
          .select().single();
        if (error && error.code === '23505') throw new Error('Ya tienes este reto activo.');
        fail(error);
        return mapCh(data);
      },
      async completeChallenge(userId, rowId, { points, isDaily, evidence, photo }) {
        const photo_path = await uploadPhoto(userId, photo);
        const { data, error } = await sb.from('user_challenges')
          .update({ status: 'review', points, is_daily: isDaily, evidence, photo_path })
          .eq('id', rowId).eq('status', 'accepted').select().single();
        fail(error);
        return mapCh(data);
      },
      async addCustom(userId, { text, category, points, evidence, photo }) {
        const photo_path = await uploadPhoto(userId, photo);
        const ins = await sb.from('user_challenges')
          .insert({ action_id: 'custom', category, title: text, points })
          .select('id').single();
        fail(ins.error);
        const { data, error } = await sb.from('user_challenges')
          .update({ status: 'review', points, evidence, photo_path })
          .eq('id', ins.data.id).select().single();
        fail(error);
        return mapCh(data);
      },
      async cancelChallenge(userId, rowId) {
        const { error } = await sb.from('user_challenges').delete().eq('id', rowId).eq('status', 'accepted');
        fail(error);
      },

      async listToVerify() {
        const { data, error } = await sb.from('user_challenges').select('*')
          .eq('status', 'review').order('completed_at', { ascending: true });
        fail(error);
        const ids = [...new Set(data.map(r => r.user_id))];
        const names = {};
        if (ids.length) {
          const res = await sb.from('profiles').select('id,display_name').in('id', ids);
          fail(res.error);
          res.data.forEach(p => { names[p.id] = p.display_name; });
        }
        const paths = data.map(r => r.photo_path).filter(Boolean);
        const urls = {};
        if (paths.length) {
          const res = await sb.storage.from('evidencias').createSignedUrls(paths, 3600);
          (res.data || []).forEach(x => { if (x.signedUrl) urls[x.path] = x.signedUrl; });
        }
        return data.map(r => ({ ...mapCh(r), authorName: names[r.user_id], photoUrl: urls[r.photo_path] || null }));
      },
      async verifyChallenge(rowId, approve) {
        const { error } = await sb.from('user_challenges')
          .update({ status: approve ? 'completed' : 'rejected' }).eq('id', rowId).eq('status', 'review');
        fail(error);
      },

      async listPosts(userId) {
        const { data, error } = await sb.from('posts')
          .select('id,user_id,author_name,content,category,status,created_at,post_likes(count)')
          .order('created_at', { ascending: false }).limit(50);
        fail(error);
        let liked = new Set(), reported = new Set();
        if (userId) {
          const [l, r] = await Promise.all([
            sb.from('post_likes').select('post_id').eq('user_id', userId),
            sb.from('post_reports').select('post_id').eq('user_id', userId)
          ]);
          liked = new Set((l.data || []).map(x => String(x.post_id)));
          reported = new Set((r.data || []).map(x => String(x.post_id)));
        }
        // Los admins pueden leer pendientes; en el feed solo mostramos aprobadas + las propias.
        return data
          .filter(p => p.status === 'approved' || (userId && p.user_id === userId))
          .map(p => mapPost(p, liked, reported));
      },
      async createPost(user, { content, category }) {
        const { error } = await sb.from('posts').insert({ content: content.trim(), category: category || null, author_name: user.name });
        fail(error);
      },
      async toggleLike(userId, postId, liked) {
        const q = liked
          ? sb.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId)
          : sb.from('post_likes').insert({ post_id: postId });
        const { error } = await q;
        if (error && error.code !== '23505') fail(error);
      },
      async reportPost(userId, postId) {
        const { error } = await sb.from('post_reports').insert({ post_id: postId });
        if (error && error.code !== '23505') fail(error);
      },
      async deletePost(postId) {
        const { error } = await sb.from('posts').delete().eq('id', postId);
        fail(error);
      },

      async listPending() {
        const { data, error } = await sb.from('posts')
          .select('id,user_id,author_name,content,category,status,created_at,post_reports(count)')
          .eq('status', 'pending').order('created_at', { ascending: true });
        fail(error);
        return data.map(p => mapPost(p));
      },
      async setPostStatus(postId, status) {
        const { error } = await sb.from('posts').update({ status }).eq('id', postId);
        fail(error);
      },

      async leaderboard() {
        const { data, error } = await sb.rpc('get_leaderboard');
        fail(error);
        return (data || []).map(r => ({ name: r.display_name, points: Number(r.points), actions: Number(r.actions) }));
      },
      async communityStats() {
        const { data, error } = await sb.rpc('community_stats');
        fail(error);
        const r = (data && data[0]) || {};
        return { totalActions: Number(r.total_actions || 0), totalMembers: Number(r.total_members || 0) };
      }
    };
  }
})();
