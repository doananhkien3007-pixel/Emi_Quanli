import { syncMetaAds, type SyncMode } from '@/lib/meta-ads';

export const dynamic = 'force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ ok: false, error: 'Forbidden' },403);
  }

  const payload = await request.json().catch(() => ({ mode: 'today' })) as { mode?: string };
  if (payload.mode !== undefined && !['today','last3','history30'].includes(payload.mode)) {
    return json({ ok: false, error: 'Chế độ đồng bộ không hợp lệ.' },400);
  }
  const mode=(payload.mode||'today') as SyncMode;

  try {
    const result = await syncMetaAds(mode);
    console.info(JSON.stringify({event:'meta_ads_browser_sync_completed',...result}));
    return json({ ok: true, ...result });
  } catch (error) {
    const metadata=typeof error==='object'&&error!==null?error as Record<string,unknown>:{},detail=error instanceof Error?error.message:String(error);
    console.error(JSON.stringify({event:'meta_ads_browser_sync_failed',mode,error:detail,status:metadata.status,metaCode:metadata.metaCode,metaSubcode:metadata.metaSubcode,traceId:metadata.traceId}));
    return json({ ok: false, error: 'Không thể đồng bộ dữ liệu Meta Ads lúc này.' },502);
  }
}
