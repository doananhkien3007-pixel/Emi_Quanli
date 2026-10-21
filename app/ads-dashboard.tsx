'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, ImageOff, LoaderCircle, Megaphone, MessageCircle, MousePointerClick, RefreshCw, ShoppingCart, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { adsTrendRows, previousAdsRange, rankAdsEntities, summarizeAds, type AdsEntitySummary, type MetaAdsInsight, type MetaAdsLevel } from '../lib/ads-insights';
import { money, shortMoney } from '../lib/model';

const levelLabels:Record<MetaAdsLevel,string>={campaign:'Campaign',adset:'Ad Set',ad:'Ad'};
const trendLabels={spend:'Chi phí',cpa:'CPA',roas:'ROAS'} as const;
const trendColors=['#147d52','#5576bd','#d18a35','#8b5fbf','#cf5e6d'];
const compact=(value:number)=>new Intl.NumberFormat('vi-VN',{notation:'compact',maximumFractionDigits:1}).format(value);
const decimal=(value:number,digits=2)=>value.toLocaleString('vi-VN',{maximumFractionDigits:digits});
const resultLabel=(type?:string)=>type==='purchase'?'Purchase':type==='lead'?'Lead':type==='message'?'Tin nhắn':'Kết quả';
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
 return 'Đang tốt lên';
}

function normalizeRows(rows:MetaAdsInsight[]):MetaAdsInsight[]{return rows.map(row=>({
 ...row,spend:Number(row.spend),impressions:Number(row.impressions),reach:Number(row.reach),clicks:Number(row.clicks),ctr:Number(row.ctr),cpc:Number(row.cpc),cpm:Number(row.cpm),messages:Number(row.messages),leads:Number(row.leads),purchases:Number(row.purchases),results:Number(row.results),costPerResult:row.costPerResult===undefined?undefined:Number(row.costPerResult),purchaseValue:Number(row.purchaseValue),roas:row.roas===undefined?undefined:Number(row.roas),
}));}

