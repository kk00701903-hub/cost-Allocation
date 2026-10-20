import { promises as fs } from 'fs';
import path from 'path';

/** 저장 폴더: 환경변수 COST_ALLOC_STORAGE (예: E:\\cost-alloc-data), 없으면 프로젝트의 storage/ */
export const ROOT = process.env.COST_ALLOC_STORAGE || path.join(process.cwd(), 'storage');
const file = (key: string) => path.join(ROOT, `${encodeURIComponent(key)}.json`);

export async function readKey(key: string): Promise<string | null> {
  try { return await fs.readFile(file(key), 'utf8'); } catch { return null; }
}
export async function writeKey(key: string, body: string) {
  await fs.mkdir(ROOT, { recursive: true });
  const f = file(key);
  try { await fs.copyFile(f, `${f}.bak`); } catch { /* 처음 저장 */ }
  const tmp = `${f}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, body, 'utf8');
  await fs.rename(tmp, f);
}
export async function deleteKey(key: string) {
  try { await fs.unlink(file(key)); } catch { /* 없음 */ }
}
export async function listKeys(): Promise<string[]> {
  try { return (await fs.readdir(ROOT)).filter((f) => f.endsWith('.json')).map((f) => decodeURIComponent(f.slice(0, -5))); } catch { return []; }
}
