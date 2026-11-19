// 공략집 점검기: node build.mjs 뒤에 `node tools/check.mjs` 로 돌려요.
// 화면 깨짐(가로 스크롤·잘린 글자·넘치는 칸·undefined/NaN·스크립트 오류), 깨진 사진,
// 없어진 글로 가는 링크, 오래된 날짜 제목, 융광종 일정 누락을 한 번에 검사해요.
// 결과: 표 형태로 출력하고, 문제가 있으면 종료 코드 1.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, extname } from "node:path";
const require = createRequire(import.meta.url);
const ROOT = new URL("..", import.meta.url).pathname;
const PUB = join(ROOT, "public");
const D = JSON.parse(readFileSync(join(ROOT, "src/data.json"), "utf8"));
const TPL = readFileSync(join(ROOT, "src/template.html"), "utf8");
const fails = [], warns = [];
const F = (m) => fails.push(m), W = (m) => warns.push(m);

/* 1) 데이터·링크 검사 (브라우저 없이) */
const ids = new Set((D.board || []).map((b) => b.id));
const img = (k) => existsSync(join(ROOT, "src/img", k + ".jpg"));
for (const b of D.board || []) {
  for (const k of b.images || []) if (!img(k)) F(`사진 없음: 공략 「${b.title}」 → ${k}.jpg`);
  if (!b.lines || !b.lines.length) F(`본문 없음: 공략 「${b.title}」`);
}
const relb = /const RELB=(\{[\s\S]*?\});/.exec(TPL);
if (relb) for (const id of relb[1].match(/'[^']+'/g) || []) { const v = id.slice(1, -1); if (/^[a-z]+$/.test(v)) continue; if (!ids.has(v)) W(`'공략에서 더 보기'에 없는 글: ${v}`); }
const chrel = /const CHREL=(\{[^}]*\})/.exec(TPL);
if (chrel) for (const m of chrel[1].matchAll(/:'([^']+)'/g)) if (!ids.has(m[1])) W(`숙제 '공략 ›' 버튼이 없는 글을 가리켜요: ${m[1]}`);
const kst = new Date(Date.now() + 9 * 36e5), mon = kst.getUTCMonth() + 1, today = kst.toISOString().slice(5, 10);
const daysAgo = (md) => { const [m, d] = md.split(/[-/]/).map(Number); const y = m >= 10 && mon < 10 ? kst.getUTCFullYear() - 1 : kst.getUTCFullYear(); return (Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - Date.UTC(y, m - 1, d)) / 864e5; };
const titles = [...(D.board || []).map((b) => b.title), ...((D.tipx.more || []).map((m) => m.h + " " + (m.sm || "")))];
for (const t of titles) {
  for (const m of t.matchAll(/(\d{1,2})\/(\d{1,2}) ?기준/g)) if (daysAgo(`${m[1]}-${m[2]}`) > 30) W(`오래된 날짜 제목(30일 넘음): 「${t}」`);
  for (const m of t.matchAll(/(\d{1,2})월/g)) if (+m[1] !== mon && +m[1] <= 12) W(`다른 달이 박힌 제목: 「${t}」`);
}
for (const m of TPL.matchAll(/<h2 class="sec">(\d{1,2})월/g)) if (+m[1] !== mon) W(`템플릿 제목에 ${m[1]}월이 박혀 있어요`);
const evk = (v, end) => { const [d, t] = String(v).split(" "); return Date.parse((d >= "10-01" ? "2026-" : "2027-") + d + "T" + (t || (end ? "23:59" : "00:00")) + ":00+09:00"); };
const ev = D.tipx.cal.ev || [];
if (!ev.some((e) => e[0] === "융광종 토벌" && evk(e[3]) <= Date.now() && Date.now() <= evk(e[4], 1) + 59e3)) W("지금 진행 중인 융광종 토벌 일정이 없어요 (월·금 05:00 교체분 추가 필요)");
if (!ev.some((e) => e[3] && evk(e[3]) > Date.now())) W("앞으로 시작하는 이벤트가 하나도 없어요 (새 일정 확인 필요)");
const iconsJs = (readFileSync(join(PUB, "index.html"), "utf8").match(/icons\.[0-9a-f]+\.js/) || [])[0];
if (iconsJs) { const map = JSON.parse(readFileSync(join(PUB, iconsJs), "utf8").replace(/^window\.__DEF=/, "").replace(/;$/, "")); for (const [k, v] of Object.entries(map)) if (v.startsWith("ic/") && !existsSync(join(PUB, v))) F(`아이콘 파일 없음: ${k}`); }

