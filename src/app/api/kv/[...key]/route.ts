import { NextResponse } from 'next/server';
import { deleteKey, readKey, writeKey } from '../_store';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ key: string[] }> };
const keyOf = async (p: P) => (await p.params).key.map(decodeURIComponent).join('/');

export async function GET(_: Request, p: P) {
  const v = await readKey(await keyOf(p));
  if (v === null) return new NextResponse('null', { headers: { 'content-type': 'application/json; charset=utf-8', 'x-missing': '1' } });
  return new NextResponse(v, { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
export async function PUT(req: Request, p: P) {
  const body = await req.text();
  try { JSON.parse(body); } catch { return NextResponse.json({ error: 'JSON 아님' }, { status: 400 }); }
  await writeKey(await keyOf(p), body);
  return NextResponse.json({ ok: true });
}
export async function DELETE(_: Request, p: P) {
  await deleteKey(await keyOf(p));
  return NextResponse.json({ ok: true });
}
