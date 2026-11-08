// PVP: 3 live clients, bots flying, optional AI. Checks join, scoring consistency, damage, repairs, end, results.
const { makeClient, ready, step, clock } = require('./harness');
const AI = process.argv.includes('--ai'), DUR = +(process.argv.find(a => a.startsWith('--t='))||'--t=300').slice(4);
(async () => {
  const C = ['A', 'B', 'C'].map(makeClient); for (const c of C) await ready(c);
  for (const c of C) c.ev("titleMode='live'; refreshTitle();");
  step(60 * 3);
  const A = C[0];
  console.log('lobby: A hears', A.ev('lobbyPilots().length'), 'pilots');
  A.ev(`pvAI=${AI}; liveAnnounce('pvp')`);
  step(30);
  for (const c of C) console.log(c.name, 'state', c.ev('state'), 'cbPvp', c.ev('cbPvp'), 'host', c.ev('cbHost'), 'cbN', c.ev('cbN'), 'countdown', c.ev('countdown.toFixed(2)'));
  for (const c of C) c.ev('player.cbBot=player.ai=true');
  step(60 * 6.5);
  for (const c of C) console.log(c.name, 'state', c.ev('state'));
  const id = {}; for (const c of C) id[c.name] = c.ev('SELF');
  let hpHits = 0, last = {};
  for (let s = 0; s < DUR; s += 1) {
    step(60, 6, s * 60);
    for (const c of C) { const hp = c.ev('cbMe.hp'); if (last[c.name] != null && hp < last[c.name]) hpHits++; last[c.name] = hp; }
    if (s % 20 === 0 || C.every(c => c.ev('state') === 'results')) {
      const rows = C.map(c => `${c.name}: ${c.ev('state')} tally ${c.ev('JSON.stringify(Object.fromEntries(Object.entries(pvTally()).map(([k,v])=>[k.slice(0,3),v])))')} hp ${Math.round(c.ev('cbMe.hp'))} dn ${c.ev('cbMe.downs')} rep ${c.ev('cbMe.repairT').toFixed(0)} bk ${c.ev('cbMe.kills')} foes ${c.ev('cbEnemies().length')} left ${c.ev('pvLeft().toFixed(0)')}`);
      console.log(`t=${s}s`, rows.join(' | '));
    }
    if (C.every(c => c.ev('state') === 'results')) break;
  }
  step(60 * 2);
  console.log('hp drops seen (s samples):', hpHits);
  for (const c of C) {
    console.log(c.name, 'results title:', c.ev("document.getElementById('resTitle').textContent"), '| head:', c.ev("document.getElementById('resHead').textContent"),
      '| rows:', c.ev("[...document.querySelectorAll('#resBody tr')].map(t=>t.textContent).join(' / ')"));
    console.log(c.name, 'kd', c.ev('JSON.stringify(cbMe.kd)'), 'errors:', c.errors.length ? c.errors.slice(0, 3) : 'none');
  }
  // rematch: B presses FIGHT AGAIN
  C[1].ev('startRace()'); step(30);
  for (const c of C) console.log('rematch', c.name, c.ev('state'), 'pv', c.ev('liveRace.pv'), 'host', c.ev('cbHost'), 'n', c.ev('liveRace.n'), 'tally', c.ev('JSON.stringify(pvTally())'));
  const payload = C[0].ev('JSON.stringify(cbStateOut()).length');
  console.log('A cbStateOut bytes', payload);
  process.exit(0);
})();
