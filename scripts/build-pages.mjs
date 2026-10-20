/**
 * GitHub Pages용 정적 export.
 * API 라우트는 static export와 함께 쓸 수 없어 빌드 동안만 잠깐 치워 둔다.
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
      GITHUB_PAGES: 'true',
      NEXT_PUBLIC_STORAGE: 'local',
      NEXT_PUBLIC_BASE_PATH: '/cost-Allocation',
    },
  });
  const out = path.join(root, 'out');
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  console.log('Pages build OK → out/');
} finally {
  rm(api);
  if (fs.existsSync(bak)) {
    fs.cpSync(bak, api, { recursive: true });
    rm(bak);
  }
}
