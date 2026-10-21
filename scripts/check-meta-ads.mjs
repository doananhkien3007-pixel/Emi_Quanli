import assert from 'node:assert/strict';
import { cronMode, normalizeMetaInsight, syncRange } from '../lib/meta-ads.ts';
import { previousAdsRange, rankAdsEntities, summarizeAds } from '../lib/ads-insights.ts';

assert.deepEqual(syncRange('today','2026-10-21'),{since:'2026-10-21',until:'2026-10-21'});
assert.deepEqual(syncRange('yesterday','2026-10-21'),{since:'2026-10-20',until:'2026-10-20'});
assert.deepEqual(syncRange('last3','2026-10-21'),{since:'2026-10-18',until:'2026-10-20'});
assert.deepEqual(syncRange('history30','2026-10-21'),{since:'2026-09-22',until:'2026-10-21'});
assert.equal(cronMode('10 17 * * *',null),'last3');
assert.equal(cronMode('*/30 * * * *',null),null);
assert.equal(cronMode('5 1 * * *',null),null);
assert.equal(cronMode(null,'last3'),'last3');
assert.equal(cronMode(null,'history30'),'history30');
assert.equal(cronMode(null,'invalid'),null);

const normalized=normalizeMetaInsight({date_start:'2026-10-21',campaign_id:'c1',campaign_name:'Campaign 1',spend:'200000',impressions:'10000',reach:'7000',clicks:'200',ctr:'2',cpc:'1000',cpm:'20000',actions:[{action_type:'onsite_conversion.messaging_conversation_started_7d',value:'10'},{action_type:'lead',value:'4'},{action_type:'omni_purchase',value:'2'}],action_values:[{action_type:'omni_purchase',value:'500000'}],purchase_roas:[{action_type:'omni_purchase',value:'2.5'}]},
 {level:'campaign',currency:'VND',campaign:{id:'c1',name:'Campaign 1',status:'ACTIVE',effective_status:'ACTIVE'},status:'ACTIVE',creative:{id:'creative-1',thumbnail_url:'https://example.com/creative.jpg'}});
assert.equal(normalized.results,2);assert.equal(normalized.resultType,'purchase');assert.equal(normalized.costPerResult,100000);assert.equal(normalized.roas,2.5);assert.equal(normalized.ctr,2);assert.equal(normalized.creativeId,'creative-1');
const previousRow={...normalized,date:'2026-10-20',spend:100000,purchases:4,results:4,purchaseValue:600000,roas:6,syncedAt:'2026-10-20T10:00:00Z'};
const currentRow={...normalized,syncedAt:'2026-10-21T10:00:00Z'};
assert.deepEqual(previousAdsRange('2026-10-15','2026-10-21'),{since:'2026-10-08',until:'2026-10-14'});
assert.equal(summarizeAds([currentRow]).cpm,20000);
const ranked=rankAdsEntities([currentRow],[previousRow]);assert.ok(ranked[0].flags.includes('spend-up-results-down'));assert.ok(ranked[0].flags.includes('cpa-up'));

console.log('PASS: Meta Ads sync ranges, normalization, comparisons and UTC cron routing.');
