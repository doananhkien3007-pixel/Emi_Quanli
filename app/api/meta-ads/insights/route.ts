import type { MetaAdsInsight, MetaAdsLevel } from '@/lib/ads-insights';
import { getSupabaseConfig, supabaseRpc } from '@/lib/supabase-server';

export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const validDate=(value:string|null):value is string=>!!value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export async function GET(request:Request){
 const url=new URL(request.url),level=url.searchParams.get('level') as MetaAdsLevel|null,since=url.searchParams.get('since'),until=url.searchParams.get('until');
 if(!level||!['campaign','adset','ad'].includes(level)||!validDate(since)||!validDate(until)||since>until){
  return json({error:'Bộ lọc Ads không hợp lệ.'},400);
 }
 const days=Math.round((Date.parse(`${until}T12:00:00Z`)-Date.parse(`${since}T12:00:00Z`))/86400000)+1;
 if(days>92)return json({error:'Khoảng xem Ads tối đa 92 ngày.'},400);
 const config=getSupabaseConfig();
 if(!config)return json({error:'Chưa kết nối cơ sở dữ liệu Ads.'},503);
 try{
  const rows=await supabaseRpc<MetaAdsInsight[]>('get_emi_meta_ad_insights',{p_slug:config.slug,p_since:since,p_until:until,p_level:level});
  return json({data:rows,level,since,until});
 }catch(error){
  console.error(JSON.stringify({event:'meta_ads_insights_read_failed',level,since,until,error:error instanceof Error?error.message:'unknown_error'}));
  return json({error:'Chưa tải được lịch sử Meta Ads.'},503);
 }
}
