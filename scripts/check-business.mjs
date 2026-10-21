import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { todayOperations, needsSpx, cohortFinancialMetrics, activityMetrics, financialMetrics, financialSeries, previousPeriod, cohortMetrics, isStaleOrder, shopTimestamp } from '../lib/analytics.ts';
import { createdDate, receiveProcurementBatch, inventorySnapshot, reconcileInventory, setProcurementStatus, setReturnReceived } from '../lib/model.ts';
import { normalizeShop, prepareShopUpdate, shopSchema } from '../lib/shop-validation.ts';
const seed = JSON.parse(readFileSync(new URL('../db/seed.json', import.meta.url)));
const product = { id:'item', product:'Áo thử nghiệm', color:'Đỏ', size:'M', quantity:1, price:300000, cost:100000 };
const order = { id:'TEST-1', date:'2026-10-01', created_at:'2026-10-01T10:00:00+07:00', customer:'Kiểm thử', phone:'', address:'', product:product.product, size:'M', quantity:1, price:300000, cost:100000, status:'Giao thành công', shipped_at:'2026-10-02', delivered_at:'2026-10-03', shippingFee:12000, note:'', items:[product] };
const base = { orders:[order], expenses:[{id:'ADS', date:'2026-10-03', category:'Quảng cáo', name:'Ads kiểm thử', amount:50000, note:''},{id:'GRAB', date:'2026-10-03', category:'Grab', name:'Grab kiểm thử', amount:10000, note:''},{id:'OTHER', date:'2026-10-03', category:'Khác', name:'Khác kiểm thử', amount:5000, note:''}], products:[{name:product.product,price:300000,cost:100000}], settings:{shipping:12000,returnShipping:7000,platformRate:10,cardRate:1}, undatedInbound:0,source:'test'};
let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS:', name); }
check('Event recognition: new orders are not revenue; shipping and delivery use their own dates',()=>{
 const created=financialMetrics(base,'2026-10-01','2026-10-01');assert.equal(created.gross,300000);assert.equal(created.revenue,0);assert.equal(created.cogs,0);assert.equal(created.profit,0);
 const shipped=financialMetrics(base,'2026-10-02','2026-10-02');assert.equal(shipped.outbound,12000);assert.equal(shipped.profit,-12000);
 const delivered=financialMetrics(base,'2026-10-03','2026-10-03');assert.equal(delivered.revenue,300000);assert.equal(delivered.cogs,100000);assert.equal(delivered.ads,50000);assert.equal(delivered.grab,10000);assert.equal(delivered.manual,5000);assert.equal(delivered.adFees,5500);assert.equal(delivered.profit,129500);assert.equal(delivered.provisional,false);
});
check('A delivered order refunded later keeps its original revenue and reverses it on return day',()=>{
 const returned={...base,orders:[{...order,status:'Hoàn',returned_at:'2026-10-05'}]};
 assert.equal(financialMetrics(returned,'2026-10-03','2026-10-03').revenue,300000);
 const day=financialMetrics(returned,'2026-10-05','2026-10-05');assert.equal(day.revenue,-300000);assert.equal(day.cogs,-100000);assert.equal(day.returnShipping,7000);assert.equal(day.profit,-207000);
 assert.equal(financialMetrics(returned,'2026-10-01','2026-10-05').revenue,0);
 const failed={...returned,orders:[{...returned.orders[0],delivered_at:undefined}]};assert.equal(financialMetrics(failed,'2026-10-01','2026-10-05').cogs,0);
});
check('Revenue and CPA denominators remain explicit; empty metrics never claim 0% success',()=>{
 const empty=financialMetrics(base,'2025-01-01','2025-01-31');assert.equal(empty.roas,null);assert.equal(empty.margin,null);assert.equal(empty.cpa,null);assert.equal(empty.deliveredCpa,null);
 const cohort=cohortMetrics({...base,orders:[{...order,status:'Mới'}]},'2026-10-01','2026-10-31');assert.equal(cohort.returnRate,null);assert.equal(cohort.successRate,null);
});
check('Series includes every empty day, negative profit, and reconciles exactly to range totals',()=>{
 const series=financialSeries(base,'2026-10-01','2026-10-07');assert.equal(series.length,7);assert.equal(series[3].revenue,0);assert.ok(series.some(day=>day.profit<0));
 const total=financialMetrics(base,'2026-10-01','2026-10-07');for(const key of ['revenue','costs','profit','ads','adFees'])assert.equal(series.reduce((sum,day)=>sum+day[key],0),total[key]);
 const all=financialSeries(base,'2025-01-01','2026-12-31');assert.ok(all.length<=90);assert.equal(all[0].date,'2025-01-01');assert.equal(all.at(-1).endDate,'2026-12-31');
 assert.deepEqual(previousPeriod('2026-10-01','2026-10-07'),{from:'2026-09-24',to:'2026-09-30'});
});
check('Legacy input is preserved and flagged; undated costs included exactly once only in all-time totals',()=>{
 const copy=JSON.stringify(seed);const m=financialMetrics(seed,'2026-10-01','2026-10-31');assert.equal(m.revenue,7197000);assert.ok(m.estimatedOrders.length>0);assert.equal(m.provisional,true);
 const all=financialMetrics(seed,'2026-10-01','2026-10-31',true);assert.equal(all.costs-m.costs,seed.undatedInbound);assert.equal(JSON.stringify(seed),copy);
 const zeroCost={...base,orders:[{...order,cost:0,items:[{...product,cost:0}]}]};assert.equal(financialMetrics(zeroCost,'2026-10-01','2026-10-31').missingCost.length,1);
});
const returnedOrder={...order,id:'RETURN',status:'Hoàn',delivered_at:undefined,returned_at:'2026-10-02',items:[{...product,id:'returned-item'}]};
const newOrder={...order,status:'Mới',shipped_at:undefined,delivered_at:undefined,date:'2026-10-03',created_at:'2026-10-03T10:00:00+07:00'};
check('Inventory auto-receives returns once and allocates the exact SKU',()=>{
 const shop={...base,orders:[returnedOrder,newOrder]};assert.equal(inventorySnapshot(shop).totalStock,0);assert.equal(inventorySnapshot(shop).totalPending,0);
 const once=reconcileInventory(setReturnReceived(shop,'RETURN','2026-10-03'));assert.equal(inventorySnapshot(once).totalPending,0);assert.equal(once.inventory.allocations[0].orderId,newOrder.id);
 const twice=reconcileInventory(setReturnReceived(once,'RETURN','2026-10-03'));assert.equal(twice.inventory.returnReceipts.length,1);assert.equal(twice.inventory.allocations.reduce((sum,a)=>sum+a.quantity,0),1);
 const other={...shop,orders:[returnedOrder,{...newOrder,items:[{...product,color:'Xanh'}]}]};assert.equal(inventorySnapshot(setReturnReceived(other,'RETURN','2026-10-03')).totalPending,1);
});
check('Already procured or shipped orders do not consume newly returned stock',()=>{
 const shop={...base,orders:[returnedOrder,newOrder]};
 const purchased=setProcurementStatus({...base,orders:[newOrder]},newOrder.id,'item','Đã lấy','2026-10-03');
 const procured={...purchased,orders:[returnedOrder,...purchased.orders]};
 const receipt=reconcileInventory(setReturnReceived(procured,'RETURN','2026-10-03'));assert.equal(inventorySnapshot(receipt).totalStock,1);assert.equal(inventorySnapshot(receipt).totalPending,0);
 const sent={...shop,orders:[returnedOrder,{...newOrder,status:'Đã gửi',shipped_at:'2026-10-03'}]};assert.equal(inventorySnapshot(setReturnReceived(sent,'RETURN','2026-10-03')).totalStock,1);
});
check('Server captures event dates without inventing legacy events or mutating notes-only imports',()=>{
 const before=normalizeShop({...base,orders:[newOrder]});
 let result=prepareShopUpdate(before,{...before,orders:[{...before.orders[0],status:'Giao thành công'}]},'2026-10-05');assert.ok(!result.error,result.error);assert.equal(result.data.orders[0].delivered_at,'2026-10-05');assert.equal(result.data.orders[0].shipped_at,'2026-10-05');
 const sentAgain=prepareShopUpdate(result.data,{...result.data,orders:[{...result.data.orders[0],status:'Đã gửi'}]},'2026-10-06');assert.ok(!sentAgain.error,sentAgain.error);assert.equal(sentAgain.data.orders[0].status,'Đã gửi');assert.equal(sentAgain.data.orders[0].shipped_at,'2026-10-05');assert.equal(sentAgain.data.orders[0].delivered_at,undefined);assert.equal(todayOperations(sentAgain.data,'2026-10-05').delivered.length,0);
 const legacy=normalizeShop({...base,orders:[{...order,delivered_at:undefined,shipped_at:undefined}]});result=prepareShopUpdate(legacy,{...legacy,orders:[{...legacy.orders[0],note:'Bổ sung ghi chú'}]},'2026-10-05');assert.ok(!result.error,result.error);assert.equal(result.data.orders[0].delivered_at,undefined);assert.equal(result.data.orders[0].shipped_at,undefined);
});
check('Server preserves supplied creation time and never invents a missing hour',()=>{
 const previous=normalizeShop({...base,orders:[]});
 const exactOrder={...newOrder,id:'EXACT',date:'2026-10-15',created_at:'2026-10-15T19:44:48+07:00'};
 let result=prepareShopUpdate(previous,{...previous,orders:[exactOrder]},'2026-10-15');
 assert.ok(!result.error,result.error);assert.equal(result.data.orders[0].created_at,'2026-10-15T19:44:48+07:00');
 const legacyOrder={...newOrder,id:'LEGACY',date:'2026-10-15',created_at:'2026-10-15'};
 result=prepareShopUpdate(previous,{...previous,orders:[legacyOrder]},'2026-10-15');
 assert.ok(!result.error,result.error);assert.equal(result.data.orders[0].created_at,'2026-10-15');
});
check('Server rejects bad dates, missing SPX, duplicate IDs and received stock history edits',()=>{
 assert.equal(shopSchema.safeParse({revision:1,data:{...base,orders:[{...order,date:'2026-02-30'}]}}).success,false);
 const before=normalizeShop({...base,orders:[newOrder]});assert.ok(prepareShopUpdate(before,{...before,orders:[{...before.orders[0],status:'Đã tạo đơn'}]},'2026-10-05').error);
 assert.ok(prepareShopUpdate(before,{...before,orders:[...before.orders,...before.orders]},'2026-10-05').error);
 assert.ok(prepareShopUpdate(before,{...before,orders:[{...before.orders[0],shipped_at:'2026-10-01'}]},'2026-10-05').error);
 const receipt=normalizeShop(setReturnReceived({...base,orders:[returnedOrder,newOrder]},'RETURN','2026-10-03'));assert.ok(prepareShopUpdate(receipt,{...receipt,orders:[newOrder]},'2026-10-05').error);
 const changed={...receipt,orders:receipt.orders.map(o=>o.id==='RETURN'?{...o,items:[{...o.items[0],quantity:2}]}:o)};assert.ok(prepareShopUpdate(receipt,changed,'2026-10-05').error);
});
check('Changing default fees preserves historical costs and fee rates',()=>{
 const before=normalizeShop({...base,orders:[{...order,shippingFee:undefined}]});const initial=financialMetrics(before,'2026-10-01','2026-10-31');
 const changed=prepareShopUpdate(before,{...before,settings:{shipping:20000,returnShipping:15000,platformRate:20,cardRate:2}},'2026-10-05');assert.ok(!changed.error,changed.error);const after=financialMetrics(changed.data,'2026-10-01','2026-10-31');assert.equal(after.costs,initial.costs);assert.equal(changed.data.expenses[0].adFeeRate,11);
});
check('All-time immutable source and stale queue boundaries',()=>{
 const before=JSON.stringify(seed);normalizeShop(seed);assert.equal(JSON.stringify(seed),before);
 assert.equal(isStaleOrder({...newOrder,date:'2026-10-03',created_at:'2026-10-03T10:00:00+07:00',updated_at:'2026-10-06'},'2026-10-06'),true);assert.equal(isStaleOrder({...newOrder,date:'2026-10-04',created_at:'2026-10-04T10:00:00+07:00'},'2026-10-06'),false);assert.equal(isStaleOrder(order,'2026-10-06'),false);
});
check('Unchanged orders keep update timestamps even when JSON properties have a different order',()=>{
 const before=normalizeShop({...base,orders:[{...order,updated_at:'2026-10-03'}]});
 const parsed=shopSchema.parse({revision:1,data:before}).data;
 const result=prepareShopUpdate(before,parsed,'2026-10-05');assert.ok(!result.error,result.error);assert.equal(result.data.orders[0].updated_at,'2026-10-03');
});
check('UTC creation timestamps map to Vietnam business dates',()=>{
 assert.equal(createdDate({...order,created_at:'2026-10-02T18:30:00Z'}),'2026-10-03');
 assert.equal(shopTimestamp(new Date('2026-10-02T18:30:45Z')),'2026-10-03T01:30:45+07:00');
});
check('One batch tick receives all missing SKUs once and leaves stock reservations intact',()=>{
 const other={...newOrder,id:'TEST-2',items:[{...product,id:'item2',color:'Xanh',quantity:3}],quantity:3};
 const shop=reconcileInventory(setReturnReceived({...base,orders:[returnedOrder,newOrder,other]},'RETURN','2026-10-03'));
 assert.equal(inventorySnapshot(shop).totalPending,3);
 const received=receiveProcurementBatch(shop,'2026-10-03T11:00:00+07:00');assert.equal(inventorySnapshot(received).totalPending,0);assert.equal(received.inventory.procurementTaken.length,1);assert.equal(received.inventory.procurementTaken[0].quantity,3);assert.equal(received.inventory.allocations.length,1);
 const again=receiveProcurementBatch(received,'2026-10-03T12:00:00+07:00');assert.deepEqual(again.inventory.procurementTaken,received.inventory.procurementTaken);
 const nextOrder={...newOrder,id:'TEST-3',items:[{...product,id:'item3'}]};const next={...received,orders:[...received.orders,nextOrder]};assert.equal(inventorySnapshot(next).totalPending,1);assert.equal(inventorySnapshot(receiveProcurementBatch(next,'2026-10-04')).totalPending,0);
});
check('Three orders closed on the 12th count as deliveries/returns on the 15th, not as new orders',()=>{
 const closed={...newOrder,date:'2026-10-12',created_at:'2026-10-12T10:00:00+07:00'};
 const initial=normalizeShop({...base,expenses:[],orders:[closed,{...closed,id:'TWO',items:[{...product,id:'two'}]},{...closed,id:'THREE',items:[{...product,id:'three'}]}]});
 const update=prepareShopUpdate(initial,{...initial,orders:initial.orders.map((o,i)=>({...o,status:i===2?'Hoàn':'Giao thành công'}))},'2026-10-15');assert.ok(!update.error,update.error);
 const day12=activityMetrics(update.data,'2026-10-12','2026-10-12');assert.equal(day12.created.length,3);assert.equal(day12.delivered.length,0);assert.equal(day12.returned.length,0);
 const day15=activityMetrics(update.data,'2026-10-15','2026-10-15');assert.equal(day15.created.length,0);assert.equal(day15.delivered.length,2);assert.equal(day15.returned.length,1);
 assert.equal(financialMetrics(update.data,'2026-10-12','2026-10-12').revenue,0);assert.equal(financialMetrics(update.data,'2026-10-15','2026-10-15').revenue,600000);
 const legacy={...base,orders:[{...order,date:'2026-10-15',created_at:'2026-10-15',delivered_at:undefined,shipped_at:undefined}]};assert.equal(activityMetrics(legacy,'2026-10-15','2026-10-15').delivered.length,0);assert.equal(activityMetrics(legacy,'2026-10-01','2026-10-15',true).delivered.length,1);
});
check('Today uses Vietnam hours, actual outcome dates and closed-order CPA',()=>{
 const shop={...base,orders:[order,{...newOrder,id:'TODAY',created_at:'2026-10-02T18:30:00Z'}, {...newOrder,id:'UNDATED',created_at:'2026-10-03'}]};
 const day=todayOperations(shop,'2026-10-03');assert.equal(day.created.length,2);assert.equal(day.delivered.length,1);assert.equal(day.revenue,600000);assert.equal(day.cpa,25000);assert.equal(day.hours[1].value,300000);assert.equal(day.unknownValue,300000);
 assert.equal(todayOperations(base,'2026-10-03').cpa,null);
 assert.equal(needsSpx(newOrder),true);assert.equal(needsSpx({...newOrder,spxCode:'SPX1'}),false);assert.equal(needsSpx(order),false);
});
check('Today ROAS and product quantity sum every item, not order count',()=>{
 const shop={...base,orders:[order,{...newOrder,id:'MULTI',items:[{...product,quantity:2},{...product,id:'second',quantity:3}]}]};
 const day=todayOperations(shop,'2026-10-03');assert.equal(day.closedRoas,6);assert.equal(day.productQuantity,5);
 assert.equal(todayOperations({...shop,expenses:[]},'2026-10-03').closedRoas,null);
 assert.equal(todayOperations({...shop,orders:[]},'2026-10-03').closedRoas,0);
 assert.equal(todayOperations({...shop,orders:[]},'2026-10-03').productQuantity,0);
});
check('Meta Ads replaces manual Ads for synchronized dates without double counting',()=>{
 const shop={...base,metaAdSpend:[{date:'2026-10-03',amount:70000,currency:'VND',syncedAt:'2026-10-03T08:00:00+07:00',adFeeRate:11}]};
 const metric=financialMetrics(shop,'2026-10-03','2026-10-03');
 assert.equal(metric.ads,70000);assert.equal(metric.adFees,7700);
 assert.equal(metric.expenses.filter(expense=>expense.category==='Quảng cáo').length,1);
 assert.equal(metric.expenses.find(expense=>expense.category==='Quảng cáo').source,'meta');
 const fallback=financialMetrics({...shop,metaAdSpend:[]},'2026-10-03','2026-10-03');assert.equal(fallback.ads,50000);
});
check('Supabase microsecond timestamps do not block editing an older expense',()=>{
 const metaAdSpend=[{date:'2026-10-21',amount:179202,currency:'VND',syncedAt:'2026-10-21T07:03:21.892746+00:00',adFeeRate:11}];
 const previous=normalizeShop({...base,metaAdSpend});
 const incoming={...previous,expenses:previous.expenses.map(expense=>expense.id==='ADS'?{...expense,date:'2026-10-20',amount:316345}:expense)};
 const parsed=shopSchema.safeParse({revision:1,data:incoming});
 assert.ok(parsed.success,parsed.error?.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '));
 const update=prepareShopUpdate(previous,parsed.data.data,'2026-10-21');
 assert.ok(!update.error,update.error);assert.equal(update.data.expenses.find(expense=>expense.id==='ADS').amount,316345);
});
check('Supabase microsecond timestamps do not block changing an older order status',()=>{
 const oldOrder={...newOrder,id:'OLD-ORDER',date:'2026-10-20',created_at:'2026-10-20T10:00:00+07:00'};
 const metaAdSpend=[{date:'2026-10-21',amount:179202,currency:'VND',syncedAt:'2026-10-21T07:03:21.892746+00:00',adFeeRate:11}];
 const previous=normalizeShop({...base,orders:[oldOrder],metaAdSpend});
 const incoming={...previous,orders:[{...previous.orders[0],status:'Giao thành công'}]};
 const parsed=shopSchema.safeParse({revision:1,data:incoming});
 assert.ok(parsed.success,parsed.error?.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '));
 const update=prepareShopUpdate(previous,parsed.data.data,'2026-10-21');
 assert.ok(!update.error,update.error);assert.equal(update.data.orders[0].status,'Giao thành công');assert.equal(update.data.orders[0].delivered_at,'2026-10-21');
});
check('Cohort retains final revenue and costs on close date, including later returns',()=>{
 const shop={...base,expenses:base.expenses.map(e=>({...e,date:'2026-10-01'}))};
 const closed=cohortFinancialMetrics(shop,'2026-10-01','2026-10-01');assert.equal(closed.revenue,300000);assert.equal(closed.profit,117500);assert.equal(closed.deliveredCpa,50000);
 assert.equal(cohortFinancialMetrics(shop,'2026-10-03','2026-10-03').revenue,0);
 const returned=cohortFinancialMetrics({...shop,orders:[{...order,status:'Hoàn',returned_at:'2026-10-05'}]},'2026-10-01','2026-10-01');assert.equal(returned.revenue,0);assert.equal(returned.cogs,0);assert.equal(returned.done.length,0);assert.equal(returned.returnShipping,7000);
 assert.equal(cohortFinancialMetrics({...shop,orders:[newOrder]},'2026-10-03','2026-10-03').provisional,true);
 const series=financialSeries(shop,'2026-10-01','2026-10-05','cohort');assert.equal(series.reduce((sum,d)=>sum+d.profit,0),closed.profit);
 const withUndated={...shop,undatedInbound:146000};const completedDay=financialSeries(withUndated,'2026-10-01','2026-10-01','cohort')[0];assert.equal(completedDay.pending,0);assert.equal(completedDay.provisional,false);
 const pendingDay=financialSeries({...withUndated,orders:[newOrder]},'2026-10-03','2026-10-03','cohort')[0];assert.equal(pendingDay.provisional,true);
});
console.log(`\n${checks} business scenarios passed.`);
