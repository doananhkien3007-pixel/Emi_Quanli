import assert from 'node:assert/strict';
import { inventorySnapshot, receiveProcurementBatch, variantKey } from '../lib/model.ts';
import { normalizeShop, prepareShopUpdate, shopSchema } from '../lib/shop-validation.ts';
const day='2026-10-15';
const item=(id,quantity=1,color='Đỏ',size='M',product='Áo')=>({id,quantity,color,size,product,price:quantity*300000,cost:quantity*100000});
const order=(id,items,status='Mới')=>({id,date:'2026-10-10',created_at:'2026-10-10T10:00:00+07:00',customer:'Test',phone:'',address:'',product:items[0].product,size:items[0].size,quantity:items.reduce((s,i)=>s+i.quantity,0),price:items.reduce((s,i)=>s+i.price,0),cost:items.reduce((s,i)=>s+i.cost,0),note:'',status,items,...(status==='Hoàn'?{returned_at:'2026-10-12'}:{})});
const shop=(orders)=>normalizeShop({orders,expenses:[],products:[{name:'Áo',price:300000,cost:100000}],settings:{shipping:12000,returnShipping:7000,platformRate:0,cardRate:0},source:'test',undatedInbound:0});
function save(previous,incoming){const parsed=shopSchema.parse({revision:1,data:incoming}).data;const result=prepareShopUpdate(previous,parsed,day);assert.ok(!result.error,result.error);return result.data;}
const status=(s,id,value)=>save(s,{...s,orders:s.orders.map(o=>o.id===id?{...o,status:value}:o)});
const receive=s=>save(s,receiveProcurementBatch(s,day));
const add=(s,o)=>save(s,{...s,orders:[...s.orders,o]});
let checks=0;
function check(name,run){run();checks++;console.log('PASS:',name);}
check('Partial stock is used first; batch purchases only missing quantities across exact variants',()=>{
 let s=shop([order('R',[item('r',2)],'Hoàn'),order('A',[item('a',5),item('blue',1,'Xanh')]),order('B',[item('b',3)])]);
 let snapshot=inventorySnapshot(s);assert.equal(snapshot.totalStock,0);assert.equal(snapshot.totalPending,7);assert.equal(snapshot.requirements.find(r=>r.itemId==='a').fromStock,2);
 s=receive(s);snapshot=inventorySnapshot(s);assert.equal(snapshot.totalPending,0);assert.equal(snapshot.totalStock,0);assert.equal(s.inventory.procurementTaken.reduce((n,r)=>n+r.quantity,0),7);
 assert.deepEqual(receive(s).inventory,s.inventory);
 s=status(s,'A','Hủy');assert.equal(inventorySnapshot(s).totalStock,6); // 2 stock + 3 red + 1 blue
 assert.equal(inventorySnapshot(s).totalPending,0);assert.equal(s.inventory.procurementTaken.length,3);
 const again=status(s,'A','Hủy');assert.equal(inventorySnapshot(again).totalStock,6);
 s=add(s,order('C',[item('c',4)]));assert.equal(inventorySnapshot(s).totalStock,2);assert.equal(inventorySnapshot(s).totalPending,0);
});
check('Wrong color, size or product cannot consume another SKU',()=>{
 const s=shop([order('R',[item('r',3)],'Hoàn'),order('A',[item('x',1,'Xanh'),item('l',1,'Đỏ','L'),item('p',1,'Đỏ','M','Váy')])]);
 assert.equal(inventorySnapshot(s).totalStock,3);assert.equal(inventorySnapshot(s).totalPending,3);
});
check('Physical stocktake replaces old returns without losing new returns or accepting client edits',()=>{
 const stocktake={countedOn:day,absorbedReturnOrderIds:['OLD'],items:[{product:'Váy lụa hoa to',color:'',size:'3XL',quantity:1,unitCost:127000}]};
 let s=normalizeShop({...shop([order('OLD',[item('old',3)],'Hoàn')]),inventory:{returnReceipts:[],procurementTaken:[],allocations:[],stocktake}});
 let snapshot=inventorySnapshot(s);assert.equal(snapshot.totalStock,1);assert.equal(snapshot.stock[0].product,'Váy lụa hoa to');assert.equal(snapshot.stock[0].size,'3XL');
 s=save(s,{...s,inventory:{...s.inventory,stocktake:{...stocktake,items:[]}}});assert.equal(inventorySnapshot(s).totalStock,1);
 s=add(s,{...order('NEW',[item('new',1,'','3XL','Váy lụa hoa to')],'Hoàn'),returned_at:day});
 snapshot=inventorySnapshot(s);assert.equal(snapshot.totalStock,2);assert.equal(snapshot.stock[0].quantity,2);
});
check('Returns automatically enter stock once, survive reloads, and roll back on status change',()=>{
 let s=receive(shop([order('A',[item('a',2)])]));s=status(s,'A','Hoàn');
 assert.equal(inventorySnapshot(s).totalStock,2);assert.equal(s.inventory.returnReceipts.length,1);
 s=save(s,s);s=normalizeShop(s);assert.equal(inventorySnapshot(s).totalStock,2);
 s=status(s,'A','Giao thành công');assert.equal(inventorySnapshot(s).totalStock,0);assert.equal(s.inventory.returnReceipts.length,0);assert.equal(s.orders[0].returned_at,undefined);
 s=status(s,'A','Hoàn');assert.equal(inventorySnapshot(s).totalStock,2);assert.equal(s.inventory.returnReceipts.length,1);
});
check('Return rollback releases waiting reservations and restores their shortage',()=>{
 let s=shop([order('R',[item('r',2)],'Hoàn'),order('A',[item('a',3)])]);assert.equal(inventorySnapshot(s).totalPending,1);
 s=status(s,'R','Giao thành công');assert.equal(inventorySnapshot(s).totalPending,3);assert.equal(inventorySnapshot(s).totalStock,0);assert.equal(s.inventory.allocations.length,0);
 s=receive(s);assert.equal(inventorySnapshot(s).totalPending,0);
});
check('Cancellation frees reserved stock and immediately serves other waiting orders',()=>{
 let s=shop([order('R',[item('r',2)],'Hoàn'),order('A',[item('a',2)]),order('B',[item('b',1)])]);
 assert.equal(inventorySnapshot(s).totalPending,1);s=status(s,'A','Hủy');assert.equal(inventorySnapshot(s).totalPending,0);assert.equal(inventorySnapshot(s).totalStock,1);
 assert.equal(s.inventory.allocations[0].orderId,'B');
});
check('Factory goods from canceled orders become stock; reopening removes that source',()=>{
 let s=receive(shop([order('A',[item('a',3)])]));s=status(s,'A','Hủy');assert.equal(inventorySnapshot(s).totalStock,3);
 s=add(s,order('B',[item('b',2)]));assert.equal(inventorySnapshot(s).totalStock,1);assert.equal(inventorySnapshot(s).totalPending,0);
 s=status(s,'A','Mới');assert.equal(inventorySnapshot(s).totalStock,0);assert.equal(inventorySnapshot(s).requirements.find(r=>r.orderId==='B').pending,2);
 assert.equal(inventorySnapshot(s).requirements.find(r=>r.orderId==='A').pending,0);
});
check('Returning goods originally taken from stock does not double-count their original source',()=>{
 let s=shop([order('R',[item('r',2)],'Hoàn'),order('A',[item('a',2)])]);s=status(s,'A','Đã gửi');s=status(s,'A','Hoàn');
 assert.equal(inventorySnapshot(s).totalStock,2);assert.equal(s.inventory.returnReceipts.length,2);
 s=save(s,s);assert.equal(inventorySnapshot(s).totalStock,2);
 s=status(s,'A','Hủy');assert.equal(inventorySnapshot(s).totalStock,2);
});
check('Unreceived canceled orders create no stock; edit/delete of unpurchased reservations releases stock',()=>{
 let s=shop([order('A',[item('a',2)])]);s=status(s,'A','Hủy');assert.equal(inventorySnapshot(s).totalStock,0);assert.equal(inventorySnapshot(s).totalPending,0);
 s=shop([order('R',[item('r',3)],'Hoàn'),order('A',[item('a',2)])]);
 s=save(s,{...s,orders:s.orders.map(o=>o.id==='A'?{...o,items:[item('a',1)]}:o)});assert.equal(inventorySnapshot(s).totalStock,2);
 s=save(s,{...s,orders:s.orders.filter(o=>o.id!=='A')});assert.equal(inventorySnapshot(s).totalStock,3);
});
check('Server protects real goods from forged receipts, lost history and edits/deletes',()=>{
 let s=shop([order('A',[item('a',2)])]);const request=receiveProcurementBatch(s,day);request.inventory.procurementTaken[0].quantity=3;
 assert.ok(prepareShopUpdate(s,request,day).error);s=receive(s);
 assert.ok(prepareShopUpdate(s,{...s,orders:[]},day).error);
 assert.ok(prepareShopUpdate(s,{...s,orders:[{...s.orders[0],items:[item('a',1)]}]},day).error);
 assert.equal(save(s,{...s,inventory:undefined}).inventory.procurementTaken[0].quantity,2);
 const forged={...s,inventory:{...s.inventory,allocations:[{orderId:'A',itemId:'a',variant:variantKey(item('a')),quantity:99}]}};
 assert.equal(save(s,forged).inventory.allocations.length,0);
});
check('Rollback cannot erase stock that has already physically left on another order',()=>{
 let s=shop([order('R',[item('r')],'Hoàn'),order('A',[item('a')])]);s=status(s,'A','Đã gửi');
 assert.ok(prepareShopUpdate(s,{...s,orders:s.orders.map(o=>o.id==='R'?{...o,status:'Giao thành công'}:o)},day).error);
 // Returning/canceling the consumer first makes the original source available to roll back.
 s=status(s,'A','Hủy');s=status(s,'R','Giao thành công');assert.equal(inventorySnapshot(s).totalStock,0);
});
console.log(`\n${checks} inventory lifecycle scenarios passed.`);
