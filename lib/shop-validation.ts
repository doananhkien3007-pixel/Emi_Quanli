import { z } from 'zod';
import { createdDate, inventorySnapshot, inventoryState, reconcileInventory, statuses, variantKey, type Shop } from './model.ts';
const amount=z.number().finite().min(0).max(1e12);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
const dateTime=z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/).refine(value=>!Number.isNaN(Date.parse(value))&&new Date(value.slice(0,10)).toISOString().slice(0,10)===value.slice(0,10));
const line=z.string().max(2000);
const itemSchema=z.object({id:line.min(1).optional(),product:line.min(1),color:line.optional(),size:line,quantity:z.number().int().min(1).max(10000),price:amount,cost:amount});
const inventorySchema=z.object({returnReceipts:z.array(z.object({orderId:line.min(1),receivedAt:dateTime})).max(20000),procurementTaken:z.array(z.object({orderId:line.min(1),itemId:line.min(1),variant:line.min(1),quantity:z.number().int().min(1).max(10000),takenAt:dateTime})).max(20000),allocations:z.array(z.object({orderId:line.min(1),itemId:line.min(1),variant:line.min(1),quantity:z.number().int().min(1).max(10000)})).max(20000),stocktake:z.object({countedOn:date,absorbedReturnOrderIds:z.array(line.min(1)).max(20000),items:z.array(z.object({product:line.min(1),color:line,size:line,quantity:z.number().int().min(1).max(10000),unitCost:amount})).max(500)}).optional()});
export const shopSchema=z.object({revision:z.number().int().min(1),data:z.object({orders:z.array(z.object({id:line.min(1),date,created_at:dateTime.optional(),updated_at:dateTime.optional(),shipped_at:date.optional(),returnShippingFee:amount.optional(),delivered_at:date.optional(),returned_at:date.optional(),spxCode:line.optional(),shippingFee:amount.optional(),customer:line.min(1),phone:line,address:line,product:line.min(1),size:line,quantity:z.number().int().min(1).max(10000),price:amount,cost:amount,status:z.enum(statuses),note:line,sourceRow:z.number().optional(),items:z.array(itemSchema).min(1).max(100)})).max(20000),expenses:z.array(z.object({id:line.min(1),date,category:line.min(1),name:line.min(1),amount,note:line,adFeeRate:z.number().min(0).max(200).optional()})).max(20000),products:z.array(z.object({name:line,price:amount,cost:amount})),settings:z.object({shipping:amount,returnShipping:amount,platformRate:z.number().min(0).max(100),cardRate:z.number().min(0).max(100),returnRateThreshold:z.number().min(0).max(100).optional()}),undatedInbound:amount,source:line,inventory:inventorySchema.optional()})});
export function normalizeShop(input:Shop):Shop{
 const seenItemIds=new Set<string>();
 const orders=input.orders.map(order=>({...order,created_at:order.created_at||order.date,status:order.status==='Đang giao'?'Đã gửi':order.status,items:order.items.map((item,index)=>{let id=item.id?.trim()||`${order.id}-${index+1}`;if(seenItemIds.has(id))id=`${order.id}-${index+1}`;seenItemIds.add(id);return {...item,id,color:item.color?.trim()||''};})}));
 // Legacy mixed-order labels are not sellable products; retain all order items.
 const products=input.products.filter(product=>!['nhiều sp','nhiều sản phẩm'].includes(product.name.trim().toLocaleLowerCase('vi')));
 return reconcileInventory({...input,orders,products});
}

/** Validate stock history and capture defaults before settings can change historical costs. */
export function prepareShopUpdate(previous: Shop, incoming: Shop, day: string, receivedAt?: string): { data: Shop; error?: never } | { error: string; data?: never } {
 const data = structuredClone(incoming);
 const oldOrders = new Map(previous.orders.map(order => [order.id, order]));
 const oldExpenses = new Map(previous.expenses.map(expense => [expense.id, expense]));
 if (new Set(data.orders.map(order => order.id)).size !== data.orders.length || new Set(data.expenses.map(expense => expense.id)).size !== data.expenses.length) return { error: 'Mã bản ghi bị trùng.' };
 const productNames=data.products.map(product=>product.name.trim().toLocaleLowerCase('vi'));
 if(productNames.some(name=>!name)||new Set(productNames).size!==productNames.length)return {error:'Tên sản phẩm phải có nội dung và không được trùng.'};
 const history=inventoryState(previous);
 const signature = (order: Shop['orders'][number]) => JSON.stringify(order.items.map(item => [item.id, variantKey(item), item.quantity]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
 const physicalOrders=new Set([...history.returnReceipts,...history.procurementTaken,...history.allocations.filter(record=>{const order=oldOrders.get(record.orderId);return order&&!['Mới','Đã tạo đơn'].includes(order.status);})].map(record=>record.orderId));
 for(const id of physicalOrders){const old=oldOrders.get(id),next=data.orders.find(order=>order.id===id);if(old&&(!next||signature(old)!==signature(next)))return {error:`Đơn ${id} đã có lịch sử hàng thực tế. Giữ nguyên sản phẩm/màu/size/số lượng; chuyển trạng thái Hủy để trả hàng về kho.`};}
 for (const order of data.orders) {
  const old = oldOrders.get(order.id);
  if (new Set(order.items.map(item => item.id).filter(Boolean)).size !== order.items.filter(item => item.id).length) return { error: 'Mã dòng sản phẩm bị trùng.' };
  if (order.status === 'Đã tạo đơn' && !order.spxCode?.trim() && old?.status !== 'Đã tạo đơn') return { error: 'Vui lòng nhập mã SPX trước khi chuyển sang Đã tạo đơn.' };
  // Older/stale mobile clients may submit only the calendar date. For a new
  // order created today, use the server receipt time so every device can place
  // it on the hourly chart. Never invent a time for historical orders.
  if(!old&&receivedAt&&order.date===day&&!/T\d{2}:/.test(order.created_at||''))order.created_at=receivedAt;
  order.created_at ||= order.date;
  order.date = createdDate(order);
  if (order.date > day) return { error: 'Ngày chốt đơn không được ở tương lai.' };
  if(old?.status==='Hoàn'&&order.status!=='Hoàn')order.returned_at=undefined;
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
 const requested=inventoryState(data).procurementTaken;
 const identity=(record:{orderId:string;itemId:string})=>`${record.orderId}\u001f${record.itemId}`;
 if(new Set(requested.map(identity)).size!==requested.length)return {error:'Dòng nhập hàng bị trùng.'};
 const previousTaken=new Map(history.procurementTaken.map(record=>[identity(record),record]));
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
 for(const record of history.allocations){const next=normalized.orders.find(order=>order.id===record.orderId);if(next&&['Đã gửi','Giao thành công','Hoàn'].includes(next.status)&&(allocations.get(identity(record))||0)<record.quantity)return {error:`Hàng tồn đã được dùng cho đơn ${next.id} đang gửi/đã giao. Không thể thu hồi nguồn hàng này trước khi xử lý đơn đã sử dụng.`};}
 return { data: normalized };
}
