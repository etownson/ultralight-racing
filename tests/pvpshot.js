const { makeClient, ready, step } = require('./harness');
(async () => {
  const [A,B] = ['A','B'].map(makeClient); for (const c of [A,B]) await ready(c);
  for (const c of [A,B]) c.ev("titleMode='live'; refreshTitle();"); step(180);
  A.ev("pvAI=false; liveAnnounce('pvp')"); step(60*6.6);
  // put both in level flight, A 90 m behind B, same heading; B is a bot that flies straight (no inputs)
  const place=(c,x)=>c.ev(`Object.assign(player,{x:${x},y:110,z:0,hd:0,pitch:0,bank:0,spd:30,thr:.7,air:5,gnd:false,f:null}); setAtt(player); cbMe.safeT=0; cbMe.airT=10;`);
  place(B,0); place(A,-90); step(60);
  const fireFor=(sec)=>{ A.ev('keys.Space=true'); for(let i=0;i<sec*60;i++){ step(1); A.ev('Object.assign(player,{y:110,z:B_z??0})'.replace('B_z??0',String(B.ev('player.z')))); } A.ev('keys.Space=false'); };
  console.log('A sees B as target:', A.ev('cbPv.length'), 'assist:', A.ev('!!cbGunAssist()'));
  const h0=B.ev('cbMe.hp'); fireFor(1); step(20); console.log('after 1 s of fire: B hp', h0,'->',B.ev('cbMe.hp'), 'A ammo', A.ev('cbMe.ammo'));
  // shield: B fresh off the runway → no damage
  B.ev('cbMe.safeT=6'); step(15); const h1=B.ev('cbMe.hp'); fireFor(0.6); step(20); console.log('B shielded: hp', h1,'->',B.ev('cbMe.hp'), '| A sees B as target while shielded:', A.ev('cbPv.length'));
  B.ev('cbMe.safeT=0'); step(15);
  fireFor(6); step(30);
  console.log('B down?', !B.ev('cbMe.alive'), 'B downs', B.ev('cbMe.downs'), 'B kd', B.ev('JSON.stringify(cbMe.kd)'), 'A SELF', A.ev('SELF'), '| A tally', A.ev('JSON.stringify(pvTally())'), '| A msg', A.ev('msg.text'), '| B msg', B.ev('msg.text'));
  step(60*13); console.log('B after repair: alive', B.ev('cbMe.alive'), 'hp', B.ev('cbMe.hp'), 'on runway gnd', B.ev('player.gnd'), 'safeT', B.ev('cbMe.safeT'));
  const stat=l=>console.log(l,'B hp',Math.round(B.ev('cbMe.hp')),'alive',B.ev('cbMe.alive'),'downs',B.ev('cbMe.downs'),'rep',B.ev('cbMe.repairT').toFixed(1),'A tally',A.ev('JSON.stringify(Object.values(pvTally()))'),'| B msg',B.ev('msg.text'));
  const ready2=()=>{ for(let i=0;i<60*20&&!(B.ev('cbMe.alive')&&B.ev('cbMe.repairT')<=0);i++) step(1); place(B,0); B.ev('cbMe.safeT=0'); step(5); };
  ready2(); place(A,-150); A.ev('cbMe.msl=3'); step(10); stat('before missiles:');
  console.log('lock on B:', A.ev('!!(cbLockTarget()&&cbLockTarget().pl)'));
  A.ev('cbFireMissile()'); for(let i=0;i<60*6;i++){ step(1); B.ev('player.y=110'); } stat('missile 1 (expect hp 40):');
  place(A,B.ev('player.x')-150); A.ev('player.z='+B.ev('player.z')); A.ev('player.hd='+B.ev('player.hd')+'; player.f=null; setAtt(player)'); step(10);
  console.log('lock 2:', A.ev('!!cbLockTarget()')); A.ev('cbFireMissile()'); for(let i=0;i<60*6;i++){ step(1); B.ev('player.y=110'); } stat('missile 2 (expect down):');
  // crash credit: hit by A, then into the ground within 6 s
  ready2(); place(A,-90); step(10); fireFor(.4); step(15); stat('hit before crash:');
  B.ev('crash(player,"HIT THE GROUND")'); step(30); stat('crash 1 s later:');
  // crash with no recent hit: no credit
  ready2(); for(let i=0;i<60*7;i++){ step(1); B.ev('player.y=110'); } B.ev('crash(player,"HIT A TREE")'); step(30); stat('crash, no hit for 7 s:');
  console.log('errors', A.errors.slice(0,2), B.errors.slice(0,2));
  process.exit(0);
})();
