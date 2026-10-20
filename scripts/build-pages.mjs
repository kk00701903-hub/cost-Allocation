/**
 * Cloudflare Pages / 정적 호스팅용 export.
 * API 라우트는 static export와 함께 쓸 수 없어 빌드 동안만 잠깐 치워 둔다.
 * 커스텀 도메인(cost.core4i.com)은 basePath 없이 루트로 배포한다.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const api = path.join(root, 'src', 'app', 'api');
const bak = path.join(root, 'src', 'app', '_api_bak_pages');

function rm(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

if (fs.existsSync(bak)) {
  console.error('이전 빌드 잔여 _api_bak_pages 가 있습니다. 수동으로 복구하세요.');
  process.exit(1);
}
if (!fs.existsSync(api)) {
  console.error('src/app/api 가 없습니다.');
  process.exit(1);
}

fs.cpSync(api, bak, { recursive: true });
rm(api);

try {
  execSync('npx next build', {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      STATIC_EXPORT: 'true',
      NEXT_PUBLIC_STORAGE: 'local',
      NEXT_PUBLIC_BASE_PATH: '',
    },
  });
  const out = path.join(root, 'out');
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  fs.writeFileSync(
    path.join(out, '_headers'),
    `/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/sw.js
  Cache-Control: no-cache
  Service-Worker-Allowed: /

/manifest.webmanifest
  Content-Type: application/manifest+json
  Cache-Control: no-cache
`,
  );
  // SPA-ish fallback: Next trailingSlash export already emits folders; keep 404.html from Next
  console.log('Static build OK → out/ (Cloudflare Pages / cost.core4i.com)');
} finally {
  rm(api);
  if (fs.existsSync(bak)) {
    fs.cpSync(bak, api, { recursive: true });
    rm(bak);
  }
}
