// Online (Supabase) checks: run with --net. Joining, smoothness of remote planes at the slower send rate,
// billed-message rate, shared leaderboard, and a pilot with a wrong passphrase.
const { makeClient, ready, step, bus, clock, NET, supa } = require('./harness');
if (!NET) { console.log('run with --net'); process.exit(1); }
(async () => {
  const P = ['Eric', 'Bob', 'Cy'].map(makeClient); for (const c of P) await ready(c);
  await new Promise(r => setTimeout(r, 200)); step(60);
  console.log('emit ms', P[0].ev('LIVE_EMIT'), 'delay', P[0].ev('LIVE_DELAY'), '| title line:', P[0].ev("document.getElementById('netLine').textContent"));
  console.log('connected', P.map(c => c.ev('roomOK')).join(','), '| live button shown', P[0].ev("titleMode='live'; refreshTitle(); !!document.querySelector('#modeRow') && [...document.querySelectorAll('#modeRow button')].some(b=>/LIVE/.test(b.textContent)&&b.offsetParent!==undefined)"));
  // everyone to free flight, bots flying; measure drawn position of Eric on Bob's screen vs where Eric really was LIVE_DELAY ago
  for (const c of P) c.ev("goTitle(); titleMode='live'; refreshTitle();"); step(120);
  P[0].ev("liveAnnounce('race')"); step(30); for (const c of P) c.ev('player.auto=true'); step(60 * 14);
  const hist = []; const errs = [];
  const b0 = supa.shared.billed, t0 = clock.t;
  for (let i = 0; i < 60 * 20; i++) {
    step(1); if (i % 60 === 0) await new Promise(r => setTimeout(r, 5));
    hist.push([clock.t, P[0].ev('[player.x,player.y,player.z]')]);
    const rp = P[1].ev("(()=>{ const r=[...remotes.values()].find(r=>r.by==='u0'); return r&&r.mesh&&r.mesh.root.visible?[r.x,r.y,r.z]:null })()");
    if (rp) { // compare with Eric's true position (delay + ~65 ms latency) ago, and with where he is now
      const lagT = clock.t - P[1].ev('LIVE_DELAY') - 65; let best = hist[0];
      for (const h of hist) if (Math.abs(h[0] - lagT) < Math.abs(best[0] - lagT)) best = h;
      const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      errs.push([d(rp, best[1]), d(rp, hist[hist.length - 1][1])]);
    }
  }
  const mins = (clock.t - t0) / 60000, billed = supa.shared.billed - b0;
  const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1], max = a => Math.max(...a);
  console.log(`remote plane: ${errs.length} frames visible; vs true path at the render delay median ${med(errs.map(e => e[0])).toFixed(2)} m, max ${max(errs.map(e => e[0])).toFixed(2)} m; behind real time median ${med(errs.map(e => e[1])).toFixed(1)} m`);
  console.log(`messages: 3 pilots flying = ${(billed / mins / 60).toFixed(1)} billed/s (free plan cap 100/s) → 2M/month lasts ~${(2e6 / (billed / mins) / 60).toFixed(1)} h of 3-pilot play`);
  // leaderboard: Eric posts a time-trial run, Bob's title screen sees it with Eric's name
  P[0].ev("goTitle(); titleMode='tt'; beginRace(); player.auto=true;");
  for (let s = 0; s < 200 && !P[0].ev('board.length'); s++) step(60, 0);
  await new Promise(r => setTimeout(r, 100));
  P[1].ev("goTitle(); titleMode='tt'; subscribeBoard();"); await new Promise(r => setTimeout(r, 100)); step(5);
  console.log('names on Bob\'s screen:', P[1].ev("[...remotes.values()].map(remoteName).join(', ')"));
  console.log('leaderboard: Eric sees', P[0].ev("board.map(b=>(names[b.id]||'?')+' '+b.t.toFixed(1)).join(', ')"), '| Bob sees', P[1].ev("board.map(b=>(names[b.id]||'?')+' '+b.t.toFixed(1)).join(', ')"), '| rows', Object.keys(supa.shared.tt).join(','));
  // a stranger with the wrong passphrase: no live room, no leaderboard, and the title line says why
  const X = makeClient('Mallory'); await ready(X); await new Promise(r => setTimeout(r, 200)); step(30);
  console.log('wrong passphrase: ROOM', X.ev('ROOM===null?"null":"set"'), 'DB', X.ev('DB===null?"null":"set"'), 'board', X.ev('boardState'), '| line:', X.ev("document.getElementById('netLine').textContent"), '| hears', X.ev('remotes.size'), 'pilots');
  console.log('errors', P.map(c => c.errors.slice(0, 2)));
  process.exit(0);
})();
