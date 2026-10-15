export const statuses = ['Mới','Đã tạo đơn','Đã gửi','Giao thành công','Hoàn','Hủy'] as const;
export type Item={id?:string;product:string;color?:string;size:string;quantity:number;price:number;cost:number};
export type Order = {id:string;date:string;created_at?:string;updated_at?:string;shipped_at?:string;delivered_at?:string;returned_at?:string;spxCode?:string;shippingFee?:number;returnShippingFee?:number;customer:string;phone:string;address:string;product:string;size:string;quantity:number;price:number;cost:number;status:string;note:string;sourceRow?:number;items:Item[]};
export type Expense = {id:string;date:string;category:string;name:string;amount:number;note:string;adFeeRate?:number};
export type ReturnReceipt={orderId:string;receivedAt:string};
export type ProcurementTaken={orderId:string;itemId:string;variant:string;quantity:number;takenAt:string};
export type InventoryAllocation={orderId:string;itemId:string;variant:string;quantity:number};
export type InventoryState={returnReceipts:ReturnReceipt[];procurementTaken:ProcurementTaken[];allocations:InventoryAllocation[]};
export type Shop = {orders:Order[];expenses:Expense[];products:{name:string;price:number;cost:number}[];settings:{shipping:number;returnShipping:number;platformRate:number;cardRate:number;returnRateThreshold?:number};undatedInbound:number;source:string;inventory?:InventoryState};
export type InventoryRequirement={key:string;orderId:string;itemId:string;customer:string;createdAt:string;product:string;color:string;size:string;ordered:number;fromStock:number;required:number;taken:number;pending:number;status:'Chưa lấy'|'Đã lấy'};
export type InventoryStock={key:string;product:string;color:string;size:string;quantity:number;sourceOrders:string[]};
export const money = (n:number) => new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(n) + ' ₫';
export const shortMoney = (n:number) => Math.abs(n)>=1e6 ? (n/1e6).toLocaleString('vi-VN',{maximumFractionDigits:1})+'tr' : Math.abs(n)>=1000 ? (n/1000).toLocaleString('vi-VN',{maximumFractionDigits:0})+'k' : n.toLocaleString('vi-VN');
const businessDateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'});
export const eventDate = (value?:string) => {if(!value)return '';if(/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&!Number.isNaN(Date.parse(value)))return businessDateFormatter.format(new Date(value));return value.slice(0,10);};
export const createdDate = (order:Order) => eventDate(order.created_at||order.date);
const cleanVariant=(value?:string)=>String(value||'').trim().toLocaleLowerCase('vi');
export const variantKey=(item:Pick<Item,'product'|'color'|'size'>)=>[cleanVariant(item.product),cleanVariant(item.color),cleanVariant(item.size)].join('\u001f');
export const inventoryState=(shop:Shop):InventoryState=>({returnReceipts:shop.inventory?.returnReceipts||[],procurementTaken:shop.inventory?.procurementTaken||[],allocations:shop.inventory?.allocations||[]});
const activeInventoryStatuses=new Set(['Mới','Đã tạo đơn']);
/** Returns are a state-derived receipt: one per order, removed when its status changes. */
function inventorySupply(shop:Shop){
 const previous=inventoryState(shop),ordersById=new Map(shop.orders.map(order=>[order.id,order]));
 const receiptDates=new Map(previous.returnReceipts.map(receipt=>[receipt.orderId,receipt.receivedAt]));
 const returnReceipts=shop.orders.filter(order=>order.status==='Hoàn').map(order=>({orderId:order.id,receivedAt:receiptDates.get(order.id)||order.returned_at||order.date}));
 const state={...previous,returnReceipts};
 const received=returnReceipts.map(receipt=>({receipt,order:ordersById.get(receipt.orderId)!}));
 const supply=new Map<string,number>(),variantInfo=new Map<string,{product:string;color:string;size:string;sourceOrders:Set<string>}>();
 const add=(item:Item,quantity:number,orderId:string)=>{if(quantity<=0)return;const key=variantKey(item);supply.set(key,(supply.get(key)||0)+quantity);const info=variantInfo.get(key)||{product:item.product,color:item.color||'',size:item.size,sourceOrders:new Set<string>()};info.sourceOrders.add(orderId);variantInfo.set(key,info);};
 for(const {order} of received)for(const item of order.items)add(item,item.quantity,order.id);
 // Factory receipts stay attached to waiting/dispatched orders. Only cancellations free them.
 for(const record of state.procurementTaken){const order=ordersById.get(record.orderId);if(order?.status!=='Hủy')continue;const item=order.items.find((item,index)=>(item.id||`${order.id}-${index+1}`)===record.itemId);if(item&&variantKey(item)===record.variant)add(item,record.quantity,order.id);}
 return {state,received,supply,variantInfo};
}
export function reconcileInventory(shop:Shop):Shop{
 const {state,supply}=inventorySupply(shop),remaining=new Map(supply),items=new Map<string,{order:Order;item:Item;itemId:string;key:string}>();
 for(const order of shop.orders){order.items.forEach((item,index)=>{const itemId=item.id||`${order.id}-${index+1}`;items.set(`${order.id}\u001f${itemId}`,{order,item,itemId,key:variantKey(item)});});}
 const allocations:InventoryAllocation[]=[],allocatedByItem=new Map<string,number>();
 const takenByItem=new Map(state.procurementTaken.map(record=>[`${record.orderId}\u001f${record.itemId}`,record]));
 // Keep goods already dispatched ahead of reservations that can still be reassigned.
 const saved=[...state.allocations].sort((a,b)=>Number(activeInventoryStatuses.has(items.get(`${a.orderId}\u001f${a.itemId}`)?.order.status||''))-Number(activeInventoryStatuses.has(items.get(`${b.orderId}\u001f${b.itemId}`)?.order.status||'')));
 for(const allocation of saved){const identity=`${allocation.orderId}\u001f${allocation.itemId}`,ref=items.get(identity);if(!ref||ref.order.status==='Hủy'||ref.key!==allocation.variant)continue;const record=takenByItem.get(identity),procured=record?.variant===ref.key?record.quantity:0;const quantity=Math.min(Math.max(0,allocation.quantity),Math.max(0,ref.item.quantity-procured-(allocatedByItem.get(identity)||0)),Math.max(0,remaining.get(ref.key)||0));if(!quantity)continue;allocations.push({...allocation,quantity});allocatedByItem.set(identity,(allocatedByItem.get(identity)||0)+quantity);remaining.set(ref.key,(remaining.get(ref.key)||0)-quantity);}
 const active=shop.orders.filter(order=>activeInventoryStatuses.has(order.status)).sort((a,b)=>(a.created_at||a.date).localeCompare(b.created_at||b.date)||a.id.localeCompare(b.id));
 for(const order of active){order.items.forEach((item,index)=>{const itemId=item.id||`${order.id}-${index+1}`,identity=`${order.id}\u001f${itemId}`,key=variantKey(item),taken=takenByItem.get(identity),procured=taken?.variant===key?taken.quantity:0,needed=Math.max(0,item.quantity-(allocatedByItem.get(identity)||0)-procured),quantity=Math.min(needed,remaining.get(key)||0);if(!quantity)return;const existing=allocations.find(allocation=>allocation.orderId===order.id&&allocation.itemId===itemId);if(existing)existing.quantity+=quantity;else allocations.push({orderId:order.id,itemId,variant:key,quantity});allocatedByItem.set(identity,(allocatedByItem.get(identity)||0)+quantity);remaining.set(key,(remaining.get(key)||0)-quantity);});}
 return {...shop,inventory:{...state,allocations}};
}
export function inventorySnapshot(shop:Shop){
 const reconciled=reconcileInventory(shop),{state,received,supply,variantInfo}=inventorySupply(reconciled),available=new Map(supply),allocatedByItem=new Map<string,number>();
 for(const allocation of state.allocations){available.set(allocation.variant,Math.max(0,(available.get(allocation.variant)||0)-allocation.quantity));const identity=`${allocation.orderId}\u001f${allocation.itemId}`;allocatedByItem.set(identity,(allocatedByItem.get(identity)||0)+allocation.quantity);}
 const takenMap=new Map(state.procurementTaken.map(record=>[`${record.orderId}\u001f${record.itemId}`,record]));
 const requirements:InventoryRequirement[]=[];
 const demandOrders=shop.orders.filter(order=>activeInventoryStatuses.has(order.status)).sort((a,b)=>(a.created_at||a.date).localeCompare(b.created_at||b.date)||a.id.localeCompare(b.id));
 for(const order of demandOrders){order.items.forEach((item,index)=>{const itemId=item.id||`${order.id}-${index+1}`,identity=`${order.id}\u001f${itemId}`,key=variantKey(item),ordered=Math.max(0,item.quantity),fromStock=Math.min(ordered,allocatedByItem.get(identity)||0),required=ordered-fromStock;if(!required)return;const record=takenMap.get(identity),taken=record?.variant===key?Math.min(required,Math.max(0,record.quantity)):0,pending=required-taken;requirements.push({key,orderId:order.id,itemId,customer:order.customer,createdAt:order.created_at||order.date,product:item.product,color:item.color||'',size:item.size,ordered,fromStock,required,taken,pending,status:pending?'Chưa lấy':'Đã lấy'});});}
 const stock:InventoryStock[]=[...available.entries()].filter(([,quantity])=>quantity>0).map(([key,quantity])=>{const info=variantInfo.get(key)!;return {key,product:info.product,color:info.color,size:info.size,quantity,sourceOrders:[...info.sourceOrders]};}).sort((a,b)=>a.product.localeCompare(b.product,'vi')||a.color.localeCompare(b.color,'vi')||a.size.localeCompare(b.size,'vi'));
 return {requirements,stock,receivedOrders:new Set(received.map(entry=>entry.receipt.orderId)),totalPending:requirements.reduce((sum,row)=>sum+row.pending,0),totalStock:stock.reduce((sum,row)=>sum+row.quantity,0)};
}
export function setReturnReceived(shop:Shop,orderId:string,receivedAt:string,received=true):Shop{
 const state=inventoryState(shop),returnReceipts=state.returnReceipts.filter(receipt=>receipt.orderId!==orderId);
 if(received)returnReceipts.push({orderId,receivedAt});
 return {...shop,inventory:{...state,returnReceipts}};
}
export function setProcurementStatus(shop:Shop,orderId:string,itemId:string,status:'Chưa lấy'|'Đã lấy',takenAt:string):Shop{
 const snapshot=inventorySnapshot(shop),line=snapshot.requirements.find(row=>row.orderId===orderId&&row.itemId===itemId),state=inventoryState(shop),procurementTaken=state.procurementTaken.filter(record=>!(record.orderId===orderId&&record.itemId===itemId));
 if(status==='Đã lấy'&&line)procurementTaken.push({orderId,itemId,variant:line.key,quantity:line.required,takenAt});
 return {...shop,inventory:{...state,procurementTaken}};
}
/** One batch receipt covers only the current shortage, preserving already received lines. */
export function receiveProcurementBatch(shop:Shop,takenAt:string):Shop{
 const reconciled=reconcileInventory(shop),snapshot=inventorySnapshot(reconciled),state=inventoryState(reconciled);
 const taken=new Map(state.procurementTaken.map(record=>[`${record.orderId}\u001f${record.itemId}`,record]));
 for(const row of snapshot.requirements.filter(row=>row.pending>0))taken.set(`${row.orderId}\u001f${row.itemId}`,{orderId:row.orderId,itemId:row.itemId,variant:row.key,quantity:row.required,takenAt});
 return {...reconciled,inventory:{...state,procurementTaken:[...taken.values()]}};
}
export function overviewEvents(shop:Shop,date:string){
 const created=shop.orders.filter(order=>createdDate(order)===date&&order.status!=='Hủy');
 const shipped=shop.orders.filter(order=>(order.shipped_at?eventDate(order.shipped_at)===date:(createdDate(order)===date&&order.status==='Đã gửi')));
 const delivered=shop.orders.filter(order=>(order.delivered_at?eventDate(order.delivered_at)===date:(createdDate(order)===date&&order.status==='Giao thành công')));
 const returned=shop.orders.filter(order=>(order.returned_at?eventDate(order.returned_at)===date:(createdDate(order)===date&&order.status==='Hoàn')));
 const orders=[...new Map([...created,...shipped,...delivered,...returned].map(order=>[order.id,order])).values()];
 const ads=shop.expenses.filter(e=>e.date===date&&e.category==='Quảng cáo').reduce((s,e)=>s+e.amount,0);
 const gross=created.reduce((sum,order)=>sum+order.price,0);
 const queue={
  new:shop.orders.filter(o=>o.status==='Mới').length,
  prepared:shop.orders.filter(o=>o.status==='Đã tạo đơn').length,
  shipped:shop.orders.filter(o=>o.status==='Đã gửi').length,
  returned:shop.orders.filter(o=>o.status==='Hoàn').length
 };
 return {created,shipped,delivered,returned,orders,createdValue:gross,gross,ads,queue};
}
export function metrics(shop:Shop,from:string,to:string,includeUndated=false){
 const orders=shop.orders.filter(o=>createdDate(o)>=from&&createdDate(o)<=to&&o.status!=='Hủy');
 const expenses=shop.expenses.filter(e=>e.date>=from&&e.date<=to);
 const done=orders.filter(o=>o.status==='Giao thành công');
 const returned=orders.filter(o=>o.status==='Hoàn');
 const committed=orders.filter(o=>['Đã tạo đơn','Đã gửi','Giao thành công'].includes(o.status));
 const ads=expenses.filter(e=>e.category==='Quảng cáo').reduce((s,e)=>s+e.amount,0);
 const manual=expenses.filter(e=>e.category!=='Quảng cáo').reduce((s,e)=>s+e.amount,0);
 const gross=orders.reduce((s,o)=>s+o.price,0),revenue=done.reduce((s,o)=>s+o.price,0);
 const cogs=committed.reduce((s,o)=>s+o.cost,0);
 const shippedOrders=[...committed,...returned];
 const shipping=shippedOrders.reduce((sum,order)=>sum+(order.shippingFee??shop.settings.shipping),0)+returned.length*shop.settings.returnShipping;
 const adFees=ads*(shop.settings.platformRate+shop.settings.cardRate)/100;
 const inbound=includeUndated?shop.undatedInbound:0;
 const costs=cogs+ads+manual+shipping+adFees+inbound;
 return {orders,expenses,done,returned,ads,manual,gross,revenue,cogs,shipping,adFees,inbound,costs,profit:revenue-costs,pending:orders.length-done.length-returned.length};
}
