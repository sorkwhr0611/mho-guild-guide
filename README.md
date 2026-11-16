# 직장인수렵단 공략집

몬스터헌터 아웃랜더스 모험단 공략 사이트. `main`에 push하면 Netlify가 자동으로 빌드·배포해요.

## 구조
| 경로 | 내용 |
|---|---|
| `src/data.json` | 공략 내용 데이터 (장비·삽화·동반자·이벤트·대기명단 기본값 등) — **대부분 수정은 여기** |
| `src/template.html` | 화면 틀 (HTML · CSS · JS) |
| `src/icons.json` / `src/shots.json` | 아이콘 · 스크린샷 이미지 (base64) |
| `build.mjs` | 위 파일을 합쳐 `public/index.html` 생성 (Netlify 빌드 명령) |
| `netlify/functions/join.mjs` | 가입 신청 · 대기명단 API (`/api/join`, Netlify Blobs) |

## 로컬에서 보기
```bash
node build.mjs          # public/index.html 생성
npx netlify dev         # 가입 신청 API까지 같이 테스트할 때
```

## 관리자
- 길마 관리 비밀번호: `join.mjs`의 `ADMIN_HASH`(SHA-256). Netlify 환경 변수 `GUILD_ADMIN_KEY`가 있으면 그게 우선.
- 신청 목록 · 대기명단은 Netlify Blobs(`guild-join`, `guild-meta`)에 저장돼요. 사이트의 "길마 관리"에서 수정해요.

## 같이 작업할 때
- 작업 전에 `git pull`로 최신을 받고, 작은 단위로 커밋해 주세요.
- 대기명단은 사이트에서 고치면 바로 반영돼요(코드 수정 불필요). `src/data.json`의 `guild.notice.groups`는 저장된 명단이 없을 때 쓰는 기본값이에요.


## 격투장 순위
- 매주 토요일 결과가 나오면 사이트 **가입 신청 → 길마 관리**(비밀번호)에서 순위·기간·한마디를 넣고 저장해요.
- Netlify Blobs `guild-meta`의 `arena` 키에 저장되고, 홈 배너에 바로 반영돼요. `src/data.json`의 `guild.arena`는 저장값이 없을 때 쓰는 기본값이에요.
