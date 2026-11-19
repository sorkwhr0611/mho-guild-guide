// src/ 의 원본을 합쳐서 public/index.html 을 만들어요. (Netlify가 배포할 때 자동 실행)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const data = JSON.stringify(JSON.parse(rd("./src/data.json")));
// 큰 사진은 src/img/*.jpg 로 따로 두고 public/img/ 로 복사해요 (페이지 용량 줄이기)
const imgFiles = (() => { try { return readdirSync(new URL("./src/img/", import.meta.url)); } catch { return []; } })();
const imgs = imgFiles.filter((f) => f.endsWith(".jpg")).map((f) => f.slice(0, -4));
// 화면에는 webp(가벼움)가 있으면 webp, 없으면 jpg. jpg는 카톡 미리보기용으로 같이 올려요.
const imgShown = imgs.map((k) => (imgFiles.includes(k + ".webp") ? k + ".webp" : k + ".jpg"));
// 아이콘·아이템 그림은 한 장씩 public/ic/<해시>.jpg 로 쪼개서, 화면에 보이는 것만 불러와요
mkdirSync(new URL("./public/ic/", import.meta.url), { recursive: true });
const icFiles = new Set();
const toFile = (uri) => {
  if (process.env.INLINE_ICONS) return uri; // 미리보기용: 쪼개지 않고 그대로
  const m = /^data:image\/(jpeg|png|webp|gif);base64,(.+)$/.exec(uri || "");
  if (!m) return uri;
  const buf = Buffer.from(m[2], "base64");
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const name = createHash("sha1").update(buf).digest("hex").slice(0, 12) + "." + ext;
  if (!icFiles.has(name)) { writeFileSync(new URL("./public/ic/" + name, import.meta.url), buf); icFiles.add(name); }
  return "ic/" + name;
};
const splitMap = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toFile(v)]));
const iconsJs = "window.__DEF=" + JSON.stringify(splitMap(JSON.parse(rd("./src/icons.json")))) + ";";
const iconsName = "icons." + createHash("sha1").update(iconsJs).digest("hex").slice(0, 10) + ".js";
const html = rd("./src/template.html")
  .replace(/const GI=(\{.*?\});/s, (_, j) => "const GI=" + JSON.stringify(splitMap(JSON.parse(j))) + ";")
  .replace("__ICONSJS__", () => iconsName)
  .replace("__SHOTS__", () => rd("./src/shots.json").trim())
  .replace("__IMGS__", () => JSON.stringify(imgShown))
  .replace("__DATA__", () => data);
mkdirSync(new URL("./public/", import.meta.url), { recursive: true });
writeFileSync(new URL("./public/index.html", import.meta.url), html);
// 홈 화면 앱(PWA) 파일 복사
for (const f of readdirSync(new URL("./src/pwa/", import.meta.url))) copyFileSync(new URL("./src/pwa/" + f, import.meta.url), new URL("./public/" + f, import.meta.url));
writeFileSync(new URL("./public/" + iconsName, import.meta.url), iconsJs);
mkdirSync(new URL("./public/img/", import.meta.url), { recursive: true });
for (const f of imgFiles.filter((x) => /\.(jpg|webp)$/.test(x))) copyFileSync(new URL("./src/img/" + f, import.meta.url), new URL("./public/img/" + f, import.meta.url));
// 삽화 스크린샷 판정용 글자 인식(tesseract.js, Apache-2.0) — 누를 때만 받아요
mkdirSync(new URL("./public/ocr/", import.meta.url), { recursive: true });
for (const f of readdirSync(new URL("./src/ocr/", import.meta.url))) copyFileSync(new URL("./src/ocr/" + f, import.meta.url), new URL("./public/ocr/" + f, import.meta.url));
// 공략 글마다 카톡·디스코드 미리보기용 페이지 (/p/<글 id>) → 열면 사이트의 그 글로 이동
const SITE_URL = "https://mho-guild-guide.pages.dev";
const escH = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
mkdirSync(new URL("./public/p/", import.meta.url), { recursive: true });
const D0 = JSON.parse(data);
let pages = 0;
for (const b of D0.board || []) {
  if (!/^[a-z0-9_-]+$/i.test(b.id)) continue;
  const desc = (b.lines || []).join(" ").replace(/\s+/g, " ").slice(0, 110) + ((b.lines || []).join(" ").length > 110 ? "…" : "");
  const img = (b.images || []).find((k) => imgs.includes(k));
  const ogImg = img ? `${SITE_URL}/img/${img}.jpg` : b.yt ? `https://i.ytimg.com/vi/${b.yt}/hqdefault.jpg` : `${SITE_URL}/icon-512.png`;
  const to = "/#guide/p-" + encodeURIComponent(b.id);
  writeFileSync(new URL(`./public/p/${b.id}.html`, import.meta.url), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escH(b.title)} · 직장인수렵단 공략집</title><meta name="description" content="${escH(desc)}"><meta property="og:type" content="article"><meta property="og:site_name" content="직장인수렵단 공략집"><meta property="og:title" content="${escH(b.title)}"><meta property="og:description" content="${escH(desc)}"><meta property="og:image" content="${ogImg}"><meta property="og:url" content="${SITE_URL}/p/${b.id}"><meta name="twitter:card" content="${img || b.yt ? "summary_large_image" : "summary"}"><meta http-equiv="refresh" content="0;url=${to}"><link rel="canonical" href="${SITE_URL}${to}"></head><body><script>location.replace(${JSON.stringify(to)})</script><p><a href="${to}">${escH(b.title)} 보러 가기</a></p></body></html>`);
  pages++;
}
console.log("share pages", pages);
// 캐시 규칙 (Cloudflare Pages · Netlify 둘 다 public/_headers 를 읽어요)
writeFileSync(new URL("./public/_headers", import.meta.url), ["/icons.*", "  Cache-Control: public, max-age=31536000, immutable", "/ic/*", "  Cache-Control: public, max-age=31536000, immutable", "/img/*", "  Cache-Control: public, max-age=604800", "/ocr/*", "  Cache-Control: public, max-age=2592000", ""].join("\n"));
console.log("icons", icFiles.size, "files");
console.log("built public/index.html", (html.length / 1024).toFixed(0) + "KB");
