export type MetaAdsLevel='campaign'|'adset'|'ad';

export type MetaAdsInsight={
 date:string;
 level:MetaAdsLevel;
 entityId:string;
 entityName:string;
 campaignId:string;
 campaignName:string;
 adsetId?:string;
 adsetName?:string;
 adId?:string;
 adName?:string;
 status:string;
 spend:number;
 impressions:number;
 reach:number;
 clicks:number;
 ctr:number;
 cpc:number;
 cpm:number;
 messages:number;
 leads:number;
 purchases:number;
 results:number;
 resultType?:string;
 costPerResult?:number;
 purchaseValue:number;
 roas?:number;
 creativeId?:string;
 creativeThumbnailUrl?:string;
 currency:string;
 syncedAt:string;
};

export type AdsSummary={
 spend:number;
 impressions:number;
 reach:number;
 clicks:number;
 ctr:number;
 cpc:number;
 cpm:number;
 messages:number;
 leads:number;
 purchases:number;
 results:number;
 resultType?:string;
 costPerResult:number|null;
 purchaseValue:number;
 roas:number|null;
};

export type AdsEntitySummary=AdsSummary&{
 entityId:string;
 entityName:string;
 campaignId:string;
 campaignName:string;
 status:string;
 creativeThumbnailUrl?:string;
 previous?:AdsSummary;
 flags:Array<'spend-up-results-down'|'cpa-up'|'low-roas'|'burning'|'improving'>;
};

const primaryResult=(messages:number,leads:number,purchases:number)=>purchases>0?{results:purchases,resultType:'purchase'}:leads>0?{results:leads,resultType:'lead'}:messages>0?{results:messages,resultType:'message'}:{results:0,resultType:undefined};

export function summarizeAds(rows:MetaAdsInsight[]):AdsSummary{
 const spend=rows.reduce((sum,row)=>sum+row.spend,0);
 const impressions=rows.reduce((sum,row)=>sum+row.impressions,0);
 const reach=rows.reduce((sum,row)=>sum+row.reach,0);
 const clicks=rows.reduce((sum,row)=>sum+row.clicks,0);
 const messages=rows.reduce((sum,row)=>sum+row.messages,0);
 const leads=rows.reduce((sum,row)=>sum+row.leads,0);
 const purchases=rows.reduce((sum,row)=>sum+row.purchases,0);
 const purchaseValue=rows.reduce((sum,row)=>sum+row.purchaseValue,0);
 const {results,resultType}=primaryResult(messages,leads,purchases);
 return {
  spend,impressions,reach,clicks,messages,leads,purchases,results,resultType,purchaseValue,
  ctr:impressions?clicks/impressions*100:0,
  cpc:clicks?spend/clicks:0,
  cpm:impressions?spend/impressions*1000:0,
  costPerResult:results?spend/results:null,
  roas:spend&&purchaseValue?purchaseValue/spend:null,
 };
}

export function dateRangeDays(since:string,until:string){
 const start=new Date(`${since}T12:00:00Z`),end=new Date(`${until}T12:00:00Z`);
 return Math.max(1,Math.round((end.getTime()-start.getTime())/86400000)+1);
}

export function offsetAdsDate(date:string,days:number){
 const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);
}

export function previousAdsRange(since:string,until:string){
 const days=dateRangeDays(since,until);
 return {since:offsetAdsDate(since,-days),until:offsetAdsDate(since,-1)};
}

function detectFlags(current:AdsSummary,previous?:AdsSummary):AdsEntitySummary['flags']{
 const flags:AdsEntitySummary['flags']=[];
 if(current.spend>0&&current.results===0)flags.push('burning');
 if(current.spend>0&&current.roas!==null&&current.roas<1.5)flags.push('low-roas');
 if(previous){
  if(current.spend>previous.spend*1.2&&current.results<previous.results*.8)flags.push('spend-up-results-down');
  if(current.costPerResult!==null&&previous.costPerResult!==null&&current.costPerResult>previous.costPerResult*1.3)flags.push('cpa-up');
  if(current.results>previous.results&&((current.costPerResult!==null&&previous.costPerResult!==null&&current.costPerResult<previous.costPerResult)||(current.roas!==null&&current.roas>(previous.roas||0))))flags.push('improving');
 }
 return flags;
}

export function rankAdsEntities(currentRows:MetaAdsInsight[],previousRows:MetaAdsInsight[]):AdsEntitySummary[]{
 const groups=new Map<string,MetaAdsInsight[]>(),previousGroups=new Map<string,MetaAdsInsight[]>();
 for(const row of currentRows)groups.set(row.entityId,[...(groups.get(row.entityId)||[]),row]);
 for(const row of previousRows)previousGroups.set(row.entityId,[...(previousGroups.get(row.entityId)||[]),row]);
 return [...groups.entries()].map(([entityId,rows])=>{
  const representative=rows.find(row=>row.creativeThumbnailUrl)||rows[0];
  const summary=summarizeAds(rows),previous=previousGroups.has(entityId)?summarizeAds(previousGroups.get(entityId)!):undefined;
  return {...summary,entityId,entityName:representative.entityName,campaignId:representative.campaignId,campaignName:representative.campaignName,status:representative.status,creativeThumbnailUrl:representative.creativeThumbnailUrl,previous,flags:detectFlags(summary,previous)};
 }).sort((a,b)=>{
  const aRisk=a.flags.some(flag=>flag!=='improving')?1:0,bRisk=b.flags.some(flag=>flag!=='improving')?1:0;
  if(aRisk!==bRisk)return bRisk-aRisk;
  if((a.roas||0)!==(b.roas||0))return (b.roas||0)-(a.roas||0);
  if(a.results!==b.results)return b.results-a.results;
  return b.spend-a.spend;
 });
}

export function adsTrendRows(rows:MetaAdsInsight[],entityIds:string[]){
 const dates=[...new Set(rows.map(row=>row.date))].sort();
 return dates.map(date=>{
  const point:Record<string,string|number>={date};
  for(const id of entityIds){
   const summary=summarizeAds(rows.filter(row=>row.date===date&&row.entityId===id));
   point[`${id}:spend`]=summary.spend;
   point[`${id}:cpa`]=summary.costPerResult??0;
   point[`${id}:roas`]=summary.roas??0;
  }
  return point;
 });
}
