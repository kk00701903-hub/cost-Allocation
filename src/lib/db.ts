/**
 * 키-값 저장소.
 * - 로컬(`npm run start`): `/api/kv` → 서버 PC storage 폴더
 * - GitHub Pages 정적 배포: 브라우저 localStorage
 * - 테스트(비브라우저): 메모리 Map
 */
const mem = new Map<string, unknown>();
const isBrowser = typeof window !== 'undefined';
const LS = 'cost-alloc:';
const useLocal = () => (process.env.NEXT_PUBLIC_STORAGE || 'server') === 'local';
const basePath = () => process.env.NEXT_PUBLIC_BASE_PATH || '';
const url = (key: string) => `${basePath()}/api/kv/${encodeURIComponent(key)}`;

export async function dbGet<T>(key: string): Promise<T | undefined> {
  if (!isBrowser) return mem.get(key) as T | undefined;
  if (useLocal()) {
    try {
      const raw = localStorage.getItem(LS + key);
      if (raw == null) return undefined;
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }
  const r = await fetch(url(key), { cache: 'no-store' });
  if (!r.ok) throw new Error(`저장소 읽기 실패: ${key} (${r.status})`);
  const v = (await r.json()) as T | null;
  return v === null ? undefined : v;
}

export async function dbSet(key: string, val: unknown): Promise<void> {
  if (!isBrowser) { mem.set(key, val); return; }
  if (useLocal()) {
    localStorage.setItem(LS + key, JSON.stringify(val));
    return;
  }
  const r = await fetch(url(key), { method: 'PUT', body: JSON.stringify(val), headers: { 'content-type': 'application/json' } });
  if (!r.ok) throw new Error(`저장소 쓰기 실패: ${key} (${r.status})`);
}

export async function dbDel(key: string): Promise<void> {
  if (!isBrowser) { mem.delete(key); return; }
  if (useLocal()) {
    localStorage.removeItem(LS + key);
    return;
  }
  await fetch(url(key), { method: 'DELETE' });
}

export async function dbInfo(): Promise<{ root: string; keys: string[] }> {
  if (!isBrowser) return { root: '(memory)', keys: [...mem.keys()] };
  if (useLocal()) {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LS)) keys.push(k.slice(LS.length));
    }
    return { root: 'localStorage (GitHub Pages)', keys };
  }
  return (await fetch(`${basePath()}/api/kv`, { cache: 'no-store' })).json();
}
