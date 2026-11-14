// A stand-in for supabase-js, just the parts net/supabase-shim.js uses, on the harness's virtual clock and bus.
// Broadcasts cross between clients on the same topic with 40–90 ms latency; it also counts billed messages
// the way Supabase does (1 per send + 1 per receiver) so tests can report the quota cost.
const ROOMS = { friends: 'pw' };
const shared = { pilots: {}, tt: {}, channels: [], presence: {}, billed: 0, sends: 0 };
function makeSupabase(bus, clock, clientId) {
  const uid = 'u' + clientId;
  let session = null;
  const auth = {
    async getSession() { return { data: { session } }; },
    async signInAnonymously() { session = { user: { id: uid } }; return { data: { session }, error: null }; } };
  async function rpc(fn, a) {
    if (fn !== 'join_room') return { data: null, error: { message: 'no such fn' } };
    if (!session) return { data: null, error: { message: 'not signed in' } };
    if (ROOMS[a.p_room] !== a.p_pass) return { data: null, error: { message: 'wrong room or passphrase' } };
    shared.pilots[uid] = { user_id: uid, room_id: a.p_room, name: a.p_name };
    return { data: a.p_room, error: null };
  }
  const member = () => shared.pilots[uid];
  function from(table) {
    const q = { table, filters: [], n: 1e9, order: null };
    const run = () => {
      if (!member()) return { data: [], error: null };
      let rows = table === 'pilots' ? Object.values(shared.pilots).filter(p => p.room_id === member().room_id) : Object.values(shared.tt);
      for (const [k, op, v] of q.filters) rows = rows.filter(r => op === 'in' ? v.includes(r[k]) : r[k] === v);
      if (q.order) rows = rows.slice().sort((a, b) => a[q.order] - b[q.order]);
      return { data: JSON.parse(JSON.stringify(rows.slice(0, q.n))), error: null };
    };
    const b = {
      select() { return b; }, in(k, v) { q.filters.push([k, 'in', v]); return b; }, eq(k, v) { q.filters.push([k, 'eq', v]); return b; },
      order(k) { q.order = k; return b; }, limit(n) { q.n = n; return b; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      async upsert(row) {
        if (!member() || row.user_id !== uid) return { error: { code: '42501', message: 'new row violates row-level security policy' } };
        shared.tt[row.course + '/' + row.user_id] = JSON.parse(JSON.stringify(row)); return { error: null };
      } };
    return b;
  }
  function channel(topic, opts) {
    const key = opts.config.presence.key, bc = {}, sync = [];
    const me = { topic, key, bc, sync, sub: false };
    const fireSync = () => { for (const c of shared.channels) if (c.topic === topic && c.sub) for (const cb of c.sync) cb(); };
    const api = {
      on(type, f, cb) { if (type === 'broadcast') (bc[f.event] = bc[f.event] || []).push(cb); else if (f.event === 'sync') sync.push(cb); return api; },
      subscribe(cb) {
        setTimeout(() => {
          if (!member() || 'ulr:' + member().room_id !== topic || !opts.config.private) { cb('CHANNEL_ERROR', new Error('Unauthorized')); return; }
          me.sub = true; shared.channels.push(me); cb('SUBSCRIBED');
        }, 5);
        return api; },
      async track(meta) { (shared.presence[topic] = shared.presence[topic] || {})[key] = [meta]; shared.billed++; fireSync(); return 'ok'; },
      presenceState() { return shared.presence[topic] || {}; },
      async send(m) {
        if (!me.sub) return 'error';
        shared.sends++; shared.billed++;
        const lat = 40 + Math.random() * 50, payload = JSON.parse(JSON.stringify(m.payload));
        for (const c of shared.channels) if (c !== me && c.topic === topic && c.sub) {
          shared.billed++;
          bus.q.push({ at: clock.t + lat, fn: () => { for (const cb of c.bc[m.event] || []) cb({ event: m.event, payload }); } });
        }
        return 'ok'; },
      unsubscribe() { me.sub = false; const p = shared.presence[topic]; if (p) delete p[key]; fireSync(); } };
    return api;
  }
  return { auth, rpc, from, channel, realtime: { setAuth: async () => {} } };
}
module.exports = { makeSupabase, shared };