export function AdsDashboard({from,to,localStorageMode,syncing,refreshKey,onSyncHistory}:{from:string;to:string;localStorageMode:boolean;syncing:boolean;refreshKey:number;onSyncHistory:()=>Promise<void>}){
 const [level,setLevel]=useState<MetaAdsLevel>('campaign'),[rows,setRows]=useState<MetaAdsInsight[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[trendMetric,setTrendMetric]=useState<keyof typeof trendLabels>('spend');
 const previous=useMemo(()=>previousAdsRange(from,to),[from,to]);
 useEffect(()=>{
  if(localStorageMode)return;
  const controller=new AbortController();
  const timer=window.setTimeout(()=>{
   setLoading(true);setError('');
   fetch(`/api/meta-ads/insights?level=${level}&since=${previous.since}&until=${to}`,{signal:controller.signal,headers:{Accept:'application/json'}})
    .then(async response=>{const value=await response.json() as {data?:MetaAdsInsight[];error?:string};if(!response.ok)throw new Error(value.error||'Chưa tải được dữ liệu Ads.');setRows(normalizeRows(value.data||[]));})
    .catch(fetchError=>{if(fetchError instanceof DOMException&&fetchError.name==='AbortError')return;setError(fetchError instanceof Error?fetchError.message:'Chưa tải được dữ liệu Ads.');})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  },0);
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[level,localStorageMode,previous.since,to,refreshKey]);
 const currentRows=useMemo(()=>rows.filter(row=>row.date>=from&&row.date<=to),[rows,from,to]);
 const previousRows=useMemo(()=>rows.filter(row=>row.date>=previous.since&&row.date<=previous.until),[rows,previous]);
 const summary=useMemo(()=>summarizeAds(currentRows),[currentRows]),previousSummary=useMemo(()=>summarizeAds(previousRows),[previousRows]);
 const ranking=useMemo(()=>rankAdsEntities(currentRows,previousRows),[currentRows,previousRows]);
 const trendEntities=useMemo(()=>[...ranking].sort((a,b)=>b.spend-a.spend).slice(0,5),[ranking]);
 const trendData=useMemo(()=>adsTrendRows(currentRows,trendEntities.map(entity=>entity.entityId)),[currentRows,trendEntities]);
 const lastSynced=rows.reduce((latest,row)=>row.syncedAt>latest?row.syncedAt:latest,'');
 if(localStorageMode)return <section className="panel ads-empty"><Megaphone size={28}/><h2>Ads cần kết nối database</h2><p>Thiết lập Supabase và hai Secret Meta trên Vercel để bật báo cáo quảng cáo.</p></section>;
 return <div className="ads-page">
  <div className="ads-command-bar"><div className="ads-level-tabs" role="tablist" aria-label="Cấp dữ liệu quảng cáo">{(['campaign','adset','ad'] as MetaAdsLevel[]).map(option=><button key={option} role="tab" aria-selected={level===option} className={level===option?'active':''} onClick={()=>setLevel(option)}>{levelLabels[option]}</button>)}</div><div className="ads-sync-meta">{lastSynced&&<small>Cập nhật {new Date(lastSynced).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</small>}<button className="button small" disabled={syncing||loading} onClick={()=>void onSyncHistory()}>{syncing?<LoaderCircle size={15} className="spin"/>:<RefreshCw size={15}/>}Nạp lại 30 ngày</button></div></div>
  {error&&<div className="error-banner" role="alert">{error}</div>}
  <section className="ads-kpi-grid" aria-busy={loading}>
   <Kpi label="Spend" value={money(summary.spend)} note="Ngân sách đã chi" icon={Megaphone} current={summary.spend} previous={previousSummary.spend} reverse/>
   <Kpi label={resultLabel(summary.resultType)} value={decimal(summary.results,1)} note={`${decimal(summary.messages,1)} tin nhắn · ${decimal(summary.leads,1)} lead · ${decimal(summary.purchases,1)} purchase`} icon={MessageCircle} current={summary.results} previous={previousSummary.results}/>
   <Kpi label="Cost per Result" value={summary.costPerResult===null?'—':money(summary.costPerResult)} note={`Theo ${resultLabel(summary.resultType).toLocaleLowerCase('vi')}`} icon={ShoppingCart} current={summary.costPerResult||0} previous={previousSummary.costPerResult||0} reverse/>
   <Kpi label="ROAS" value={summary.roas===null?'—':`${decimal(summary.roas)}x`} note={`Giá trị mua ${money(summary.purchaseValue)}`} icon={TrendingUp} current={summary.roas||0} previous={previousSummary.roas||0}/>
   <Kpi label="Impressions / Reach" value={`${compact(summary.impressions)} / ${compact(summary.reach)}`} note={`CPM ${money(summary.cpm)}`} icon={Eye} current={summary.impressions} previous={previousSummary.impressions}/>
   <Kpi label="Clicks / CTR" value={`${compact(summary.clicks)} / ${decimal(summary.ctr)}%`} note={`CPC ${money(summary.cpc)}`} icon={MousePointerClick} current={summary.clicks} previous={previousSummary.clicks}/>
  </section>
  <section className="panel ads-trend-panel"><div className="ads-section-heading"><div><h2>Xu hướng theo ngày</h2><p>Top {levelLabels[level]} theo chi tiêu trong kỳ</p></div><div className="ads-metric-tabs" role="group" aria-label="Chỉ số biểu đồ">{(Object.keys(trendLabels) as Array<keyof typeof trendLabels>).map(metric=><button key={metric} aria-pressed={trendMetric===metric} className={trendMetric===metric?'active':''} onClick={()=>setTrendMetric(metric)}>{trendLabels[metric]}</button>)}</div></div>
   <div className="ads-chart">{trendData.length&&trendEntities.length?<ResponsiveContainer width="100%" height={300}><LineChart data={trendData} margin={{top:12,right:18,left:12,bottom:4}}><CartesianGrid stroke="#e8ecef" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="date" tickFormatter={value=>String(value).slice(8)+'/'+String(value).slice(5,7)} tick={{fontSize:10,fill:'#78859a'}} axisLine={false} tickLine={false}/><YAxis tickFormatter={value=>trendMetric==='roas'?`${decimal(Number(value),1)}x`:shortMoney(Number(value))} tick={{fontSize:10,fill:'#78859a'}} axisLine={false} tickLine={false} width={58}/><Tooltip labelFormatter={value=>String(value).split('-').reverse().join('/')} formatter={(value,name)=>[trendMetric==='roas'?`${decimal(Number(value))}x`:money(Number(value)),trendEntities.find(entity=>`${entity.entityId}:${trendMetric}`===name)?.entityName||String(name)]}/><Legend formatter={value=>trendEntities.find(entity=>`${entity.entityId}:${trendMetric}`===value)?.entityName||String(value)}/>{trendEntities.map((entity,index)=><Line key={entity.entityId} type="monotone" dataKey={`${entity.entityId}:${trendMetric}`} stroke={trendColors[index]} strokeWidth={2.4} dot={{r:2.5}} activeDot={{r:5}} connectNulls/>)}</LineChart></ResponsiveContainer>:<div className="ads-chart-empty"><TrendingUp size={25}/><span>Chưa có dữ liệu xu hướng trong kỳ.</span></div>}</div>
  </section>
  <section className="panel ads-ranking-panel"><div className="ads-section-heading"><div><h2>Xếp hạng hiệu quả</h2><p>Cảnh báo theo kỳ trước cùng độ dài · ưu tiên mục cần xử lý</p></div><span className="count-pill">{ranking.length} {levelLabels[level]}</span></div><div className="table-scroll"><table className="ads-ranking-table"><thead><tr><th># / CREATIVE</th><th>{levelLabels[level].toUpperCase()}</th><th>TRẠNG THÁI</th><th className="number">SPEND</th><th className="number">IMPRESSIONS</th><th className="number">REACH</th><th className="number">CPM</th><th className="number">CLICKS</th><th className="number">CTR</th><th className="number">CPC</th><th className="number">KẾT QUẢ</th><th className="number">COST / RESULT</th><th className="number">ROAS</th><th>ĐÁNH GIÁ</th></tr></thead><tbody>{ranking.map((entity,index)=><tr key={entity.entityId} className={entity.flags.some(flag=>flag!=='improving')?'ads-risk-row':''}><td><div className="ads-rank-creative"><b>{index+1}</b><span>{entity.creativeThumbnailUrl?<img src={entity.creativeThumbnailUrl} alt="" width={52} height={52} loading="lazy" referrerPolicy="no-referrer"/>:<ImageOff size={18}/>}</span></div></td><td><strong className="ads-entity-name">{entity.entityName}</strong>{level!=='campaign'&&<small>{entity.campaignName}</small>}</td><td><span className={`ads-status ${entity.status==='ACTIVE'?'active':''}`}><i/>{entity.status==='ACTIVE'?'Đang chạy':entity.status.replaceAll('_',' ')}</span></td><td className="number"><strong>{money(entity.spend)}</strong>{entity.previous&&<TrendBadge current={entity.spend} previous={entity.previous.spend} reverse/>}</td><td className="number">{compact(entity.impressions)}</td><td className="number">{compact(entity.reach)}</td><td className="number">{money(entity.cpm)}</td><td className="number">{compact(entity.clicks)}</td><td className="number">{decimal(entity.ctr)}%</td><td className="number">{money(entity.cpc)}</td><td className="number"><strong>{decimal(entity.results,1)}</strong><small>{resultLabel(entity.resultType)}</small></td><td className="number"><strong>{entity.costPerResult===null?'—':money(entity.costPerResult)}</strong>{entity.previous&&entity.costPerResult!==null&&entity.previous.costPerResult!==null&&<TrendBadge current={entity.costPerResult} previous={entity.previous.costPerResult} reverse/>}</td><td className="number"><strong className={entity.roas!==null&&entity.roas<1.5?'ads-roas-low':''}>{entity.roas===null?'—':`${decimal(entity.roas)}x`}</strong></td><td><div className="ads-flags">{entity.flags.length?entity.flags.map(flag=><span key={flag} className={flag==='improving'?'good':'warning'}>{flag==='improving'?<TrendingUp size={12}/>:<AlertTriangle size={12}/>} {flagLabel(flag)}</span>):<span className="neutral"><Users size={12}/>Ổn định</span>}</div></td></tr>)}</tbody></table>{!ranking.length&&!loading&&<div className="ads-table-empty"><Megaphone size={25}/><strong>Chưa có dữ liệu {levelLabels[level]}</strong><p>Nhấn “Nạp lại 30 ngày” để lấy lịch sử các campaign đang hoạt động.</p></div>}</div>{loading&&<div className="ads-loading"><LoaderCircle size={18} className="spin"/>Đang tải hiệu quả quảng cáo…</div>}</section>
 </div>;
}
