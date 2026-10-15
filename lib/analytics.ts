import { createdDate, eventDate, type Order, type Shop } from './model.ts';

export const shopToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export function offsetDay(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function previousPeriod(from: string, to: string) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  return { from: offsetDay(from, -days), to: offsetDay(from, -1) };
}

export function firstActivityDate(shop: Shop, fallback: string) {
  return [...shop.orders.flatMap(order => [createdDate(order), order.shipped_at, order.delivered_at, order.returned_at]),
    ...shop.expenses.map(expense => expense.date)].filter((date): date is string => !!date).sort()[0] || fallback;
}

/** Historical imports have no event dates. Use their order date visibly, without modifying source data. */
export function financialMetrics(shop: Shop, from: string, to: string, includeUndated = false) {
  const inRange = (date: string) => date >= from && date <= to;
  const orders = shop.orders.filter(order => order.status !== 'Hủy' && inRange(createdDate(order)));
  const expenses = shop.expenses.filter(expense => inRange(expense.date));
  const done = shop.orders.filter(order => (order.status === 'Giao thành công' || order.status === 'Hoàn' && !!order.delivered_at) && inRange(order.delivered_at || createdDate(order)));
  const returned = shop.orders.filter(order => order.status === 'Hoàn' && inRange(order.returned_at || createdDate(order)));
  const refunded = returned.filter(order => !!order.delivered_at);
  // Ship is a cost when the parcel leaves, even if it is later cancelled or returned.
  const shipped = shop.orders.filter(order => (order.shipped_at || ['Đã gửi', 'Giao thành công', 'Hoàn'].includes(order.status))
    && inRange(order.shipped_at || order.delivered_at || order.returned_at || createdDate(order)));
  const sumCategory = (category: string) => expenses.filter(expense => expense.category === category).reduce((sum, expense) => sum + expense.amount, 0);
  const ads = sumCategory('Quảng cáo');
  const grab = sumCategory('Grab');
  const manual = expenses.filter(expense => !['Quảng cáo', 'Grab'].includes(expense.category)).reduce((sum, expense) => sum + expense.amount, 0);
  const refunds = refunded.reduce((sum, order) => sum + order.price, 0);
  const revenue = done.reduce((sum, order) => sum + order.price, 0) - refunds;
  const cogs = done.reduce((sum, order) => sum + order.cost, 0) - refunded.reduce((sum, order) => sum + order.cost, 0);
  const outbound = shipped.reduce((sum, order) => sum + (order.shippingFee ?? shop.settings.shipping), 0);
  const returnShipping = returned.reduce((sum, order) => sum + (order.returnShippingFee ?? shop.settings.returnShipping), 0);
  const adFees = expenses.filter(expense => expense.category === 'Quảng cáo').reduce((sum, expense) => sum + Math.round(expense.amount * (expense.adFeeRate ?? (shop.settings.platformRate + shop.settings.cardRate)) / 100), 0);
  const inbound = includeUndated ? shop.undatedInbound : 0;
  const costs = cogs + ads + outbound + returnShipping + adFees + grab + manual + inbound;
  const profit = revenue - costs;
  const estimatedOrders = [...new Set([
    ...done.filter(order => !order.delivered_at).map(order => order.id),
    ...returned.filter(order => !order.returned_at).map(order => order.id),
    ...shipped.filter(order => !order.shipped_at).map(order => order.id),
  ])];
  const missingCost = done.filter(order => order.items.some(item => item.cost === 0));
  const pendingOrders = orders.filter(order => ['Mới', 'Đã tạo đơn', 'Đã gửi'].includes(order.status));
  return {
    orders, expenses, done, returned, shipped, refunded, refunds, ads, grab, manual, revenue, cogs, outbound, returnShipping,
    shipping: outbound + returnShipping, adFees, inbound, costs, profit, estimatedOrders, missingCost,
    provisional: estimatedOrders.length > 0 || missingCost.length > 0 || (!includeUndated && shop.undatedInbound > 0),
    gross: orders.reduce((sum, order) => sum + order.price, 0),
    pending: pendingOrders.length, pendingValue: pendingOrders.reduce((sum, order) => sum + order.price, 0),
    margin: revenue > 0 ? profit / revenue * 100 : null,
    cpa: orders.length ? ads / orders.length : null,
    deliveredCpa: done.length ? ads / done.length : null,
    roas: ads > 0 ? revenue / ads : null,
    profitPerDelivery: done.length ? profit / done.length : null,
  };
}

export type FinancialMetric = ReturnType<typeof financialMetrics>;
export type DailyMetric = FinancialMetric & { date: string; endDate?: string };

/** Attribute final order outcomes and their shipping costs to the original close date. */
export function cohortFinancialMetrics(shop:Shop,from:string,to:string,includeUndated=false):FinancialMetric {
  const selected=shop.orders.filter(order=>createdDate(order)>=from&&createdDate(order)<=to);
  const cohortShop={...shop,orders:selected.map(order=>({...order,
    shipped_at:order.shipped_at?createdDate(order):undefined,
    delivered_at:order.delivered_at?createdDate(order):undefined,
    returned_at:order.returned_at?createdDate(order):undefined,
  }))};
  const result=financialMetrics(cohortShop,from,to,includeUndated);
  const done=selected.filter(order=>order.status==='Giao thành công');
  const returned=selected.filter(order=>order.status==='Hoàn');
  return {...result,orders:selected.filter(order=>order.status!=='Hủy'),done,returned,
    estimatedOrders:[],provisional:result.pending>0||result.missingCost.length>0||(!includeUndated&&shop.undatedInbound>0),
    deliveredCpa:done.length?result.ads/done.length:null,
    profitPerDelivery:done.length?result.profit/done.length:null};
}

