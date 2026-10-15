'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, BadgeDollarSign, BadgePercent, ChartNoAxesCombined, CircleCheck, Clock, Info, Megaphone, ReceiptText, ShoppingBag, Target, TrendingDown, TrendingUp, Wallet, X } from 'lucide-react';
import { money } from '../lib/model';
import { type DailyMetric, type FinancialMetric, type CohortDailyMetric, type CohortFinancialMetric, type cohortMetrics } from '../lib/analytics';
import { RevenueChart } from './dashboard-presentation';

type Metric=FinancialMetric|CohortFinancialMetric;
export function DismissibleNotice({id,label,children}:{id:string;label:string;children:ReactNode}){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{const timer=window.setTimeout(()=>{try{setVisible(localStorage.getItem(`emi-hidden-notice-${id}`)!=='true');}catch{setVisible(true);}},0);return()=>window.clearTimeout(timer);},[id]);
 function dismiss(){setVisible(false);try{localStorage.setItem(`emi-hidden-notice-${id}`,'true');}catch{/* Keep the notice hidden for this session if storage is unavailable. */}}
 if(!visible)return null;
 return <div className="dismissible-notice">{children}<button type="button" className="notice-dismiss" aria-label={`Ẩn thông báo ${label}`} title="Ẩn và không hiển thị lại" onClick={dismiss}><X size={15}/></button></div>;
}
const percent=(value:number|null)=>value===null?'—':`${value.toLocaleString('vi-VN',{maximumFractionDigits:1})}%`;

function costCategories(metric:Metric){
 const returnShipping='returnShipping' in metric?(metric.returnShipping??0):0;
 const grab='grab' in metric?(metric.grab??0):0;
 return [
  {label:'Giá vốn',amount:metric.cogs,color:'#0d9488'},
  {label:'Facebook Ads',amount:metric.ads,color:'#7c6ac8'},
  {label:'Vận chuyển',amount:metric.outbound+returnShipping,color:'#4f83d1'},
  {label:'Phí nền tảng / thẻ',amount:metric.adFees,color:'#a78bfa'},
  ...(grab>0?[{label:'Grab',amount:grab,color:'#d69a3a'}]:[]),
  {label:'Chi phí khác',amount:metric.manual+(metric.inbound||0),color:'#94a3b8'},
 ];
}

export function DataQualityNote({metric,undated,includeUndated}:{metric:FinancialMetric;undated:number;includeUndated:boolean;cohort?:boolean}){
 if(!metric.provisional&&!metric.inbound)return null;
 return <details className="data-quality compact-quality"><summary><Info size={14}/><span>{metric.provisional?'Số liệu đang tạm tính':'Có chi phí chưa xác định ngày'}</span></summary><div>
  {metric.pending>0&&<p>{metric.pending} đơn chưa có kết quả.</p>}
  {metric.missingCost.length>0&&<p>{metric.missingCost.length} đơn chưa đủ giá vốn.</p>}
  {metric.estimatedOrders.length>0&&<p>{metric.estimatedOrders.length} đơn thiếu ngày vận hành.</p>}
  {undated>0&&<p>{money(undated)} vận chuyển về kho {includeUndated?'đã tính trong tổng kỳ.':'chưa nằm trong kỳ này.'}</p>}
 </div></details>;
}

export function BusinessResult({metric}:{metric:Metric}){
 const isNegative=metric.profit<0;
 const values=[
  {label:'Doanh thu thực',value:money(metric.revenue),icon:BadgeDollarSign,accent:'blue'},
  {label:'Tổng chi phí',value:money(metric.costs),icon:ReceiptText,accent:'slate'},
  {label:metric.provisional?'Lợi nhuận tạm tính':'Lợi nhuận',value:money(metric.profit),emphasis:true,negative:isNegative,icon:isNegative?TrendingDown:TrendingUp,accent:isNegative?'rose':'emerald'},
  {label:'Biên lợi nhuận',value:percent(metric.margin),icon:BadgePercent,accent:'teal'},
 ];
 const supporting=[
  {label:'Doanh số chốt',value:money(metric.gross),icon:ShoppingBag},
  {label:'Giá trị đang xử lý',value:money(metric.pendingValue),icon:Clock},
  {label:'Lợi nhuận/đơn thành công',value:metric.profitPerDelivery===null?'—':money(metric.profitPerDelivery),icon:CircleCheck},
 ];
 return <section className="panel business-result"><div className="analysis-section-title"><div className="title-with-badge"><span className="title-icon-badge"><ChartNoAxesCombined size={15} strokeWidth={2.2}/></span><h2>Kết quả kinh doanh</h2></div><small>{metric.provisional?'Số liệu tạm tính':'Kết quả đã ghi nhận'}{metric.pending>0?` · ${metric.pending} đơn đang xử lý`:''}</small></div><div className="business-result-grid">{values.map(item=><article key={item.label} className={`${item.emphasis?'result-emphasis':''} ${item.negative?'result-negative':''}`}><div className="result-label-row"><span>{item.label}</span><span className={`result-mini-icon accent-${item.accent}`}><item.icon size={16} strokeWidth={2}/></span></div><strong title={item.value}>{item.value}</strong></article>)}</div><dl className="business-result-supporting">{supporting.map(item=><div key={item.label}><dt><span className="supporting-icon-wrap"><item.icon size={12} strokeWidth={2}/></span><span>{item.label}</span></dt><dd>{item.value}</dd></div>)}</dl></section>;
}

