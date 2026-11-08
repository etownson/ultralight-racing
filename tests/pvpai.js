const { makeClient, ready, step } = require('./harness');
(async () => {
  const C = ['A','B'].map(makeClient); for (const c of C) await ready(c);
  for (const c of C) c.ev("titleMode='live'; refreshTitle();"); step(180);
  C[0].ev("pvAI=true; liveAnnounce('pvp')"); step(30);
  for (const c of C) { console.log(c.name,'cbN',c.ev('cbN'),'liveRace.n',c.ev('liveRace.n')); c.ev('player.cbBot=player.ai=true'); }
  step(60*6.5);
  let respawns=0, prevSt={};
  for (let s=0;s<330;s++){ step(60,10,s*60);
    const A=C[0]; const st=A.ev('JSON.stringify(foes.slice(0,cbN).map(r=>r.st))'); const a=JSON.parse(st);
    a.forEach((x,i)=>{ if(prevSt[i]===2&&x===0) respawns++; prevSt[i]=x; });
    if(s%60===0) console.log(`t=${s}`, C.map(c=>`${c.name} ${c.ev('state')} tally ${c.ev('JSON.stringify(Object.values(pvTally()))')} hp ${Math.round(c.ev('cbMe.hp'))} dn ${c.ev('cbMe.downs')} bandits-killed ${c.ev('cbMe.kills')} seen-foes ${c.ev('cbFoeList().length')} enemies ${c.ev('cbEnemies().length')}`).join(' | '), 'host foe st', st);
    if (C.every(c=>c.ev('state')==='results')) break; }
  console.log('bandit respawns seen on host:', respawns);
  step(120);
  for (const c of C) console.log(c.name, c.ev("document.getElementById('resTitle').textContent"), '|', c.ev("document.getElementById('resHead').textContent"), '|', c.ev("[...document.querySelectorAll('#resBody tr')].map(t=>t.textContent).join(' / ')"), '| errors', c.errors.slice(0,3));
  // host leaves mid-round: new round, then stop A
  C[1].ev('startRace()'); step(60*7); for (const c of C) c.ev('player.cbBot=player.ai=true'); step(60*20);
  console.log('round 2: B host', C[1].ev('cbHost'), 'A sees bandits', C[0].ev('cbFoeList().length'));
  const B=C[1]; B.ev("window.__gone=true"); // simulate B's tab gone: stop stepping B
  const { bus } = require('./harness'); bus.clients.splice(1,1);
  C[0].ev("const _h=cbHurt; window.__hl=[]; cbHurt=(d,w,b)=>{ window.__hl.push([Date.now()%1e6,d,w,b,cbView.n]); _h(d,w,b); }"); console.log("pre", C[0].ev("JSON.stringify({n:cbView.n,last:Date.now()-cbView.last,end:cbEndT,pvp:cbPvp,host:cbHost,st:state})")); const ms=[]; let lt=""; for(let i=0;i<60*9;i++){ step(1); const m=C[0].ev("msg.text+' @'+msg.t.toFixed(2)"); const tx=m.split(" @")[0]; if(tx!==lt){ ms.push((i/60).toFixed(2)+"s "+m); lt=tx; } } console.log("msgs", ms.join(" || ")); console.log("hurts", JSON.stringify(C[0].w.__hl)); console.log('after host gone: A state', C[0].ev('state'), 'cbView.n', C[0].ev('cbView.n'), 'msg', C[0].ev('msg.text'), 'errors', C[0].errors.slice(0,2));
  process.exit(0);
})();