/* 2) 화면 검사 (Playwright) */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
const srv = createServer((q, r) => { let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html"; const f = join(PUB, p); if (!f.startsWith(PUB) || !existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" }); r.end(readFileSync(f)); }).listen(0);
const port = srv.address().port;
const CHECK = `(()=>{const out=[];const W=innerWidth;const g=document.getElementById('grid');if(!g)return['grid 없음'];
const t=g.innerText;if(/\\bundefined\\b|\\bNaN\\b/.test(t))out.push('undefined/NaN 글자');
if(document.documentElement.scrollWidth>W)out.push('가로 스크롤 '+document.documentElement.scrollWidth+'px');
const vis=e=>{const r=e.getBoundingClientRect();if(!r.width||!r.height)return false;const s=getComputedStyle(e);return s.visibility!=='hidden'&&s.display!=='none'};
const nm=e=>e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.split(' ')[0]:'')+' "'+(e.textContent||'').trim().slice(0,18)+'"';
for(const e of g.querySelectorAll('*')){if(!vis(e))continue;const r=e.getBoundingClientRect();
 if(r.right>W+1&&!e.closest('.tw'))out.push('화면 밖으로 넘침 '+nm(e));
 if(!e.children.length&&e.textContent.trim()&&e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).display!=='inline')out.push('글자 잘림 '+nm(e));
 const s=getComputedStyle(e);if(/auto|scroll/.test(s.overflowX+s.overflowY)&&(e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1)&&!e.closest('.tw'))out.push('안쪽 스크롤 '+nm(e));
 if(e.tagName==='IMG'&&e.complete&&!e.naturalWidth&&r.top<innerHeight)out.push('깨진 그림 '+(e.getAttribute('src')||'').slice(0,40));}
for(const row of g.querySelectorAll('.evr, tr')){const c=[...row.children].filter(vis).map(x=>x.getBoundingClientRect());for(let i=1;i<c.length;i++){if(c[i].left<c[i-1].right-1&&c[i].top<c[i-1].bottom-1&&c[i-1].top<c[i].bottom-1)out.push('칸 겹침 '+row.className)}}
return [...new Set(out)].slice(0,6)})()`;
const { chromium } = require("playwright");
const br = await chromium.launch();
try {
  for (const w of [390, 768, 1280, 2300]) {
    const p = await br.newPage({ viewport: { width: w, height: 900 } });
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.route(/fonts\.g/, (r) => r.abort());
    await p.route("**/api/**", (r) => r.fulfill({ contentType: "application/json", body: '{"posts":[],"rows":[]}' }));
    await p.goto(`http://localhost:${port}/#home`); await p.waitForTimeout(800);
    const tabs = await p.evaluate(() => TABS);
    for (const t of tabs) {
      await p.evaluate((t) => go(t), t); await p.waitForTimeout(150);
      const a = await p.$("nav.subnav button.all"); if (a && (await a.isVisible())) { await a.click(); await p.waitForTimeout(250); }
      const r = await p.evaluate(CHECK); for (const x of r) F(`[${w}px · ${t} 탭] ${x}`);
      for (const e of errs.splice(0)) F(`[${w}px · ${t} 탭] 스크립트 오류: ${e}`);
    }
    if (w === 390 || w === 1280) for (const b of D.board || []) {
      await p.evaluate((id) => { go("guide"); GP = id; render(); }, b.id); await p.waitForTimeout(120);
      const r = await p.evaluate(CHECK); for (const x of r) F(`[${w}px · 공략 「${b.title}」] ${x}`);
      const bad = await p.evaluate(async () => { const im = [...document.querySelectorAll("#grid img")]; await Promise.all(im.map((i) => i.decode().catch(() => 0))); return im.filter((i) => !i.naturalWidth).map((i) => i.getAttribute("src")); });
      for (const s of bad) F(`[${w}px] 공략 「${b.title}」 사진이 안 열려요: ${s}`);
      for (const e of errs.splice(0)) F(`[${w}px · 공략 「${b.title}」] 스크립트 오류: ${e}`);
    }
    await p.close();
  }
} finally { await br.close(); srv.close(); }

console.log(`\n점검 결과 (${today}) — 문제 ${fails.length}개 · 확인 필요 ${warns.length}개`);
for (const m of [...new Set(fails)]) console.log("❌ " + m);
for (const m of [...new Set(warns)]) console.log("⚠️ " + m);
if (!fails.length && !warns.length) console.log("✅ 이상 없음");
process.exit(fails.length ? 1 : 0);
