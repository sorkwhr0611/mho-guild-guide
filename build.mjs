// src/ 의 원본을 합쳐서 public/index.html 을 만들어요. (Netlify가 배포할 때 자동 실행)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const data = JSON.stringify(JSON.parse(rd("./src/data.json")));
// 큰 사진은 src/img/*.jpg 로 따로 두고 public/img/ 로 복사해요 (페이지 용량 줄이기)
const imgs = (() => { try { return readdirSync(new URL("./src/img/", import.meta.url)).filter((f) => f.endsWith(".jpg")).map((f) => f.slice(0, -4)); } catch { return []; } })();
// 아이콘·아이템 그림은 한 장씩 public/ic/<해시>.jpg 로 쪼개서, 화면에 보이는 것만 불러와요
mkdirSync(new URL("./public/ic/", import.meta.url), { recursive: true });
const icFiles = new Set();
const toFile = (uri) => {
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
  .replace("__IMGS__", () => JSON.stringify(imgs))
  .replace("__DATA__", () => data);
mkdirSync(new URL("./public/", import.meta.url), { recursive: true });
writeFileSync(new URL("./public/index.html", import.meta.url), html);
// 홈 화면 앱(PWA) 파일 복사
for (const f of readdirSync(new URL("./src/pwa/", import.meta.url))) copyFileSync(new URL("./src/pwa/" + f, import.meta.url), new URL("./public/" + f, import.meta.url));
writeFileSync(new URL("./public/" + iconsName, import.meta.url), iconsJs);
mkdirSync(new URL("./public/img/", import.meta.url), { recursive: true });
for (const f of imgs) copyFileSync(new URL("./src/img/" + f + ".jpg", import.meta.url), new URL("./public/img/" + f + ".jpg", import.meta.url));
console.log("icons", icFiles.size, "files");
console.log("built public/index.html", (html.length / 1024).toFixed(0) + "KB");
