'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LoaderCircle, Megaphone, MessageCircle, MousePointerClick, RefreshCw, ShoppingCart, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { previousAdsRange, rankAdsEntities, summarizeAds, type AdsEntitySummary, type MetaAdsInsight } from '../lib/ads-insights';
import { money } from '../lib/model';

const compact=(value:number)=>new Intl.NumberFormat('vi-VN',{notation:'compact',maximumFractionDigits:1}).format(value);
const decimal=(value:number,digits=2)=>value.toLocaleString('vi-VN',{maximumFractionDigits:digits});
const delta=(current:number,previous:number)=>previous===0?current===0?null:100:(current-previous)/Math.abs(previous)*100;

function TrendBadge({current,previous,reverse=false}:{current:number;previous:number;reverse?:boolean}){
 const change=delta(current,previous);if(change===null)return <span className="ads-delta neutral">Không đổi</span>;
 const good=reverse?change<=0:change>=0;
 return <span className={`ads-delta ${good?'good':'bad'}`}>{change>0?'+':''}{decimal(change,1)}% {change>0?<TrendingUp size={12}/>:<TrendingDown size={12}/>}</span>;
}

function Kpi({label,value,note,icon:Icon,current,previous,reverse=false}:{label:string;value:string;note:string;icon:typeof Megaphone;current:number;previous:number;reverse?:boolean}){
 return <article className="ads-kpi"><div className="ads-kpi-heading"><span>{label}</span><Icon size={18}/></div><strong>{value}</strong><div className="ads-kpi-footer"><small>{note}</small><TrendBadge current={current} previous={previous} reverse={reverse}/></div></article>;
}

function flagLabel(flag:AdsEntitySummary['flags'][number]){
 if(flag==='spend-up-results-down')return 'Chi tăng · KQ giảm';
 if(flag==='cpa-up')return 'CPA tăng mạnh';
 if(flag==='low-roas')return 'ROAS thấp';
 if(flag==='burning')return 'Đốt ngân sách';
 if(flag==='no-purchase')return 'Có chi · chưa có đơn';
 return 'Đang tốt lên';
}

function normalizeRows(rows:MetaAdsInsight[]):MetaAdsInsight[]{return rows.map(row=>({
 ...row,spend:Number(row.spend),impressions:Number(row.impressions),reach:Number(row.reach),clicks:Number(row.clicks),ctr:Number(row.ctr),cpc:Number(row.cpc),cpm:Number(row.cpm),messages:Number(row.messages),leads:Number(row.leads),purchases:Number(row.purchases),results:Number(row.results),costPerResult:row.costPerResult===undefined?undefined:Number(row.costPerResult),purchaseValue:Number(row.purchaseValue),roas:row.roas===undefined?undefined:Number(row.roas),
}));}

