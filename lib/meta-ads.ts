import { offsetDay, shopToday } from './analytics.ts';
import { getSupabaseConfig, supabaseRpc } from './supabase-server.ts';
import type { MetaAdSpend } from './model.ts';

const BUSINESS_TIMEZONE='Asia/Ho_Chi_Minh';
const DEFAULT_META_API_VERSION='v24.0';

type SyncMode='today'|'yesterday'|'last3';
type MetaError={message?:string;type?:string;code?:number;error_subcode?:number;fbtrace_id?:string};

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
 return {since:offsetDay(today,-3),until:yesterday};
}

function datesBetween(since:string,until:string){
 const dates:string[]=[];
 for(let date=since;date<=until;date=offsetDay(date,1))dates.push(date);
 return dates;
}

async function metaGet<T>(path:string,params:Record<string,string>):Promise<T>{
 const {accessToken,apiVersion}=metaConfig();
 const url=new URL(`https://graph.facebook.com/${apiVersion}/${path}`);
 for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
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

function acceptedVietnamTimezone(value:string){return ['Asia/Ho_Chi_Minh','Asia/Saigon'].includes(value);}

export async function fetchMetaSpend(since:string,until:string):Promise<Array<Pick<MetaAdSpend,'date'|'amount'|'currency'>>>{
 const {accountId}=metaConfig();
 const [account,insights]=await Promise.all([
  metaGet<{currency:string;timezone_name:string}>(accountId,{fields:'currency,timezone_name'}),
  metaGet<{data:Array<{date_start:string;spend:string}>}>(`${accountId}/insights`,{
   fields:'date_start,spend',level:'account',time_increment:'1',
   time_range:JSON.stringify({since,until}),limit:'100',
  }),
 ]);
 if(account.currency!=='VND')throw new Error(`meta_account_currency_must_be_vnd:${account.currency||'unknown'}`);
 if(!acceptedVietnamTimezone(account.timezone_name))throw new Error(`meta_account_timezone_must_be_${BUSINESS_TIMEZONE}:${account.timezone_name||'unknown'}`);
 const requested=new Set(datesBetween(since,until));
 const byDate=new Map<string,number>();
 for(const row of insights.data||[]){
  if(!requested.has(row.date_start))continue;
  const value=Number(row.spend);
  if(!Number.isFinite(value)||value<0)throw new Error(`meta_spend_invalid:${row.date_start}`);
  byDate.set(row.date_start,Math.round(value));
 }
 return [...requested].map(date=>({date,amount:byDate.get(date)||0,currency:account.currency}));
}

export async function syncMetaSpend(mode:SyncMode){
 const database=getSupabaseConfig();
 if(!database)throw new Error('supabase_not_configured');
 const range=syncRange(mode);
 const rows=await fetchMetaSpend(range.since,range.until);
 const saved=await supabaseRpc<{updated:number;synced_at:string}>('upsert_emi_meta_ad_spend',{p_slug:database.slug,p_rows:rows});
 return {mode,...range,updated:saved.updated,syncedAt:saved.synced_at};
}

export function cronMode(schedule:string|null,requested:string|null):SyncMode|null{
 if(schedule==='10 17 * * *')return 'yesterday';
 return requested==='today'||requested==='yesterday'||requested==='last3'?requested:null;
}