export function AdPerformance({metric}:{metric:Metric}){
 return <section className="panel compact-analysis-section ad-performance"><div className="analysis-section-title"><div><h2>Hiệu quả quảng cáo</h2></div><Megaphone size={17}/></div><dl className="compact-analysis-metrics"><div><dt>Chi phí Ads</dt><dd>{money(metric.ads)}</dd></div><div><dt>CPA chốt</dt><dd>{metric.cpa===null?'—':money(metric.cpa)}</dd></div><div><dt>CPA thành công</dt><dd>{metric.deliveredCpa===null?'—':money(metric.deliveredCpa)}</dd></div><div><dt>ROAS</dt><dd>{metric.roas===null?'—':`${metric.roas.toLocaleString('vi-VN',{maximumFractionDigits:2})}x`}</dd></div></dl></section>;
}

export function OrderQuality({cohort}:{cohort:ReturnType<typeof cohortMetrics>}){
 const statuses=[{label:'Thành công',value:cohort.done,color:'#159b73'},{label:'Đang xử lý',value:cohort.pending,color:'#4d7ed0'},{label:'Hoàn',value:cohort.returned,color:'#df718b'}];
 const total=cohort.orders.length,circumference=2*Math.PI*64,segments=statuses.filter(item=>item.value>0).length;
 return <section className="panel compact-analysis-section order-quality"><div className="analysis-section-title"><div><h2>Chất lượng đơn</h2></div><Target size={17}/></div><div className="quality-donut-content">
  <svg className="quality-donut" viewBox="0 0 180 180" role="img" aria-label={total?`Tổng ${total} đơn. ${statuses.map(item=>`${item.label}: ${item.value} đơn`).join(', ')}`:'Chưa có đơn trong kỳ'}>
   <circle cx="90" cy="90" r="64" fill="none" stroke="#f1f4f8" strokeWidth="17"/>
   {statuses.map((item,index)=>{if(!item.value||!total)return null;const length=item.value/total*circumference,preceding=statuses.slice(0,index).reduce((sum,status)=>sum+status.value,0);return <circle key={item.label} cx="90" cy="90" r="64" fill="none" stroke={item.color} strokeWidth="17" strokeDasharray={`${length-(segments>1?Math.min(4,length*.15):0)} ${circumference}`} strokeDashoffset={-preceding/total*circumference} transform="rotate(-90 90 90)"><title>{item.label}: {item.value} đơn</title></circle>;})}
   <text x="90" y="89" textAnchor="middle" className="donut-value">{total}</text><text x="90" y="108" textAnchor="middle" className="donut-label">Tổng đơn</text>
  </svg><dl className="quality-donut-legend">{statuses.map(item=><div key={item.label}><dt><i style={{background:item.color}}/>{item.label}</dt><dd>{item.value}<small>đơn</small></dd></div>)}<div className="quality-donut-return"><dt>Tỷ lệ hoàn</dt><dd>{percent(cohort.returnRate)}</dd></div></dl>
 </div></section>;
}

export function FinanceBreakdown({metric,onExpense}:{metric:Metric;onExpense?:()=>void}){
 const categories=costCategories(metric),positiveCosts=categories.reduce((sum,item)=>sum+Math.max(0,item.amount),0);
 return <section className="panel finance-breakdown"><div className="panel-title"><div><h2>Cơ cấu chi phí</h2><p>Các khoản đã ghi nhận</p></div><Wallet size={19}/></div><div className="finance-content"><div className="cost-stack">{categories.filter(item=>item.amount>0).map(item=><span key={item.label} title={`${item.label}: ${money(item.amount)}`} style={{width:`${positiveCosts?item.amount/positiveCosts*100:0}%`,background:item.color}}/>)}</div><dl className="cost-list">{categories.map(item=><div key={item.label}><dt><i className="dot" style={{background:item.color}}/>{item.label}</dt><dd>{money(item.amount)}</dd></div>)}</dl><div className="finance-total"><span>Tổng chi phí</span><strong>− {money(metric.costs)}</strong></div>{onExpense&&<button className="text-button" onClick={onExpense}>Xem sổ chi phí<ArrowRight size={14}/></button>}</div></section>;
}

export function BusinessAnalysis({daily,metric,allTime=false,onExpense,children}:{daily:(DailyMetric|CohortDailyMetric)[];metric:Metric;allTime?:boolean;onExpense:()=>void;children?:ReactNode}){
 const categories=costCategories(metric),positiveCosts=categories.reduce((sum,item)=>sum+Math.max(0,item.amount),0);
 return <section className="panel business-analysis"><div className="analysis-section-title"><div><h2>Phân tích</h2></div><small>Doanh thu · Chi phí · Lợi nhuận</small></div><div className="business-analysis-core"><div className="analysis-chart-pane"><div className="analysis-pane-heading"><h3>Xu hướng theo ngày chốt</h3><div><span><i style={{background:'#147d52'}}/>Doanh thu</span><span><i style={{background:'#d15b64'}}/>Chi phí</span><span><i style={{background:'#5576bd'}}/>Lợi nhuận</span></div></div><RevenueChart daily={daily} mode="all"/>{allTime&&metric.inbound>0&&<small className="analysis-note">Biểu đồ không phân bổ khoản chưa có ngày.</small>}</div><aside className="analysis-cost-pane"><div className="analysis-pane-heading"><h3>Cơ cấu chi phí</h3><strong>{money(metric.costs)}</strong></div><div className="cost-stack">{categories.filter(item=>item.amount>0).map(item=><span key={item.label} title={`${item.label}: ${money(item.amount)}`} style={{width:`${positiveCosts?item.amount/positiveCosts*100:0}%`,background:item.color}}/>)}</div><dl>{categories.map(item=><div key={item.label}><dt><i style={{background:item.color}}/>{item.label}</dt><dd>{money(item.amount)}</dd></div>)}</dl><button className="text-button" onClick={onExpense}>Xem sổ chi phí<ArrowRight size={13}/></button></aside></div>{children}</section>;
}
