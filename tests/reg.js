const { makeClient, ready, step, bus } = require('./harness');
(async () => {
  const S = makeClient('S'); await ready(S);
  // single-player combat
  S.ev("titleMode='combat'; beginRace();"); S.ev('player.cbBot=player.ai=true'); step(60*6);
  for(let s=0;s<120&&S.ev('state')!=='results';s++) step(60,10,s*60);
  console.log('solo combat:', S.ev('state'), 'pvp', S.ev('cbPvp'), 'kills', S.ev('cbMe.kills'), 'bandits', S.ev('cbAlive()')+'/'+S.ev('cbN'), '|', S.ev("document.getElementById('resTitle').textContent"));
  // normal race (AI rivals) + time trial
  S.ev("goTitle(); titleMode='race'; beginRace(); player.auto=true;"); step(60*90, 30);
  console.log('race: state', S.ev('state'), 'cbActive', S.ev('cbActive'), 'passed', S.ev('player.passed'), 'rings visible', S.ev('rings[1].mesh.visible'), 'rivals', S.ev('racers.length'));
  S.ev("goTitle(); titleMode='tt'; beginRace(); player.auto=true;"); step(60*40, 30); console.log('tt: state', S.ev('state'), 'passed', S.ev('player.passed'), 'racers', S.ev('racers.length'));
  console.log('S errors', S.errors.slice(0,3));
  bus.clients.length=0;
  // co-op combat + live race, 2 clients
  const [A,B]=['A','B'].map(makeClient); for(const c of [A,B]) await ready(c);
  for(const c of [A,B]) c.ev("titleMode='live'; refreshTitle();"); step(180);
  A.ev("liveAnnounce('cb')"); step(30); for(const c of [A,B]) c.ev('player.cbBot=player.ai=true'); step(60*6.5);
  console.log('coop:', [A,B].map(c=>`${c.name} ${c.ev('state')} pvp ${c.ev('cbPvp')} coop ${c.ev('cbCoop')} n ${c.ev('cbN')} view ${c.ev('cbView.n')}`).join(' | '));
  for(let s=0;s<240&&!(A.ev('state')==='results'&&B.ev('state')==='results');s++) step(60,10,s*60);
  console.log('coop end:', [A,B].map(c=>`${c.name} ${c.ev('state')} ${c.ev("document.getElementById('resTitle').textContent")} kills ${c.ev('cbMe.kills')} alive ${c.ev('cbAlive()')}`).join(' | '));
  A.ev('startRace()'); step(30); console.log('coop rematch:', B.ev('state'), B.ev('liveRace.k'), B.ev('liveRace.pv'));
  step(60*8); for(const c of [A,B]) c.ev('goTitle(); titleMode="live"; refreshTitle();'); step(120);
  B.ev("liveAnnounce('race')"); step(30); for(const c of [A,B]) c.ev('player.auto=true'); step(60*40, 30);
  console.log('live race:', [A,B].map(c=>`${c.name} ${c.ev('state')} cb ${c.ev('cbActive')} passed ${c.ev('player.passed')} sees ${c.ev('liveRacing().length')}`).join(' | '));
  console.log('errors', A.errors.slice(0,3), B.errors.slice(0,3));
  process.exit(0);
})();
