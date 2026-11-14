// ===== Online play outside claude.ai (GitHub Pages / local copy) =====
// Stands in for window.claude.use('room' | 'db' | 'user') on top of Supabase, so the game code is unchanged.
// Only active off claude.ai (github.io, localhost, file:) and only when the page has no window.claude of its own.
// Players sign in anonymously, then join a room with its passphrase (rpc join_room); the database rules in
// supabase/schema.sql decide who may read the leaderboard and join the private realtime channel ulr:<room>.
(function(){
  const SB_URL = 'https://wxrpcjxdqjkvocbbknql.supabase.co';
  const SB_KEY = 'sb_publishable_rLeYt495qhj6MVSizeWOCg_MO7BJhKm';      // publishable by design; the rules protect the data
  const SB_JS  = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js';
  const CFG_KEY = 'ulr3-online', TOPICS = ['st', 'ping'];
  const h = location.hostname;
  const offClaude = location.protocol === 'file:' || /(^|\.)github\.io$/.test(h) || h === 'localhost' || h === '127.0.0.1' || window.ULR_FORCE_NET;
  if (!offClaude || window.claude) return;
  // fewer, slower state messages than on claude.ai: Supabase's free plan counts every message delivered
  window.ULR_NET = { delay: 250, emitMs: 200, ping: false };

  const loadCfg = () => { try { const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); return c && c.room && c.pass && c.name ? c : null; } catch (e) { return null; } };
  const saveCfg = c => { try { c ? localStorage.setItem(CFG_KEY, JSON.stringify(c)) : localStorage.removeItem(CFG_KEY); } catch (e) {} };
  let cfg = loadCfg();

  let clientP = null;
  function client() {
    return clientP || (clientP = new Promise((res, rej) => {
      const make = () => res(window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ulr3-auth' } }));
      if (window.supabase && window.supabase.createClient) return make();
      const s = document.createElement('script'); s.src = SB_JS; s.onload = make; s.onerror = () => rej(new Error('could not load supabase-js'));
      document.head.appendChild(s);
    }));
  }
  let uidP = null;
  function signIn() {
    return uidP || (uidP = (async () => {
      const c = await client();
      let { data } = await c.auth.getSession();
      if (!data.session) { const r = await c.auth.signInAnonymously(); if (r.error) throw r.error; data = r.data; }
      return data.session.user.id;
    })().catch(e => { uidP = null; throw e; }));
  }
  async function joinRoom(room, pass, name) {
    const c = await client(); await signIn();
    const { data, error } = await c.rpc('join_room', { p_room: room, p_pass: pass, p_name: name });
    if (error) throw error; return data;
  }
  let memberP = null;   // resolves to the room id, or null when not joined / passphrase no longer valid
  function member() {
    return memberP || (memberP = cfg ? joinRoom(cfg.room, cfg.pass, cfg.name).catch(e => { console.warn('[online]', e && e.message); netState.err = (e && e.message) || String(e); paint(); return null; }) : Promise.resolve(null));
  }
  const netState = { room: null, err: '', live: 'off' };

  // ---- user ----
  async function makeUser() {
    const c = await client(), uid = await signIn(), room = await member();
    return {
      id: async () => uid,
      can: async () => !!room,
      profiles: async ids => {
        const out = {}; ids = [...new Set(ids)].filter(Boolean); if (!room || !ids.length) return out;
        const { data } = await c.from('pilots').select('user_id,name').in('user_id', ids);
        for (const r of data || []) out[r.user_id] = { name: r.name };
        return out;
      } };
  }
  // ---- db: just the bits the leaderboard uses: collection(c).orderBy('t').limit(n).onSnapshot / collection(c).doc(id).set ----
  async function makeDb() {
    const c = await client(); await signIn(); if (!(await member())) return null;
    const subs = new Set();
    async function fetchCol(col, n) {
      const { data, error } = await c.from('tt_runs').select('user_id,rec').eq('course', col).order('t').limit(n);
      if (error) throw error;
      return { metadata: { fromCache: false }, docs: (data || []).map(r => ({ id: r.user_id, exists: true, data: () => r.rec })) };
    }
    const refresh = col => { for (const s of subs) if (!col || s.col === col) fetchCol(s.col, s.n).then(s.cb, s.err || (() => {})); };
    setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    return { collection: col => {
      const q = { col, n: 25 };
      const api = {
        orderBy: () => api, limit: n => { q.n = n; return api; },
        onSnapshot: (cb, err) => { const s = { ...q, cb, err }; subs.add(s); fetchCol(s.col, s.n).then(cb, err || (() => {})); return () => subs.delete(s); },
        doc: id => ({ set: async rec => {
          const { error } = await c.from('tt_runs').upsert({ course: col, user_id: id, t: rec.t, rec, updated_at: new Date().toISOString() });
          if (error) { const e = new Error(error.message); e.code = error.code === '42501' ? 'permission_denied' : 'unavailable'; throw e; }
          refresh(col);
        } }) };
      return api;
    } };
  }
  // ---- room: one private broadcast channel per room; flight state travels as 'st' messages, presence = who is here ----
  async function makeRoom() {
    const c = await client(), uid = await signIn(), room = await member(); if (!room) return null;
    const self = 'p' + Math.random().toString(36).slice(2, 10);
    const handlers = {}, peerCbs = [], connCbs = [];
    let status = 'connecting', peerList = [];
    if (c.realtime && c.realtime.setAuth) { try { await c.realtime.setAuth(); } catch (e) {} }
    const ch = c.channel('ulr:' + room, { config: { private: true, broadcast: { self: false, ack: false }, presence: { key: self } } });
    for (const t of TOPICS) ch.on('broadcast', { event: t }, msg => {
      const p = msg && msg.payload; if (!p || p.p === self) return;
      const m = { peer: p.p, by: p.b, isMe: p.b === uid, sameTab: false, kind: 'user', data: p.d };
      for (const cb of handlers[t] || []) { try { cb(m); } catch (e) { console.error(e); } }
    });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState(), prev = new Map(peerList.map(p => [p.peer, p]));
      peerList = Object.entries(st).map(([key, metas]) => { const b = metas && metas[0] && metas[0].b;
        return { peer: key, by: b, isMe: b === uid, sameTab: key === self, kind: 'user', presence: {} }; });
      const now = new Set(peerList.map(p => p.peer));
      const change = { peers: peerList, joined: peerList.filter(p => !prev.has(p.peer)), left: [...prev.values()].filter(p => !now.has(p.peer)), updated: [] };
      for (const [cb] of peerCbs) { try { cb(change); } catch (e) { console.error(e); } }
      netState.peers = peerList.length; paint();
    });
    const setStatus = ok => { const was = status === 'ok'; status = ok ? 'ok' : 'down'; netState.live = status; paint();
      if (ok !== was) for (const [cb] of connCbs) { try { cb(ok); } catch (e) {} } };
    ch.subscribe((s, err) => {
      if (s === 'SUBSCRIBED') { setStatus(true); ch.track({ b: uid }).catch(() => {}); }
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') { if (err) netState.err = err.message || String(err); setStatus(false); }
    });
    const api = {
      on(topic, cb) { (handlers[topic] = handlers[topic] || []).push(cb); },
      async emit(topic, data) {
        if (topic === 'ping' && !window.ULR_NET.ping) return;          // diagnostics only; not worth the message quota
        if (status !== 'ok') { const e = new Error('not connected'); e.code = 'unavailable'; throw e; }
        const r = await ch.send({ type: 'broadcast', event: topic, payload: { p: self, b: uid, d: data } });
        if (r !== 'ok') { const e = new Error(String(r)); e.code = 'unavailable'; throw e; }
      },
      onPeers(cb, err) { peerCbs.push([cb, err]); },
      onConnection(cb, err) { connCbs.push([cb, err]); setTimeout(() => cb(status === 'ok'), 0); },
      peers: () => peerList,
      presence: async () => {},                                         // flight state goes in 'st' messages instead
      connected: () => status === 'ok',
      join: async () => api };
    return api;
  }

  const cache = {};
  window.claude = { use: k => cache[k] || (cache[k] = (k === 'room' ? makeRoom() : k === 'db' ? makeDb() : k === 'user' ? makeUser() : Promise.resolve(null))
    .catch(e => { console.warn('[online] ' + k + ':', e); netState.err = (e && e.message) || String(e); paint(); return null; })) };

  // ---- title-screen line + join form ----
  const css = document.createElement('style');
  css.textContent = `#netLine{margin:-4px 0 12px;font-size:13px;opacity:.85}#netLine button{padding:4px 10px;font-size:12px;margin-left:8px}
  #netForm{position:fixed;inset:0;z-index:12;display:flex;align-items:center;justify-content:center;background:rgba(10,25,35,.55)}
  #netForm .panel{max-width:380px;text-align:left}#netForm label{display:block;font-size:12px;letter-spacing:1px;opacity:.7;margin:12px 0 4px}
  #netForm input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;user-select:text;-webkit-user-select:text}
  #netForm .err{color:#ff9a7a;font-size:13px;min-height:18px;margin-top:10px}`;
  document.head.appendChild(css);
  let line = null;
  function paint() {
    if (!line) return;
    const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
    if (!cfg) line.innerHTML = '🌐 Play online with friends: <button class="alt" id="netJoin">JOIN A ROOM</button>';
    else if (netState.room === null && netState.err) line.innerHTML = '🌐 Couldn’t join <b>' + esc(cfg.room) + '</b>: ' + esc(netState.err) + ' <button class="alt" id="netJoin">CHANGE</button>';
    else line.innerHTML = '🌐 <b>' + esc(cfg.name) + '</b> in room <b>' + esc(cfg.room) + '</b> · ' + (netState.live === 'ok' ? 'connected' + (netState.peers ? ' · ' + netState.peers + ' here' : '') : netState.live === 'down' ? 'reconnecting…' : 'connecting…') + ' <button class="alt" id="netJoin">CHANGE</button>';
    const b = line.querySelector('#netJoin'); if (b) b.onclick = openForm;
  }
  function openForm() {
    if (document.getElementById('netForm')) return;
    const f = document.createElement('div'); f.id = 'netForm';
    f.innerHTML = `<div class="panel"><h2>PLAY ONLINE</h2><div class="best" style="opacity:.75">Ask whoever set up the game for the room name and passphrase.</div>
      <label>YOUR PILOT NAME</label><input id="nfName" maxlength="20" autocomplete="nickname">
      <label>ROOM</label><input id="nfRoom" maxlength="24" autocapitalize="off" spellcheck="false">
      <label>PASSPHRASE</label><input id="nfPass" type="password" autocapitalize="off" spellcheck="false">
      <div class="err" id="nfErr"></div>
      <div class="row"><button id="nfGo">JOIN</button><button class="alt" id="nfCancel">CANCEL</button>${cfg ? '<button class="alt" id="nfLeave">LEAVE</button>' : ''}</div></div>`;
    for (const ev of ['keydown', 'keyup', 'keypress']) f.addEventListener(ev, e => e.stopPropagation());   // keep typing away from the flight controls
    document.body.appendChild(f);
    const $ = id => f.querySelector('#' + id);
    $('nfName').value = (cfg && cfg.name) || ''; $('nfRoom').value = (cfg && cfg.room) || 'friends'; $('nfPass').value = (cfg && cfg.pass) || '';
    $('nfName').focus();
    $('nfCancel').onclick = () => f.remove();
    if ($('nfLeave')) $('nfLeave').onclick = () => { saveCfg(null); location.reload(); };
    const go = async () => {
      const c2 = { name: $('nfName').value.trim(), room: $('nfRoom').value.trim().toLowerCase(), pass: $('nfPass').value };
      if (!c2.name || !c2.room || !c2.pass) { $('nfErr').textContent = 'Fill in all three.'; return; }
      $('nfGo').disabled = true; $('nfErr').textContent = 'Joining…';
      try { await joinRoom(c2.room, c2.pass, c2.name); saveCfg(c2); location.reload(); }
      catch (e) { $('nfGo').disabled = false; $('nfErr').textContent = (e && e.message) || 'Could not join.'; }
    };
    $('nfGo').onclick = go; f.addEventListener('keydown', e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') f.remove(); });
  }
  const mount = () => {
    const sub = document.querySelector('#title .sub'); if (!sub) return;
    line = document.createElement('div'); line.id = 'netLine'; line.className = 'best'; sub.after(line); paint();
    member().then(r => { netState.room = r; paint(); });
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', mount) : mount();
})();
