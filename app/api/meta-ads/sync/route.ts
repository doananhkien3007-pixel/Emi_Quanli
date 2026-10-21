import { NextResponse } from 'next/server';
import { syncMetaSpend } from '@/lib/meta-ads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const payload = await request.json().catch(() => ({ mode: 'today' })) as { mode?: string };
  if (payload.mode !== undefined && payload.mode !== 'today' && payload.mode !== 'last3') {
    return NextResponse.json({ ok: false, error: 'Chế độ đồng bộ không hợp lệ.' }, { status: 400 });
  }
  const mode = payload.mode === 'last3' ? 'last3' : 'today';

  try {
    const result = await syncMetaSpend(mode);
    console.info('[meta-ads] browser sync completed', {
      mode,
      updated: result.updated,
      syncedAt: result.syncedAt,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[meta-ads] browser sync failed', {
      mode,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: 'Không thể đồng bộ chi phí Meta Ads lúc này.' },
      { status: 502 },
    );
  }
}
