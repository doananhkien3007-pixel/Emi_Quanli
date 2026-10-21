import { offsetDay, shopToday } from './analytics.ts';
import type { MetaAdsInsight, MetaAdsLevel } from './ads-insights.ts';
import { getSupabaseConfig, supabaseRpc } from './supabase-server.ts';
import type { MetaAdSpend } from './model.ts';

const BUSINESS_TIMEZONE='Asia/Ho_Chi_Minh';
const DEFAULT_META_API_VERSION='v24.0';
const INSIGHT_LEVELS:MetaAdsLevel[]=['campaign','adset','ad'];

export type SyncMode='today'|'yesterday'|'last3'|'history30';
type MetaError={message?:string;type?:string;code?:number;error_subcode?:number;fbtrace_id?:string};
type MetaPage<T>={data:T[];paging?:{next?:string}};
type MetaAction={action_type:string;value:string};
type MetaCampaign={id:string;name:string;status:string;effective_status:string;created_time?:string};
type MetaAdset={id:string;name:string;status:string;effective_status:string;campaign_id:string};
type MetaAd={id:string;name:string;status:string;effective_status:string;campaign_id:string;adset_id:string;creative?:{id?:string;thumbnail_url?:string}};
type MetaRawInsight={
 date_start:string;campaign_id:string;campaign_name:string;adset_id?:string;adset_name?:string;ad_id?:string;ad_name?:string;
 spend?:string;impressions?:string;reach?:string;clicks?:string;ctr?:string;cpc?:string;cpm?:string;
 actions?:MetaAction[];action_values?:MetaAction[];cost_per_action_type?:MetaAction[];purchase_roas?:MetaAction[];website_purchase_roas?:MetaAction[];
};
type MetaInsightSyncRow=Omit<MetaAdsInsight,'syncedAt'>;

function metaConfig(){
 const accessToken=process.env.META_ACCESS_TOKEN;
 const rawAccountId=process.env.META_AD_ACCOUNT_ID?.trim();
 if(!accessToken||!rawAccountId)throw new Error('meta_not_configured');
 const accountId=rawAccountId.startsWith('act_')?rawAccountId:`act_${rawAccountId}`;
 if(!/^act_\d+$/.test(accountId))throw new Error('meta_ad_account_id_invalid');
 const apiVersion=process.env.META_API_VERSION?.trim()||DEFAULT_META_API_VERSION;
 if(!/^v\d+\.\d+$/.test(apiVersion))throw new Error('meta_api_version_invalid');
 return {accessToken,accountId,apiVersion};
}

export function syncRange(mode:SyncMode,today=shopToday()){
 if(mode==='today')return {since:today,until:today};
 const yesterday=offsetDay(today,-1);
 if(mode==='yesterday')return {since:yesterday,until:yesterday};
 if(mode==='history30')return {since:offsetDay(today,-29),until:today};
 return {since:offsetDay(today,-3),until:yesterday};
}

function datesBetween(since:string,until:string){
 const dates:string[]=[];
 for(let date=since;date<=until;date=offsetDay(date,1))dates.push(date);
 return dates;
}

async function metaRequest<T>(url:URL):Promise<T>{
 const {accessToken}=metaConfig();
 const response=await fetch(url,{cache:'no-store',headers:{Authorization:`Bearer ${accessToken}`,'User-Agent':'Emi-Quanli/1.0'}});
 const payload=await response.json().catch(()=>({})) as T&{error?:MetaError};
 if(!response.ok||payload.error){
  const error=payload.error;
  throw Object.assign(new Error(error?.message||`meta_request_failed_${response.status}`),{
   name:'MetaApiError',status:response.status,metaCode:error?.code,metaSubcode:error?.error_subcode,metaType:error?.type,traceId:error?.fbtrace_id,
  });
 }
 return payload;
}

function metaUrl(path:string,params:Record<string,string>){
 const {apiVersion}=metaConfig();
 const url=new URL(`https://graph.facebook.com/${apiVersion}/${path}`);
 for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
 return url;
}

async function metaGet<T>(path:string,params:Record<string,string>):Promise<T>{return metaRequest<T>(metaUrl(path,params));}

async function metaGetAll<T>(path:string,params:Record<string,string>):Promise<T[]>{
 const rows:T[]=[];
 let next:URL|undefined=metaUrl(path,params);
 for(let page=0;next&&page<100;page++){
  if(next.hostname!=='graph.facebook.com')throw new Error('meta_paging_host_invalid');
  const payload:MetaPage<T>=await metaRequest<MetaPage<T>>(next);
  rows.push(...(payload.data||[]));
  next=payload.paging?.next?new URL(payload.paging.next):undefined;
 }
 if(next)throw new Error('meta_paging_limit_exceeded');
 return rows;
}

