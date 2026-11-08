const { makeClient, ready, step } = require('./harness');
(async () => { const S=makeClient('S'); await ready(S);
  S.ev("titleMode='race'; beginRace();"); step(60*7); S.ev('player.auto=true; player.ai=true'); step(60*90,30);
  console.log('race: state', S.ev('state'), 'passed', S.ev('player.passed'), 'rival passed', S.ev('racers.slice(1).map(r=>r.passed).join(",")'), 'err', S.errors.slice(0,2)); process.exit(0); })();
