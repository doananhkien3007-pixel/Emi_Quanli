import assert from 'node:assert/strict';
import { cronMode, syncRange } from '../lib/meta-ads.ts';

assert.deepEqual(syncRange('today','2026-10-21'),{since:'2026-10-21',until:'2026-10-21'});
assert.deepEqual(syncRange('yesterday','2026-10-21'),{since:'2026-10-20',until:'2026-10-20'});
assert.deepEqual(syncRange('last3','2026-10-21'),{since:'2026-10-18',until:'2026-10-20'});
assert.equal(cronMode('10 17 * * *',null),'yesterday');
assert.equal(cronMode('*/30 * * * *',null),null);
assert.equal(cronMode('5 1 * * *',null),null);
assert.equal(cronMode(null,'last3'),'last3');
assert.equal(cronMode(null,'invalid'),null);

console.log('PASS: Meta Ads sync ranges and UTC cron routing.');
