import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDuration, resolveUntil, confirmPreview, estimateTiming } from '/private/tmp/zero-tests/plugins/caffeine/caffeineSchedule.js';

test('duration accepts integer 1..1440 minutes and rejects invalid individual fields', () => {
  for (const [h,m,total] of [['0','1',1],['0','45',45],['24','0',1440]]) assert.equal(parseDuration(h,m),total);
  for (const [h,m] of [['0','0'],['24','1'],['1.5','0'],['1','60'],['-1','30'],['','1'],['1e1','0']]) assert.equal(parseDuration(h,m),null);
});
test('until uses next local calendar date, handles repeated and missing DST time', () => {
  const old = process.env.TZ;
  try {
    process.env.TZ='America/New_York';
    const next=(iso,h,m)=>new Date(resolveUntil(h,m,new Date(iso).getTime())).toISOString();
    assert.equal(next('2026-10-27T23:00:00-04:00',1,0),'2026-10-28T05:00:00.000Z');
    assert.equal(next('2026-11-01T01:45:00-04:00',1,30),'2026-11-01T06:30:00.000Z');
    assert.equal(next('2026-03-08T01:50:00-05:00',2,30),'2026-03-08T07:30:00.000Z');
    assert.equal(next('2026-03-07T23:00:00-05:00',3,30),'2026-03-08T07:30:00.000Z');
  } finally { if(old === undefined) delete process.env.TZ; else process.env.TZ=old; }
});
test('expired preview requires reconfirmation instead of silently rolling a day',()=>{
  assert.equal(confirmPreview({kind:'until',expires_at_ms:1000},1000),false);
  assert.equal(confirmPreview({kind:'until',expires_at_ms:1001},1000),true);
});
test('duration display and elapsed use monotonic presentation time, until uses wall time',()=>{
  const base={enabled:true,schedule:{kind:'duration',minutes:45},elapsed_ms:1000,remaining_ms:2699000,expires_at_ms:999999};
  assert.deepEqual(estimateTiming(base,100,1100,9999999),{elapsed:2000,remaining:2698000});
  assert.deepEqual(estimateTiming({...base,expires_at_ms:5000,schedule:{kind:'until',expires_at_ms:5000}},100,1100,4000),{elapsed:2000,remaining:1000});
});
test('timezone changes reformat fixed deadlines without changing schedule',async()=>{
  const {formatEndTime}=await import('/private/tmp/zero-tests/plugins/caffeine/caffeineSchedule.js');
  const old=process.env.TZ;
  try{process.env.TZ='Asia/Shanghai';const epoch=Date.parse('2026-10-28T01:00:00Z');const label=formatEndTime(epoch,'en-US',epoch-3600000);assert.match(label,/09:00/);process.env.TZ='America/New_York';assert.match(formatEndTime(epoch,'en-US',epoch-3600000),/21:00/);}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
