// src/ 의 원본을 합쳐서 public/index.html 을 만들어요. (Netlify가 배포할 때 자동 실행)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const data = JSON.stringify(JSON.parse(rd("./src/data.json")));
// 큰 사진은 src/img/*.jpg 로 따로 두고 public/img/ 로 복사해요 (페이지 용량 줄이기)
const imgs = (() => { try { return readdirSync(new URL("./src/img/", import.meta.url)).filter((f) => f.endsWith(".jpg")).map((f) => f.slice(0, -4)); } catch { return []; } })();
const html = rd("./src/template.html")
  .replace("__ICONS__", () => rd("./src/icons.json").trim())
  .replace("__SHOTS__", () => rd("./src/shots.json").trim())
  .replace("__IMGS__", () => JSON.stringify(imgs))
  .replace("__DATA__", () => data);
mkdirSync(new URL("./public/", import.meta.url), { recursive: true });
writeFileSync(new URL("./public/index.html", import.meta.url), html);
// 홈 화면 앱(PWA) 파일 복사
for (const f of readdirSync(new URL("./src/pwa/", import.meta.url))) copyFileSync(new URL("./src/pwa/" + f, import.meta.url), new URL("./public/" + f, import.meta.url));
mkdirSync(new URL("./public/img/", import.meta.url), { recursive: true });
for (const f of imgs) copyFileSync(new URL("./src/img/" + f + ".jpg", import.meta.url), new URL("./public/img/" + f + ".jpg", import.meta.url));
console.log("built public/index.html", (html.length / 1024).toFixed(0) + "KB");