function acceptedVietnamTimezone(value:string){return ['Asia/Ho_Chi_Minh','Asia/Saigon'].includes(value);}
function finite(value:unknown,label:string){const parsed=Number(value??0);if(!Number.isFinite(parsed)||parsed<0)throw new Error(`meta_${label}_invalid`);return parsed;}
function actionValue(actions:MetaAction[]|undefined,types:string[]){
 for(const type of types){const item=actions?.find(action=>action.action_type===type);if(item)return finite(item.value,`action_${type}`);}
 return 0;
}
const messageActions=['onsite_conversion.messaging_conversation_started_7d','messaging_conversation_started_7d','onsite_conversion.total_messaging_connection'];
const leadActions=['lead','onsite_conversion.lead_grouped','offsite_conversion.fb_pixel_lead'];
const purchaseActions=['omni_purchase','purchase','offsite_conversion.fb_pixel_purchase','onsite_conversion.messaging_detected_purchase'];

function safeThumbnail(value?:string){
 if(!value)return undefined;
 try{const url=new URL(value);return url.protocol==='https:'&&value.length<=4000?value:undefined;}catch{return undefined;}
}

export function normalizeMetaInsight(raw:MetaRawInsight,context:{
 level:MetaAdsLevel;currency:string;campaign:MetaCampaign;status:string;creative?:MetaAd['creative'];
}):MetaInsightSyncRow{
 const spend=finite(raw.spend,'spend'),impressions=finite(raw.impressions,'impressions'),reach=finite(raw.reach,'reach'),clicks=finite(raw.clicks,'clicks');
 const messages=actionValue(raw.actions,messageActions),leads=actionValue(raw.actions,leadActions),purchases=actionValue(raw.actions,purchaseActions);
 const purchaseValue=actionValue(raw.action_values,purchaseActions);
 const result=purchases>0?{value:purchases,type:'purchase'}:leads>0?{value:leads,type:'lead'}:messages>0?{value:messages,type:'message'}:{value:0,type:undefined};
 const explicitRoas=actionValue(raw.purchase_roas,['omni_purchase','purchase'])||actionValue(raw.website_purchase_roas,['offsite_conversion.fb_pixel_purchase','purchase']);
 const entityId=context.level==='campaign'?raw.campaign_id:context.level==='adset'?raw.adset_id:raw.ad_id;
 const entityName=context.level==='campaign'?context.campaign.name:context.level==='adset'?raw.adset_name:raw.ad_name;
 if(!entityId||!entityName)throw new Error(`meta_${context.level}_identity_missing`);
 return {
  date:raw.date_start,level:context.level,entityId,entityName,
  campaignId:context.campaign.id,campaignName:context.campaign.name,
  adsetId:raw.adset_id,adsetName:raw.adset_name,adId:raw.ad_id,adName:raw.ad_name,status:context.status,
  spend,impressions,reach,clicks,
  ctr:impressions?clicks/impressions*100:finite(raw.ctr,'ctr'),
  cpc:clicks?spend/clicks:finite(raw.cpc,'cpc'),
  cpm:impressions?spend/impressions*1000:finite(raw.cpm,'cpm'),
  messages,leads,purchases,results:result.value,resultType:result.type,
  costPerResult:result.value?spend/result.value:undefined,purchaseValue,
  roas:explicitRoas||(spend&&purchaseValue?purchaseValue/spend:undefined),
  creativeId:context.creative?.id,creativeThumbnailUrl:safeThumbnail(context.creative?.thumbnail_url),currency:context.currency,
 };
}

export async function fetchMetaSpend(since:string,until:string):Promise<Array<Pick<MetaAdSpend,'date'|'amount'|'currency'>>>{
 const {accountId}=metaConfig();
 const [account,insights]=await Promise.all([
  metaGet<{currency:string;timezone_name:string}>(accountId,{fields:'currency,timezone_name'}),
  metaGetAll<{date_start:string;spend:string}>(`${accountId}/insights`,{
   fields:'date_start,spend',level:'account',time_increment:'1',time_range:JSON.stringify({since,until}),limit:'100',
  }),
 ]);
 if(account.currency!=='VND')throw new Error(`meta_account_currency_must_be_vnd:${account.currency||'unknown'}`);
 if(!acceptedVietnamTimezone(account.timezone_name))throw new Error(`meta_account_timezone_must_be_${BUSINESS_TIMEZONE}:${account.timezone_name||'unknown'}`);
 const requested=new Set(datesBetween(since,until));
 const byDate=new Map<string,number>();
 for(const row of insights){
  if(!requested.has(row.date_start))continue;
  byDate.set(row.date_start,Math.round(finite(row.spend,`spend_${row.date_start}`)));
 }
 return [...requested].map(date=>({date,amount:byDate.get(date)||0,currency:account.currency}));
}

