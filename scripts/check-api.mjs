// Use only the isolated Wrangler runtime documented in AUDIT.md, never the shop's dev database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { activityMetrics, financialMetrics, offsetDay, shopToday } from '../lib/analytics.ts';
import { inventorySnapshot, receiveProcurementBatch } from '../lib/model.ts';
const base=process.env.INVENTORY_QA_PORT==='5192'?'http://127.0.0.1:5192':'http://127.0.0.1:5191';
const owner='qa-'+randomUUID();
const headers={'oai-authenticated-user-id':owner,'oai-authenticated-user-email':'qa@example.test'};
async function request(method='GET',body,extra={},auth=true){const response=await fetch(base+'/api/shop',{method,headers:{...(auth?headers:{}),'Content-Type':'application/json',...extra},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()};}
assert.equal((await request('GET',undefined,{},false)).status,401);
let response=await request();assert.equal(response.status,200);let snapshot=response.body;
assert.equal(snapshot.data.orders.length,0);assert.equal(snapshot.data.products.length,0);
async function save(data){const result=await request('PUT',{revision:snapshot.revision,data});assert.equal(result.status,200,JSON.stringify(result.body));snapshot=result.body;return snapshot.data;}
const day=shopToday(),closed=offsetDay(day,-3);
const item={id:'line-1',product:'QA product',color:'QA blue',size:'M',quantity:1,price:300000,cost:100000};
const order={id:'QA-1',date:closed,created_at:closed+'T10:00:00+07:00',customer:'QA synthetic',phone:'',address:'',product:item.product,size:'M',quantity:1,price:300000,cost:100000,status:'Mới',note:'',items:[item]};
await save({...snapshot.data,products:[{name:item.product,price:300000,cost:100000}],orders:[order,{...order,id:'QA-2',items:[{...item,id:'line-2'}]},{...order,id:'QA-3',items:[{...item,id:'line-3'}]}]});
assert.equal(inventorySnapshot(snapshot.data).totalPending,3);
await save(receiveProcurementBatch(snapshot.data,day));assert.equal(inventorySnapshot(snapshot.data).totalPending,0);
const staleRevision=snapshot.revision;
await save({...snapshot.data,orders:snapshot.data.orders.map((o,index)=>({...o,status:index===2?'Hoàn':'Giao thành công'}))});
let events=activityMetrics(snapshot.data,day,day);assert.equal(events.created.length,0);assert.equal(events.delivered.length,2);assert.equal(events.returned.length,1);assert.equal(financialMetrics(snapshot.data,day,day).revenue,600000);
assert.equal((await request('PUT',{revision:staleRevision,data:snapshot.data})).status,409);
assert.equal((await request('PUT',{revision:snapshot.revision,data:snapshot.data},{origin:'https://untrusted.example'})).status,403);
assert.equal((await request('PUT',{revision:snapshot.revision,data:{...snapshot.data,orders:[{...order,cost:-1}]}})).status,400);
assert.equal(inventorySnapshot(snapshot.data).totalStock,1); // Hoàn auto-receives; no confirmation action.
await save(snapshot.data);assert.equal(inventorySnapshot(snapshot.data).totalStock,1);
await save({...snapshot.data,orders:[...snapshot.data.orders,{...order,id:'QA-4',date:day,created_at:day,items:[{...item,id:'line-4'}]}]});assert.equal(inventorySnapshot(snapshot.data).totalPending,0);assert.equal(inventorySnapshot(snapshot.data).totalStock,0);
await save({...snapshot.data,orders:snapshot.data.orders.map(o=>o.id==='QA-3'?{...o,status:'Giao thành công'}:o)});
assert.equal(inventorySnapshot(snapshot.data).totalPending,1);assert.equal(inventorySnapshot(snapshot.data).totalStock,0);
await save({...snapshot.data,orders:snapshot.data.orders.map(o=>o.id==='QA-3'?{...o,status:'Hủy'}:o)});
assert.equal(inventorySnapshot(snapshot.data).totalPending,0);assert.equal(inventorySnapshot(snapshot.data).totalStock,0);
await save({...snapshot.data,orders:snapshot.data.orders.map(o=>o.id==='QA-4'?{...o,status:'Hủy'}:o)});
assert.equal(inventorySnapshot(snapshot.data).totalStock,1);
const reloaded=await request();assert.equal(reloaded.body.revision,snapshot.revision);assert.equal(reloaded.body.data.orders.length,4);assert.equal(reloaded.body.data.inventory.returnReceipts.length,0);
const other=await request('GET',undefined,{'oai-authenticated-user-id':owner+'-other'});assert.equal(other.body.data.orders.length,0);
console.log('PASS: production API + isolated D1 — authentication, empty new tenants, create/persist/read, atomic batch, cross-day deliveries/returns, return stock reuse, validation, origin rejection, revision conflicts and owner isolation.');
