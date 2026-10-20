import { NextResponse } from 'next/server';
import { listKeys, ROOT } from './_store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ root: ROOT, keys: await listKeys() });
}
