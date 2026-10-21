import { z } from 'zod';
import { createdDate, inventorySnapshot, inventoryState, reconcileInventory, statuses, variantKey, type Shop } from './model.ts';
const amount=z.number().finite().min(0).max(1e12);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
// PostgreSQL/Supabase can serialize timestamptz values with microseconds, while
// browser-generated ISO timestamps commonly contain milliseconds. Accept both
// (and nanosecond precision) without relaxing the required ISO-8601 shape.
const dateTime=z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/).refine(value=>!Number.isNaN(Date.parse(value))&&new Date(value.slice(0,10)).toISOString().slice(0,10)===value.slice(0,10));
const line=z.string().max(2000);
const productImageData=z.string().max(240000).regex(/^data:image\/(?:jpeg|webp|png);base64,[A-Za-z0-9+/]+={0,2}$/);
const metaAdSpendSchema=z.object({date,amount,currency:z.string().regex(/^[A-Z]{3}$/),syncedAt:dateTime,adFeeRate:z.number().min(0).max(200).optional()});
const itemSchema=z.object({id:line.min(1).optional(),product:line.min(1),color:line.optional(),size:line,quantity:z.number().int().min(1).max(10000),price:amount,cost:amount});
const inventorySchema=z.object({returnReceipts:z.array(z.object({orderId:line.min(1),receivedAt:dateTime})).max(20000),procurementTaken:z.array(z.object({orderId:line.min(1),itemId:line.min(1),variant:line.min(1),quantity:z.number().int().min(1).max(10000),takenAt:dateTime})).max(20000),allocations:z.array(z.object({orderId:line.min(1),itemId:line.min(1),variant:line.min(1),quantity:z.number().int().min(1).max(10000)})).max(20000),stocktake:z.object({countedOn:date,absorbedReturnOrderIds:z.array(line.min(1)).max(20000),items:z.array(z.object({product:line.min(1),color:line,size:line,quantity:z.number().int().min(1).max(10000),unitCost:amount})).max(500)}).optional()});
export const shopSchema=z.object({revision:z.number().int().min(1),data:z.object({orders:z.array(z.object({id:line.min(1),date,created_at:dateTime.optional(),updated_at:dateTime.optional(),shipped_at:date.optional(),returnShippingFee:amount.optional(),delivered_at:date.optional(),returned_at:date.optional(),spxCode:line.optional(),shippingFee:amount.optional(),customer:line.min(1),phone:line,address:line,product:line.min(1),size:line,quantity:z.number().int().min(1).max(10000),price:amount,cost:amount,status:z.enum(statuses),note:line,sourceRow:z.number().optional(),items:z.array(itemSchema).min(1).max(100)})).max(20000),expenses:z.array(z.object({id:line.min(1),date,category:line.min(1),name:line.min(1),amount,note:line,adFeeRate:z.number().min(0).max(200).optional(),source:z.enum(['manual','meta']).optional()})).max(20000),metaAdSpend:z.array(metaAdSpendSchema).max(4000).optional(),products:z.array(z.object({name:line,price:amount,cost:amount,image:productImageData.optional()})),settings:z.object({shipping:amount,returnShipping:amount,platformRate:z.number().min(0).max(100),cardRate:z.number().min(0).max(100),returnRateThreshold:z.number().min(0).max(100).optional()}),undatedInbound:amount,source:line,inventory:inventorySchema.optional()})});
export function normalizeShop(input:Shop):Shop{
 const seenItemIds=new Set<string>();
 const orders=input.orders.map(order=>{
  const status=order.status==='Đang giao'?'Đã gửi':order.status;
  const waiting=['Mới','Đã tạo đơn'].includes(status);
  return {...order,created_at:order.created_at||order.date,status,
   shipped_at:waiting?undefined:order.shipped_at,
   delivered_at:['Giao thành công','Hoàn'].includes(status)?order.delivered_at:undefined,
   returned_at:status==='Hoàn'?order.returned_at:undefined,
   items:order.items.map((item,index)=>{let id=item.id?.trim()||`${order.id}-${index+1}`;if(seenItemIds.has(id))id=`${order.id}-${index+1}`;seenItemIds.add(id);return {...item,id,color:item.color?.trim()||''};})};
 });
 // Legacy mixed-order labels are not sellable products; retain all order items.
 const products=input.products.filter(product=>!['nhiều sp','nhiều sản phẩm'].includes(product.name.trim().toLocaleLowerCase('vi')));
 return reconcileInventory({...input,orders,products});
}