export async function fetchMetaInsights(since:string,until:string):Promise<MetaInsightSyncRow[]>{
 const {accountId}=metaConfig();
 const [account,campaigns]=await Promise.all([
  metaGet<{currency:string;timezone_name:string}>(accountId,{fields:'currency,timezone_name'}),
  metaGetAll<MetaCampaign>(`${accountId}/campaigns`,{fields:'id,name,status,effective_status,created_time',limit:'500'}),
 ]);
 if(account.currency!=='VND')throw new Error(`meta_account_currency_must_be_vnd:${account.currency||'unknown'}`);
 if(!acceptedVietnamTimezone(account.timezone_name))throw new Error(`meta_account_timezone_must_be_${BUSINESS_TIMEZONE}:${account.timezone_name||'unknown'}`);
 const activeCampaigns=new Map(campaigns.filter(campaign=>campaign.effective_status==='ACTIVE').map(campaign=>[campaign.id,campaign]));
 if(!activeCampaigns.size)return [];
 const fields='date_start,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,cost_per_action_type,purchase_roas,website_purchase_roas';
 const [adsets,ads,...levelRows]=await Promise.all([
  metaGetAll<MetaAdset>(`${accountId}/adsets`,{fields:'id,name,status,effective_status,campaign_id',limit:'500'}),
  metaGetAll<MetaAd>(`${accountId}/ads`,{fields:'id,name,status,effective_status,campaign_id,adset_id,creative{id,thumbnail_url}',limit:'500'}),
  ...INSIGHT_LEVELS.map(level=>metaGetAll<MetaRawInsight>(`${accountId}/insights`,{fields,level,time_increment:'1',time_range:JSON.stringify({since,until}),limit:'5000'})),
 ]);
 const adsetsById=new Map(adsets.filter(adset=>activeCampaigns.has(adset.campaign_id)).map(adset=>[adset.id,adset]));
 const adsById=new Map(ads.filter(ad=>activeCampaigns.has(ad.campaign_id)).map(ad=>[ad.id,ad]));
 const creativeByAdset=new Map<string,MetaAd['creative']>(),creativeByCampaign=new Map<string,MetaAd['creative']>();
 for(const ad of adsById.values())if(safeThumbnail(ad.creative?.thumbnail_url)){
  if(!creativeByAdset.has(ad.adset_id))creativeByAdset.set(ad.adset_id,ad.creative);
  if(!creativeByCampaign.has(ad.campaign_id))creativeByCampaign.set(ad.campaign_id,ad.creative);
 }
 const normalized:MetaInsightSyncRow[]=[];
 INSIGHT_LEVELS.forEach((level,index)=>{
  for(const raw of levelRows[index]){
   const campaign=activeCampaigns.get(raw.campaign_id);if(!campaign)continue;
   const adset=raw.adset_id?adsetsById.get(raw.adset_id):undefined,ad=raw.ad_id?adsById.get(raw.ad_id):undefined;
   const status=level==='campaign'?campaign.effective_status:level==='adset'?(adset?.effective_status||'UNKNOWN'):(ad?.effective_status||'UNKNOWN');
   const creative=level==='campaign'?creativeByCampaign.get(campaign.id):level==='adset'&&raw.adset_id?creativeByAdset.get(raw.adset_id):ad?.creative;
   normalized.push(normalizeMetaInsight(raw,{level,currency:account.currency,campaign,status,creative}));
  }
 });
 // Meta omits a campaign/day row when there was no delivery. Keep a zero row so
 // every currently active campaign remains visible on the decision dashboard.
 const campaignKeys=new Set(normalized.filter(row=>row.level==='campaign').map(row=>`${row.date}\u001f${row.campaignId}`));
 for(const date of datesBetween(since,until))for(const campaign of activeCampaigns.values()){
  if(campaign.created_time&&campaign.created_time.slice(0,10)>date)continue;
  const key=`${date}\u001f${campaign.id}`;if(campaignKeys.has(key))continue;
  normalized.push({date,level:'campaign',entityId:campaign.id,entityName:campaign.name,campaignId:campaign.id,campaignName:campaign.name,status:campaign.effective_status,spend:0,impressions:0,reach:0,clicks:0,ctr:0,cpc:0,cpm:0,messages:0,leads:0,purchases:0,results:0,purchaseValue:0,creativeId:creativeByCampaign.get(campaign.id)?.id,creativeThumbnailUrl:safeThumbnail(creativeByCampaign.get(campaign.id)?.thumbnail_url),currency:account.currency});
 }
 return normalized;
}

export async function syncMetaAds(mode:SyncMode){
 const database=getSupabaseConfig();
 if(!database)throw new Error('supabase_not_configured');
 const range=syncRange(mode);
 const [spendRows,insightRows]=await Promise.all([fetchMetaSpend(range.since,range.until),fetchMetaInsights(range.since,range.until)]);
 const saved=await supabaseRpc<{spend_updated:number;insights_updated:number;synced_at:string}>('sync_emi_meta_ads',{
  p_slug:database.slug,p_since:range.since,p_until:range.until,p_spend_rows:spendRows,p_insight_rows:insightRows,
 });
 return {mode,...range,updated:saved.spend_updated,insightsUpdated:saved.insights_updated,syncedAt:saved.synced_at};
}

export function cronMode(schedule:string|null,requested:string|null):SyncMode|null{
 if(schedule==='10 17 * * *')return 'last3';
 return requested==='today'||requested==='yesterday'||requested==='last3'||requested==='history30'?requested:null;
}
