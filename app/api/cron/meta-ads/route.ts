import { cronMode, syncMetaAds } from '../../../../lib/meta-ads';

export const dynamic='force-dynamic';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return json({ok:false,error:'unauthorized'},401);
 const url=new URL(request.url);
 const mode=cronMode(request.headers.get('x-vercel-cron-schedule'),url.searchParams.get('mode'));
 if(!mode)return json({ok:false,error:'unknown_sync_schedule'},400);
 try{
  const result=await syncMetaAds(mode);
  console.info(JSON.stringify({event:'meta_ads_sync_completed',...result}));
  return json({ok:true,...result});
 }catch(error){
  const detail=error instanceof Error?error.message:'unknown_error';
  const metadata=typeof error==='object'&&error!==null?error as Record<string,unknown>:{};
  console.error(JSON.stringify({event:'meta_ads_sync_failed',mode,error:detail,status:metadata.status,metaCode:metadata.metaCode,metaSubcode:metadata.metaSubcode,traceId:metadata.traceId}));
  return json({ok:false,error:'meta_ads_sync_failed'},500);
 }
}