/** Validate stock history and capture defaults before settings can change historical costs. */
export function prepareShopUpdate(previous: Shop, incoming: Shop, day: string): { data: Shop; error?: never } | { error: string; data?: never } {
 const data = structuredClone(incoming);
 // Cron-owned values are read-only; never trust or persist a browser-supplied replacement.
 data.metaAdSpend=structuredClone(previous.metaAdSpend||[]);
 const oldOrders = new Map(previous.orders.map(order => [order.id, order]));
 const oldExpenses = new Map(previous.expenses.map(expense => [expense.id, expense]));
 if (new Set(data.orders.map(order => order.id)).size !== data.orders.length || new Set(data.expenses.map(expense => expense.id)).size !== data.expenses.length) return { error: 'Mã bản ghi bị trùng.' };
 const productNames=data.products.map(product=>product.name.trim().toLocaleLowerCase('vi'));
 if(productNames.some(name=>!name)||new Set(productNames).size!==productNames.length)return {error:'Tên sản phẩm phải có nội dung và không được trùng.'};
 const history=inventoryState(previous);
 const signature = (order: Shop['orders'][number]) => JSON.stringify(order.items.map(item => [item.id, variantKey(item), item.quantity]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
 const returnedOrders=new Set(history.returnReceipts.map(record=>record.orderId));
 const procurementOrders=new Set(history.procurementTaken.map(record=>record.orderId));
 const allocatedOrders=new Set(history.allocations.map(record=>record.orderId));
 const correctedProcurementOrders=new Set<string>();
 const correctedInventoryOrders=new Set<string>();
 for(const [id,old] of oldOrders){const next=data.orders.find(order=>order.id===id);if(next&&signature(old)===signature(next))continue;
  const hasProcurement=procurementOrders.has(id),hasAllocation=allocatedOrders.has(id);
  const hasDispatchedAllocation=hasAllocation&&!['Mới','Đã tạo đơn'].includes(old.status);
  // A returned order is itself a stock source, and a canceled procured order has
  // already turned its factory goods into stock. Editing either would rewrite
  // stock that may already have been used elsewhere. A dispatched consumer is
  // different: editing its lines is a correction, so reconcileInventory can
  // release or resize only that order's allocation/procurement records.
  if(returnedOrders.has(id)||(hasProcurement||hasDispatchedAllocation)&&(!next||old.status==='Hủy'||next.status==='Hủy'))return {error:`Đơn ${id} đã dùng hàng tồn hoặc tạo nguồn hàng thực tế. Không thể sửa sản phẩm/màu/size/số lượng.`};
  if(next&&(hasProcurement||hasAllocation))correctedInventoryOrders.add(id);
  if(next&&hasProcurement)correctedProcurementOrders.add(id);
 }
 for (const order of data.orders) {
  const old = oldOrders.get(order.id);
  if (new Set(order.items.map(item => item.id).filter(Boolean)).size !== order.items.filter(item => item.id).length) return { error: 'Mã dòng sản phẩm bị trùng.' };
  if (order.status === 'Đã tạo đơn' && !order.spxCode?.trim() && old?.status !== 'Đã tạo đơn') return { error: 'Vui lòng nhập mã SPX trước khi chuyển sang Đã tạo đơn.' };
  // Creation time is an explicit stored value supplied by the order form.
  // Never infer it from the current server clock; legacy rows without a time
  // stay undated on the hourly chart.
  order.created_at ||= order.date;
  order.date = createdDate(order);
  if (order.date > day) return { error: 'Ngày chốt đơn không được ở tương lai.' };
  // Event dates follow the current order state. When a status is corrected
  // backwards, remove later milestones so dashboards cannot count stale
  // delivery/return events. A returned order may keep delivered_at because it
  // can represent a real delivery that was refunded later.
  if(['Mới','Đã tạo đơn'].includes(order.status)&&(old?.shipped_at||old?.status!==order.status))order.shipped_at=undefined;
  if(!['Giao thành công','Hoàn'].includes(order.status))order.delivered_at=undefined;
  if(order.status!=='Hoàn')order.returned_at=undefined;
  if (!old || old.status !== order.status) {
   // Do not invent missing shipping dates when a legacy in-transit order completes.
   if (order.status === 'Đã gửi' || (!old || ['Mới','Đã tạo đơn'].includes(old.status)) && ['Giao thành công','Hoàn'].includes(order.status)) order.shipped_at ||= day;
   if (order.status === 'Giao thành công') order.delivered_at ||= day;
   if (order.status === 'Hoàn') order.returned_at ||= day;
  }
  for (const event of [order.shipped_at, order.delivered_at, order.returned_at]) {
   if (event && (event < order.date || event > day)) return { error: `Ngày giao nhận đơn ${order.id} phải từ ngày chốt đến hôm nay.` };
  }
  if (order.shipped_at && [order.delivered_at,order.returned_at].some(event=>event && event < order.shipped_at!)) return { error: `Ngày giao/hoàn đơn ${order.id} không thể trước ngày gửi.` };
  order.price = order.items.reduce((sum,item)=>sum+item.price,0);
  order.cost = order.items.reduce((sum,item)=>sum+item.cost,0);
  order.quantity = order.items.reduce((sum,item)=>sum+item.quantity,0);
  order.product = [...new Set(order.items.map(item=>item.product))].join(' + ');
  order.size = [...new Set(order.items.map(item=>item.size).filter(Boolean))].join(', ');
  order.shippingFee ??= old?.shippingFee ?? previous.settings.shipping;
  order.returnShippingFee ??= old?.returnShippingFee ?? previous.settings.returnShipping;
  // Changing the cost defaults alone is not an order activity.
  const comparable = (value: typeof order) => JSON.stringify([
   value.id,value.date,value.created_at,value.customer,value.phone,value.address,value.status,value.note,
   value.spxCode||'',value.shipped_at||'',value.delivered_at||'',value.returned_at||'',
   value.items.map(item=>[item.id,item.product,item.color||'',item.size,item.quantity,item.price,item.cost]),
  ]);
  order.updated_at = !old || comparable(order) !== comparable(old) ? day : old.updated_at;
 }
 for (const expense of data.expenses) {
  if (expense.category === 'Quảng cáo') expense.adFeeRate = oldExpenses.get(expense.id)?.adFeeRate ?? previous.settings.platformRate + previous.settings.cardRate;
 }
 // Inventory history is authoritative on the server. Clients request only extra factory receipts.
 const requested=inventoryState(data).procurementTaken.filter(record=>!correctedProcurementOrders.has(record.orderId));
 const identity=(record:{orderId:string;itemId:string})=>`${record.orderId}\u001f${record.itemId}`;
 if(new Set(requested.map(identity)).size!==requested.length)return {error:'Dòng nhập hàng bị trùng.'};
 const previousTaken=new Map(history.procurementTaken.filter(record=>!correctedProcurementOrders.has(record.orderId)).map(record=>[identity(record),record]));
 for(const orderId of correctedProcurementOrders){const order=data.orders.find(value=>value.id===orderId)!,oldRecords=history.procurementTaken.filter(record=>record.orderId===orderId),oldByItem=new Map(oldRecords.map(record=>[record.itemId,record]));
  order.items.forEach((item,index)=>{const itemId=item.id||`${order.id}-${index+1}`,old=oldByItem.get(itemId);if(!old)return;previousTaken.set(identity({orderId,itemId}),{orderId,itemId,variant:variantKey(item),quantity:Math.min(old.quantity,item.quantity),takenAt:old.takenAt});});
 }
 data.inventory={...history,procurementTaken:[...previousTaken.values()]};
 const shortages=new Map(inventorySnapshot(data).requirements.map(row=>[identity(row),row]));
 for(const record of requested){const old=previousTaken.get(identity(record));
  if(old&&(record.variant!==old.variant||record.quantity<old.quantity))return {error:'Không thể giảm hoặc đổi SKU của hàng đã nhập.'};
  const extra=record.quantity-(old?.quantity||0);if(!extra)continue;
  const row=shortages.get(identity(record));
  if(!row||row.key!==record.variant||extra>row.pending)return {error:'Số lượng nhập vượt phần thiếu của đơn đang chờ. Tải lại kho trước khi nhập.'};
  if(record.takenAt.slice(0,10)<createdDate(data.orders.find(order=>order.id===record.orderId)!)||record.takenAt.slice(0,10)>day)return {error:'Ngày nhập hàng phải từ ngày chốt đến hôm nay.'};
  previousTaken.set(identity(record),record);
 }
 data.inventory.procurementTaken=[...previousTaken.values()];
 const normalized=normalizeShop(data);
 const allocations=new Map(inventoryState(normalized).allocations.map(record=>[identity(record),record.quantity]));
 for(const record of history.allocations){const next=normalized.orders.find(order=>order.id===record.orderId);if(next&&!correctedInventoryOrders.has(record.orderId)&&['Đã gửi','Giao thành công','Hoàn'].includes(next.status)&&(allocations.get(identity(record))||0)<record.quantity)return {error:`Hàng tồn đã được dùng cho đơn ${next.id} đang gửi/đã giao. Không thể thu hồi nguồn hàng này trước khi xử lý đơn đã sử dụng.`};}
 return { data: normalized };
}
