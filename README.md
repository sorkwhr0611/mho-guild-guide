# 직장인수렵단 공략집

몬스터헌터 아웃랜더스 길드 공략 사이트 (Netlify).

- `public/index.html` — 공략집 페이지
- `netlify/functions/join.mjs` — 가입 신청 저장·조회 API (`/api/join`, Netlify Blobs)
- 길마 관리 비밀번호: 함수 안 `ADMIN_HASH`(SHA-256). Netlify 환경 변수 `GUILD_ADMIN_KEY`를 넣으면 그게 우선
