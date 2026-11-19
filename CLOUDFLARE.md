# Cloudflare Pages로 옮기기

## 구조
- 화면: `node build.mjs` → `public/` (Netlify·Cloudflare 공통)
- 서버 기능: `functions/api/{join,guild,board}.js` (Cloudflare Pages Functions)
  - `netlify/functions/*.mjs` 를 `node tools/port-functions.mjs` 로 자동 변환한 파일이에요. 서버 코드를 고치면 netlify 쪽을 고치고 다시 변환해요.
  - 저장소는 KV 바인딩 `MHO_KV` 하나 (`functions/_lib/store.js`)
- 이사 도우미: `functions/api/migrate.js` (길마 전용, 예전 Netlify 사이트의 `?export=1` 백업을 받아 KV에 그대로 넣어요)

## Cloudflare 설정
1. Workers & Pages → Create → Pages → Connect to Git → `sorkwhr0611/mho-guild-guide`
2. Production branch `main` · Build command `node build.mjs` · Build output `public`
3. Storage & Databases → KV → Create namespace `mho-guild`
4. Pages 프로젝트 → Settings → Bindings → Add → KV namespace: 변수 이름 `MHO_KV` → `mho-guild` (Production·Preview 둘 다)
5. Settings → Runtime → Compatibility flags: `nodejs_compat` (Production·Preview 둘 다), Compatibility date 2024-09-23 이후
6. (선택) Settings → Variables: `GUILD_ADMIN_KEY` (없으면 기존 길마 비밀번호 그대로)
7. 다시 배포(Retry deployment) → `https://<프로젝트>.pages.dev`

## 데이터 옮기기
1. 백업 기능(`?export=1`)이 들어간 버전을 Netlify에 한 번 배포
2. 새 사이트 → 길드 탭 → 길마 관리 로그인 → "예전 사이트에서 가져오기"
3. 옮긴 수 확인 후 Netlify 빌드 중지 (Netlify → Site configuration → Build & deploy → Stop builds)