export function AdsDashboard({from,to,localStorageMode,syncing,refreshKey,onSyncHistory}:{from:string;to:string;localStorageMode:boolean;syncing:boolean;refreshKey:number;onSyncHistory:()=>Promise<void>}){
 const [rows,setRows]=useState<MetaAdsInsight[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const previous=useMemo(()=>previousAdsRange(from,to),[from,to]);
 useEffect(()=>{
  if(localStorageMode)return;
  const controller=new AbortController();
  const timer=window.setTimeout(()=>{
   setLoading(true);setError('');
   fetch(`/api/meta-ads/insights?level=campaign&since=${previous.since}&until=${to}`,{signal:controller.signal,headers:{Accept:'application/json'}})
    .then(async response=>{const value=await response.json() as {data?:MetaAdsInsight[];error?:string};if(!response.ok)throw new Error(value.error||'Chưa tải được dữ liệu Ads.');setRows(normalizeRows(value.data||[]));})
    .catch(fetchError=>{if(fetchError instanceof DOMException&&fetchError.name==='AbortError')return;setError(fetchError instanceof Error?fetchError.message:'Chưa tải được dữ liệu Ads.');})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  },0);
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[localStorageMode,previous.since,to,refreshKey]);
 const currentRows=useMemo(()=>rows.filter(row=>row.date>=from&&row.date<=to),[rows,from,to]);
 const previousRows=useMemo(()=>rows.filter(row=>row.date>=previous.since&&row.date<=previous.until),[rows,previous]);
 const summary=useMemo(()=>summarizeAds(currentRows),[currentRows]),previousSummary=useMemo(()=>summarizeAds(previousRows),[previousRows]);
 const ranking=useMemo(()=>rankAdsEntities(currentRows,previousRows),[currentRows,previousRows]);
 const lastSynced=rows.reduce((latest,row)=>row.syncedAt>latest?row.syncedAt:latest,'');
 const messageCost=summary.messages?summary.spend/summary.messages:null;
 const closeRate=summary.messages?summary.purchases/summary.messages*100:null;
 const previousCloseRate=previousSummary.messages?previousSummary.purchases/previousSummary.messages*100:null;
 const purchaseCpa=summary.purchases?summary.spend/summary.purchases:null;
 const previousPurchaseCpa=previousSummary.purchases?previousSummary.spend/previousSummary.purchases:null;
 if(localStorageMode)return <section className="panel ads-empty"><Megaphone size={28}/><h2>Ads cần kết nối database</h2><p>Thiết lập Supabase và hai Secret Meta trên Vercel để bật báo cáo quảng cáo.</p></section>;
 return <div className="ads-page">
  <div className="ads-command-bar"><div className="ads-command-title"><strong>Hiệu quả chiến dịch</strong><small>Chỉ hiển thị campaign đang hoạt động</small></div><div className="ads-sync-meta">{lastSynced&&<small>Cập nhật {new Date(lastSynced).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</small>}<button className="button small" disabled={syncing||loading} onClick={()=>void onSyncHistory()}>{syncing?<LoaderCircle size={15} className="spin"/>:<RefreshCw size={15}/>}Nạp lại 30 ngày</button></div></div>
  {error&&<div className="error-banner" role="alert">{error}</div>}
  <section className="ads-kpi-grid" aria-busy={loading}>
   <Kpi label="Chi tiêu" value={money(summary.spend)} note="Ngân sách đã chi" icon={Megaphone} current={summary.spend} previous={previousSummary.spend} reverse/>
   <Kpi label="Tin nhắn" value={decimal(summary.messages,1)} note={`Giá Mess ${messageCost===null?'—':money(messageCost)} · ${decimal(summary.leads,1)} khách tiềm năng`} icon={MessageCircle} current={summary.messages} previous={previousSummary.messages}/>
   <Kpi label="Tỷ lệ chốt" value={closeRate===null?'—':`${decimal(closeRate)}%`} note={`${decimal(summary.purchases,1)} đơn mua / ${decimal(summary.messages,1)} tin nhắn`} icon={Users} current={closeRate||0} previous={previousCloseRate||0}/>
   <Kpi label="CPA" value={purchaseCpa===null?'—':money(purchaseCpa)} note="Chi phí quảng cáo mỗi đơn mua" icon={ShoppingCart} current={purchaseCpa||0} previous={previousPurchaseCpa||0} reverse/>
   <Kpi label="ROAS" value={summary.roas===null?'—':`${decimal(summary.roas)}x`} note={`Doanh thu Meta ${money(summary.purchaseValue)}`} icon={TrendingUp} current={summary.roas||0} previous={previousSummary.roas||0}/>
   <Kpi label="CTR / CPC" value={`${decimal(summary.ctr)}% / ${money(summary.cpc)}`} note={`${compact(summary.clicks)} lượt nhấp · giá mỗi lượt nhấp`} icon={MousePointerClick} current={summary.ctr} previous={previousSummary.ctr}/>
  </section>
  <section className="panel ads-ranking-panel">
   <div className="ads-section-heading"><div><h2>Hiệu quả theo chiến dịch</h2><p>So sánh với kỳ trước · ưu tiên chiến dịch tốn chi phí nhưng không tạo đơn mua</p></div><span className="count-pill">{ranking.length} chiến dịch</span></div>
   <div className="table-scroll">
    <table className="ads-ranking-table">
     <thead><tr><th>TÊN CHIẾN DỊCH</th><th>TRẠNG THÁI</th><th className="number">CHI TIÊU</th><th className="number">TIN NHẮN</th><th className="number">LƯỢT MUA</th><th className="number">TỶ LỆ CHỐT</th><th className="number">GIÁ MESS</th><th className="number">CPA</th><th className="number">DOANH THU</th><th className="number">AOV</th><th className="number">ROAS</th><th className="number">CTR</th><th className="number">CPC</th><th>ĐÁNH GIÁ</th></tr></thead>
     <tbody>{ranking.map(entity=>{
      const entityMessageCost=entity.messages?entity.spend/entity.messages:null;
      const entityCloseRate=entity.messages?entity.purchases/entity.messages*100:null;
      const entityPurchaseCpa=entity.purchases?entity.spend/entity.purchases:null;
      const entityAov=entity.purchases?entity.purchaseValue/entity.purchases:null;
      const previousPurchaseCpa=entity.previous?.purchases?entity.previous.spend/entity.previous.purchases:null;
      return <tr key={entity.entityId} className={entity.flags.some(flag=>flag!=='improving')?'ads-risk-row':''}>
       <td><div className="ads-campaign-name"><i className={entity.status==='ACTIVE'?'active':''}/><strong className="ads-entity-name">{entity.entityName}</strong></div></td>
       <td><span className={`ads-status ${entity.status==='ACTIVE'?'active':''}`}><i/>{entity.status==='ACTIVE'?'Đang chạy':entity.status.replaceAll('_',' ')}</span></td>
       <td className="number"><strong>{money(entity.spend)}</strong>{entity.previous&&<TrendBadge current={entity.spend} previous={entity.previous.spend} reverse/>}</td>
       <td className="number"><strong>{decimal(entity.messages,1)}</strong></td>
       <td className="number"><strong>{decimal(entity.purchases,1)}</strong></td>
       <td className="number"><strong>{entityCloseRate===null?'—':`${decimal(entityCloseRate)}%`}</strong></td>
       <td className="number"><strong>{entityMessageCost===null?'—':money(entityMessageCost)}</strong></td>
       <td className="number"><strong>{entityPurchaseCpa===null?'—':money(entityPurchaseCpa)}</strong>{entityPurchaseCpa!==null&&previousPurchaseCpa!==null&&<TrendBadge current={entityPurchaseCpa} previous={previousPurchaseCpa} reverse/>}</td>
       <td className="number"><strong>{money(entity.purchaseValue)}</strong></td>
       <td className="number"><strong>{entityAov===null?'—':money(entityAov)}</strong></td>
       <td className="number"><strong className={entity.roas!==null&&entity.roas<1.5?'ads-roas-low':''}>{entity.roas===null?'—':`${decimal(entity.roas)}x`}</strong></td>
       <td className="number">{decimal(entity.ctr)}%</td>
       <td className="number">{money(entity.cpc)}</td>
       <td><div className="ads-flags">{entity.flags.length?entity.flags.map(flag=><span key={flag} className={flag==='improving'?'good':'warning'}>{flag==='improving'?<TrendingUp size={12}/>:<AlertTriangle size={12}/>} {flagLabel(flag)}</span>):<span className="neutral"><Users size={12}/>Ổn định</span>}</div></td>
      </tr>;
     })}</tbody>
    </table>
    {!ranking.length&&!loading&&<div className="ads-table-empty"><Megaphone size={25}/><strong>Chưa có dữ liệu chiến dịch</strong><p>Nhấn “Nạp lại 30 ngày” để lấy lịch sử các campaign đang hoạt động.</p></div>}
   </div>
   {loading&&<div className="ads-loading"><LoaderCircle size={18} className="spin"/>Đang tải hiệu quả quảng cáo…</div>}
  </section>
 </div>;
}
