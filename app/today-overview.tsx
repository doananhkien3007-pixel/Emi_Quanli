'use client';
import { useId, useState } from 'react';
import { ArrowRight, Megaphone, Target, TrendingUp, Package } from 'lucide-react';
import { money, shortMoney } from '../lib/model';
import type { todayOperations } from '../lib/analytics';

type Operations=ReturnType<typeof todayOperations>;
export function TodayOverview({data,spxCount,neededCount,onSpx,onNeeded,onAds}:{data:Operations;spxCount:number;neededCount:number;onSpx:()=>void;onNeeded:()=>void;onAds:()=>void}){
 const [active,setActive]=useState<number|null>(null),gradient=useId().replaceAll(':','');
 const max=Math.max(...data.hours.map(hour=>hour.value),1)*1.15;
 const x=(hour:number)=>50+hour/23*630,y=(value:number)=>156-value/max*128;
 const points=data.hours.map(hour=>`${x(hour.hour)},${y(hour.value)}`).join(' ');
 const statuses=[{label:'Đơn mới',orders:data.created,color:'#5687ec'},{label:'Giao thành công',orders:data.delivered,color:'#20a580'},{label:'Hoàn',orders:data.returned,color:'#ec8fa4'}];
 const totalEvents=statuses.reduce((sum,status)=>sum+status.orders.length,0);
 const circumference=2*Math.PI*64;
 const selected=active===null?null:data.hours[active];
 const nonEmptyStatuses=statuses.filter(status=>status.orders.length>0).length;
 return <div className="today-overview">
  <section className="today-tasks" aria-labelledby="today-tasks-title">
   <div className="today-tasks-title"><h2 id="today-tasks-title">Cần xử lý</h2><span>{spxCount+neededCount} việc</span></div>
   <div className="today-task-actions"><button onClick={onSpx}><span>Chưa tạo đơn SPX</span><strong>{spxCount}</strong><ArrowRight size={14}/></button><button onClick={onNeeded}><span>Cần lấy hàng từ xưởng</span><strong>{neededCount}</strong><ArrowRight size={14}/></button></div>
  </section>
  <section className="panel today-hourly"><div className="panel-title"><div><h2>Doanh thu theo giờ hôm nay</h2><p>Doanh số đơn chốt hôm nay</p></div><strong className="today-revenue">{money(data.revenue)}</strong></div>
   <div className="today-chart" onPointerLeave={()=>setActive(null)}>
    <div className="hourly-plot"><svg viewBox="0 0 710 190" role="group" aria-label="Doanh số đơn chốt theo giờ Việt Nam">
     <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#20a580" stopOpacity=".12"/><stop offset="100%" stopColor="#20a580" stopOpacity="0"/></linearGradient></defs>
     {[0,1,2].map(i=><g key={i}><line x1="50" x2="680" y1={y(max*i/2)} y2={y(max*i/2)} stroke="#e9eef3" strokeWidth=".7" strokeDasharray={i?'2 6':undefined}/><text x="40" y={y(max*i/2)+3} textAnchor="end" fontSize="10" fill="#97a3b3">{shortMoney(max*i/2)}</text></g>)}
     <polygon points={`50,156 ${points} 680,156`} fill={`url(#${gradient})`}/><polyline points={points} fill="none" stroke="#149777" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
     {selected&&<line x1={x(selected.hour)} x2={x(selected.hour)} y1="24" y2="156" stroke="#83baa9" strokeWidth=".8" strokeDasharray="3 4"/>}
     {data.hours.map(hour=><g key={hour.hour}>{[0,6,12,18,23].includes(hour.hour)&&<text x={x(hour.hour)} y="180" textAnchor="middle" fontSize="10" fill="#97a3b3">{String(hour.hour).padStart(2,'0')}:00</text>}{(hour.count>0||active===hour.hour)&&<circle cx={x(hour.hour)} cy={y(hour.value)} r={active===hour.hour?4.5:3} fill="white" stroke="#149777" strokeWidth="1.8"/>}<rect className="hourly-hit" x={x(hour.hour)-13} y="20" width="26" height="140" fill="transparent" tabIndex={0} role="button" aria-label={`${hour.hour} giờ: ${hour.count} đơn, ${money(hour.value)}`} onPointerEnter={()=>setActive(hour.hour)} onFocus={()=>setActive(hour.hour)} onBlur={()=>setActive(null)} onClick={()=>setActive(hour.hour)} onKeyDown={event=>{if(event.key==='Escape')setActive(null);if(event.key==='Enter'||event.key===' '){event.preventDefault();setActive(hour.hour);}}}/></g>)}
    </svg>
    {selected&&<div className="hourly-tooltip" role="tooltip" style={{left:`${Math.max(17,Math.min(83,x(selected.hour)/710*100))}%`}}><span>{String(selected.hour).padStart(2,'0')}:00 – {String(selected.hour).padStart(2,'0')}:59</span><strong>{money(selected.value)}</strong><small><i/>{selected.count} đơn chốt</small></div>}
    </div>
    <div className="hourly-readout"><span>Giờ Việt Nam · chạm để xem chi tiết</span>{data.unknownCount>0&&<span>{data.unknownCount} đơn chưa có giờ · {money(data.unknownValue)}</span>}</div>
   </div>
  </section>
  <section className="panel today-status"><div className="panel-title"><h2>Trạng thái hôm nay</h2></div>
   <div className="today-status-content"><svg className="today-donut" viewBox="0 0 180 180" role="img" aria-label={totalEvents?statuses.map(status=>`${status.label}: ${status.orders.length} đơn`).join(', '):'Chưa có hoạt động đơn hôm nay'}>
    <circle cx="90" cy="90" r="64" fill="none" stroke="#f1f4f8" strokeWidth="17"/>
    {statuses.map((status,index)=>{const count=status.orders.length;const preceding=statuses.slice(0,index).reduce((sum,item)=>sum+item.orders.length,0);return count>0&&<circle key={status.label} cx="90" cy="90" r="64" fill="none" stroke={status.color} strokeWidth="17" strokeDasharray={`${Math.max(0.1,count/totalEvents*circumference-(nonEmptyStatuses>1?Math.min(4,count/totalEvents*circumference*.15):0))} ${circumference}`} strokeDashoffset={-preceding/totalEvents*circumference} transform="rotate(-90 90 90)"><title>{status.label}: {count} đơn · {money(status.orders.reduce((sum,order)=>sum+order.price,0))}</title></circle>;})}
    <text x="90" y="89" textAnchor="middle" className="donut-value">{totalEvents}</text><text x="90" y="108" textAnchor="middle" className="donut-label">lượt hoạt động</text>
   </svg><div className="today-status-list">{statuses.map(status=><div className="today-status-heading" key={status.label}><span><i style={{background:status.color}}/>{status.label}</span><strong>{status.orders.length}<em>đơn</em></strong><small>{money(status.orders.reduce((sum,order)=>sum+order.price,0))}</small></div>)}</div></div>
  </section>
  <div className="today-ads"><section className="panel mini-today-stat"><div><span>Chi phí Ads hôm nay</span><Megaphone size={19}/></div><strong>{money(data.ads)}</strong><button className="text-button" onClick={onAds}>Nhập Ads<ArrowRight size={13}/></button></section><section className="panel mini-today-stat cpa"><div><span>CPA hôm nay</span><Target size={19}/></div><strong>{data.cpa===null?'—':money(data.cpa)}</strong><small>Ads / đơn chốt hôm nay</small></section><section className="panel mini-today-stat roas"><div><span>ROAS chốt hôm nay</span><TrendingUp size={19}/></div><strong>{data.closedRoas===null?'—':`${data.closedRoas.toLocaleString('vi-VN',{maximumFractionDigits:2})}x`}</strong><small>Doanh thu chốt / Ads hôm nay</small></section><section className="panel mini-today-stat products"><div><span>Số sản phẩm đã chốt</span><Package size={19}/></div><strong>{data.productQuantity.toLocaleString('vi-VN')}</strong><small>Tổng số lượng chốt hôm nay</small></section></div>
 </div>;
}
