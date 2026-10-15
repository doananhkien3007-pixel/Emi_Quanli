import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inventorySnapshot, metrics, overviewEvents, reconcileInventory, setProcurementStatus, setReturnReceived } from '../lib/model.ts';
const seed=JSON.parse(readFileSync(new URL('../db/seed.json',import.meta.url)));
const totals=metrics(seed,'0000-01-01','9999-12-31',true);
assert.equal(seed.orders.length,50);
assert.equal(seed.orders.flatMap(o=>o.items).length,61);
for(const o of seed.orders){assert.equal(o.price,o.items.reduce((s,i)=>s+i.price,0));assert.equal(o.cost,o.items.reduce((s,i)=>s+i.cost,0));}
assert.equal(totals.gross,16836000);
assert.equal(totals.revenue,7197000);
assert.equal(totals.done.length,23);
assert.equal(totals.returned.length,8);
assert.equal(totals.ads,3587876);
assert.ok(Math.abs(totals.costs-9506130.236)<0.001);
assert.ok(Math.abs(totals.profit-(-2309130.236))<0.001);
const d=metrics(seed,'2026-10-05','2026-10-05');
assert.equal(d.revenue,818000);assert.ok(Math.abs(d.profit-220571.7)<0.001);
const empty=metrics(seed,'2020-01-01','2020-01-31');assert.equal(empty.costs,0);assert.equal(empty.revenue,0);
const canceled=structuredClone(seed);canceled.orders[0].status='Hủy';
const after=metrics(canceled,'0000-01-01','9999-12-31',true);
assert.equal(after.gross,totals.gross-279000);assert.equal(after.cogs,totals.cogs-127000);assert.equal(after.shipping,totals.shipping-12000);
const returnOrder=structuredClone(seed);returnOrder.orders[0].status='Hoàn';
const returned=metrics(returnOrder,'0000-01-01','9999-12-31',true);
assert.equal(returned.shipping,totals.shipping+7000);assert.equal(returned.revenue,totals.revenue-279000);
const customShipping=structuredClone(seed);customShipping.orders[0].shippingFee=0;
assert.equal(metrics(customShipping,'0000-01-01','9999-12-31',true).shipping,totals.shipping-seed.settings.shipping);
const cohort=structuredClone(seed);
cohort.orders[0].created_at='2026-10-14';cohort.orders[0].date='2026-10-14';cohort.orders[0].delivered_at='2026-10-17';cohort.orders[0].status='Giao thành công';
assert.equal(metrics(cohort,'2026-10-14','2026-10-14').done.some(order=>order.id===cohort.orders[0].id),true);
assert.equal(metrics(cohort,'2026-10-17','2026-10-17').orders.some(order=>order.id===cohort.orders[0].id),false);
assert.equal(overviewEvents(cohort,'2026-10-14').created.some(order=>order.id===cohort.orders[0].id),true);
assert.equal(overviewEvents(cohort,'2026-10-17').delivered.some(order=>order.id===cohort.orders[0].id),true);
assert.equal(overviewEvents(cohort,'2026-10-17').created.some(order=>order.id===cohort.orders[0].id),false);

const inventoryBase={orders:[
 {id:'RETURN-1',date:'2026-10-10',created_at:'2026-10-10T08:00:00+07:00',returned_at:'2026-10-12',customer:'Khách hoàn',phone:'',address:'',product:'Váy lụa hoa to',size:'XL',quantity:1,price:279000,cost:127000,status:'Hoàn',note:'',items:[{id:'return-item',product:'Váy lụa hoa to',color:'Đỏ',size:'XL',quantity:1,price:279000,cost:127000}]},
 {id:'ORDER-1',date:'2026-10-13',created_at:'2026-10-13T09:00:00+07:00',customer:'Khách mới',phone:'',address:'',product:'Váy lụa hoa to',size:'XL',quantity:3,price:837000,cost:381000,status:'Mới',note:'',items:[{id:'order-item',product:'Váy lụa hoa to',color:'Đỏ',size:'XL',quantity:3,price:837000,cost:381000}]},
],expenses:[],products:[{name:'Váy lụa hoa to',price:279000,cost:127000}],settings:{shipping:12000,returnShipping:19000,platformRate:0,cardRate:0},undatedInbound:0,source:'test',inventory:{returnReceipts:[],procurementTaken:[],allocations:[]}};
const receivedInventory=reconcileInventory(setReturnReceived(inventoryBase,'RETURN-1','2026-10-12T10:00:00+07:00'));
const allocated=inventorySnapshot(receivedInventory);
assert.equal(allocated.stock.length,0);assert.equal(allocated.requirements.length,1);assert.equal(allocated.requirements[0].fromStock,1);assert.equal(allocated.requirements[0].required,2);
const takenInventory=setProcurementStatus(receivedInventory,'ORDER-1','order-item','Đã lấy','2026-10-13T10:00:00+07:00');
assert.equal(inventorySnapshot(takenInventory).requirements[0].status,'Đã lấy');
const canceledInventory=reconcileInventory({...takenInventory,orders:takenInventory.orders.map(order=>order.id==='ORDER-1'?{...order,status:'Hủy'}:order)});
assert.equal(inventorySnapshot(canceledInventory).totalStock,3);
assert.equal(canceledInventory.inventory.procurementTaken[0].quantity,2);
const twoOrders=reconcileInventory({...receivedInventory,orders:[...receivedInventory.orders,{...receivedInventory.orders[1],id:'ORDER-2',created_at:'2026-10-13T10:00:00+07:00',quantity:1,items:[{...receivedInventory.orders[1].items[0],id:'order-item-2',quantity:1}]}]});
assert.equal(twoOrders.inventory.allocations.reduce((sum,allocation)=>sum+allocation.quantity,0),1);assert.equal(inventorySnapshot(twoOrders).requirements.reduce((sum,row)=>sum+row.required,0),3);
const differentColor=reconcileInventory({...inventoryBase,orders:[inventoryBase.orders[0],{...inventoryBase.orders[1],items:[{...inventoryBase.orders[1].items[0],color:'Xanh'}]}],inventory:receivedInventory.inventory});
assert.equal(inventorySnapshot(differentColor).stock[0].quantity,1);assert.equal(inventorySnapshot(differentColor).requirements[0].required,3);
console.log('PASS: metrics, event dates, return stock, FIFO allocation, procurement status, cancellation release and variant matching reconcile.');
