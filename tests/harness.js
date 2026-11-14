// Headless multi-client harness: N game pages in jsdom, a shared virtual clock, a mock live room
// (event messages cross between clients with 40–90 ms latency; presence never crosses, like Eric's real test).
const fs = require('fs'), { JSDOM } = require('jsdom');
const SRC = process.argv.includes('--src') ? process.argv[process.argv.indexOf('--src')+1] : require('path').join(__dirname,'..','index.html');
let html = fs.readFileSync(SRC, 'utf8');
html = html.replace('const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });',
  'const renderer = {setPixelRatio(){},setSize(){},render(){},shadowMap:{},domElement:canvas};');
html = html.replace(/requestAnimationFrame\(frame\);\n\}\)\(\);\n<\/script>/, 'window.__T={ev:c=>eval(c)};\n})();\n</script>');
if (!html.includes('window.__T')) throw new Error('inject failed');

const clock = { t: 1.8e12 };
const bus = { clients: [], q: [] };
function ctx2d() {
  const grad = { addColorStop(){} };
  return new Proxy({}, { get(o, k) {
    if (k in o) return o[k];
    if (k === 'measureText') return s => ({ width: String(s).length * 7 });
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (k === 'canvas') return { width: 300, height: 150 };
    return () => {};
  }, set(o, k, v) { o[k] = v; return true; } });
}
// --net: run every client through net/supabase-shim.js on a mock Supabase (tests/supa-mock.js) instead of the mock claude room
const NET = process.argv.includes('--net');
const supa = NET ? require('./supa-mock.js') : null;
const shimSrc = NET ? fs.readFileSync(require('path').join(__dirname, '..', 'net', 'supabase-shim.js'), 'utf8') : '';
const htmlFor = () => !NET ? html : html.replace('<script src="net/supabase-shim.js"></script>', () => '<script>' + shimSrc + '</script>');
function makeClient(name) {
  const errors = [];
  const id = bus.clients.length, peer = 'peer' + id;
  const dom = new JSDOM(htmlFor(), { runScripts: 'dangerously', pretendToBeVisual: false, url: 'https://example.test/',
    beforeParse(w) {
      w.Date.now = () => clock.t; w.performance.now = () => clock.t - 1.8e12;
      w.requestAnimationFrame = () => 0;
      w.HTMLCanvasElement.prototype.getContext = function () { return ctx2d(); };
      w.AudioContext = undefined; w.webkitAudioContext = undefined;
      w.navigator.getGamepads = () => [];
      w.onerror = (m) => errors.push(String(m));
      const handlers = {}, room = {
        on(topic, cb) { (handlers[topic] = handlers[topic] || []).push(cb); },
        emit(topic, data) { const lat = 40 + Math.random() * 50;
          for (const c of bus.clients) if (c.id !== id) bus.q.push({ at: clock.t + lat, c, topic, m: { peer, by: 'user' + id, isMe: false, sameTab: false, kind: 'user', data: JSON.parse(JSON.stringify(data)) } });
          return Promise.resolve(); },
        onPeers() {}, onConnection(cb) { setTimeout(() => cb(true), 0); },
        presence() { return Promise.resolve(); }, peers() { return []; }, connected() { return true; },
        join() { return Promise.resolve(room); } };
      if (NET) {
        w.ULR_FORCE_NET = true; w.supabase = { createClient: () => supa.makeSupabase(bus, clock, id) };
        w.localStorage.setItem('ulr3-online', JSON.stringify({ room: 'friends', pass: name === 'Mallory' ? 'guess' : 'pw', name: name || 'Pilot' + id }));
      } else w.claude = { use: async k => k === 'room' ? room : null };
      w.__handlers = handlers;
    } });
  const c = { id, name, dom, w: dom.window, errors, ev: s => dom.window.__T.ev(s) };
  bus.clients.push(c); return c;
}
async function ready(c) { for (let i = 0; i < 50 && !c.w.__T; i++) await new Promise(r => setTimeout(r, 10)); await new Promise(r => setTimeout(r, 30)); }
// advance every client by n frames of 1/60 s, delivering due messages between frames
function step(n, hudEvery = 0, frame = 0) {
  for (let i = 0; i < n; i++) {
    clock.t += 1000 / 60;
    bus.q.sort((a, b) => a.at - b.at);
    while (bus.q.length && bus.q[0].at <= clock.t) { const e = bus.q.shift(); if (e.fn) { try { e.fn(); } catch (err) { e.c && e.c.errors.push('fn: ' + err.stack); } continue; } for (const h of (e.c.w.__handlers[e.topic] || [])) { try { h(e.m); } catch (err) { e.c.errors.push('handler: ' + err.stack); } } }
    for (const c of bus.clients) { try { c.ev('update(1/60)'); if (hudEvery && (frame + i) % hudEvery === 0) c.ev('drawHUD(performance.now()/1000)'); } catch (err) { c.errors.push(err.stack); } }
  }
}
module.exports = { makeClient, ready, step, clock, bus, NET, supa };