export const needsSpx=(order:Order)=>['Mới','Đã tạo đơn'].includes(order.status)&&!order.spxCode?.trim();

export function todayOperations(shop:Shop,date:string){
  const events=activityMetrics(shop,date,date);
  const ads=shop.expenses.filter(expense=>expense.date===date&&expense.category==='Quảng cáo').reduce((sum,expense)=>sum+expense.amount,0);
  const hours=Array.from({length:24},(_,hour)=>({hour,value:0,count:0}));
  let unknownValue=0,unknownCount=0;
  const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',hourCycle:'h23'});
  for(const order of events.created){
    const value=order.created_at;
    const hour=value&&/T\d{2}:/.test(value)?(/[Zz]|[+-]\d{2}:\d{2}$/.test(value)?Number(formatter.format(new Date(value))):Number(value.slice(11,13))):null;
    if(hour===null||!Number.isInteger(hour)||hour<0||hour>23){unknownValue+=order.price;unknownCount++;continue;}
    hours[hour].value+=order.price;hours[hour].count++;
  }
  const revenue=events.created.reduce((sum,order)=>sum+order.price,0);
  const productQuantity=events.created.reduce((sum,order)=>sum+order.items.reduce((quantity,item)=>quantity+item.quantity,0),0);
  return {...events,ads,cpa:events.created.length?ads/events.created.length:null,
    revenue,closedRoas:ads>0?revenue/ads:null,productQuantity,hours,unknownValue,unknownCount};
}

/** Operational event counts never substitute the close date for an unknown delivery date. */
export function activityMetrics(shop: Shop, from: string, to: string, includeUnknown = false) {
  const inRange=(value?:string)=>!!value&&eventDate(value)>=from&&eventDate(value)<=to;
  const created=shop.orders.filter(order=>order.status!=='Hủy'&&inRange(order.created_at||order.date));
  const delivered=shop.orders.filter(order=>inRange(order.delivered_at)||(includeUnknown&&!order.delivered_at&&order.status==='Giao thành công'));
  const returned=shop.orders.filter(order=>inRange(order.returned_at)||(includeUnknown&&!order.returned_at&&order.status==='Hoàn'));
  const missingDelivered=shop.orders.filter(order=>order.status==='Giao thành công'&&!order.delivered_at).length;
  const missingReturned=shop.orders.filter(order=>order.status==='Hoàn'&&!order.returned_at).length;
  return {created,delivered,returned,missingDelivered,missingReturned};
}

/** Equal buckets, including zero-activity days. Long ranges are grouped, never silently truncated. */
export function financialSeries(shop: Shop, from: string, to: string, basis:'event'|'cohort'='event'): DailyMetric[] {
  const totalDays = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (!Number.isFinite(totalDays) || totalDays < 1) return [];
  const step = Math.max(1, Math.ceil(totalDays / 90));
  return Array.from({ length: Math.ceil(totalDays / step) }, (_, index) => {
    const date = offsetDay(from, index * step);
    const endDate = offsetDay(from, Math.min(totalDays - 1, (index + 1) * step - 1));
    return { date, endDate, ...(basis==='cohort'?cohortFinancialMetrics:financialMetrics)(shop, date, endDate) };
  });
}

export function cohortMetrics(shop: Shop, from: string, to: string) {
  const orders = shop.orders.filter(order => order.status !== 'Hủy' && createdDate(order) >= from && createdDate(order) <= to);
  const done = orders.filter(order => order.status === 'Giao thành công').length;
  const returned = orders.filter(order => order.status === 'Hoàn').length;
  return { orders, done, returned, pending: orders.length - done - returned,
    returnRate: done + returned ? returned / (done + returned) * 100 : null,
    successRate: done + returned ? done / (done + returned) * 100 : null };
}

export function isStaleOrder(order: Order, today: string) {
  return ['Mới', 'Đã tạo đơn', 'Đã gửi'].includes(order.status)
    && eventDate(order.updated_at || order.shipped_at || order.created_at || order.date) <= offsetDay(today, -3);
}

export type CohortFinancialMetric = ReturnType<typeof cohortFinancialMetrics>;
export type CohortDailyMetric = CohortFinancialMetric & { date: string; endDate?: string };

export function cohortSeries(shop: Shop, from: string, to: string): CohortDailyMetric[] {
  const totalDays = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (!Number.isFinite(totalDays) || totalDays < 1) return [];
  const step = Math.max(1, Math.ceil(totalDays / 90));
  return Array.from({ length: Math.ceil(totalDays / step) }, (_, index) => {
    const date = offsetDay(from, index * step);
    const endDate = offsetDay(from, Math.min(totalDays - 1, (index + 1) * step - 1));
    return { date, endDate, ...cohortFinancialMetrics(shop, date, endDate) };
  });
}
