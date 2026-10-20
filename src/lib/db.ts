/**
 * 서버 저장소(로컬 호스팅 PC의 storage 폴더, JSON 파일) 키-값 접근.
 * 키 규칙: 월별 표 = "표이름@YYYYMM", 월과 무관한 표 = "표이름"
 * 브라우저가 아닌 환경(테스트)에서는 메모리를 쓴다.
 */
const mem = new Map<string, unknown>();
const isBrowser = typeof window !== 'undefined';
const url = (key: string) => `/api/kv/${encodeURIComponent(key)}`;

export async function dbGet<T>(key: string): Promise<T | undefined> {
  if (!isBrowser) return mem.get(key) as T | undefined;
  const r = await fetch(url(key), { cache: 'no-store' });
  if (!r.ok) throw new Error(`저장소 읽기 실패: ${key} (${r.status})`);
  const v = (await r.json()) as T | null;
  return v === null ? undefined : v;
}
export async function dbSet(key: string, val: unknown): Promise<void> {
  if (!isBrowser) { mem.set(key, val); return; }
  const r = await fetch(url(key), { method: 'PUT', body: JSON.stringify(val), headers: { 'content-type': 'application/json' } });
  if (!r.ok) throw new Error(`저장소 쓰기 실패: ${key} (${r.status})`);
}
export async function dbDel(key: string): Promise<void> {
  if (!isBrowser) { mem.delete(key); return; }
  await fetch(url(key), { method: 'DELETE' });
}
export async function dbInfo(): Promise<{ root: string; keys: string[] }> {
  if (!isBrowser) return { root: '(memory)', keys: [...mem.keys()] };
  return (await fetch('/api/kv', { cache: 'no-store' })).json();
}
