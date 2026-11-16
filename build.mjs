// src/ 의 원본을 합쳐서 public/index.html 을 만들어요. (Netlify가 배포할 때 자동 실행)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const data = JSON.stringify(JSON.parse(rd("./src/data.json")));
const html = rd("./src/template.html")
  .replace("__ICONS__", () => rd("./src/icons.json").trim())
  .replace("__SHOTS__", () => rd("./src/shots.json").trim())
  .replace("__DATA__", () => data);
mkdirSync(new URL("./public/", import.meta.url), { recursive: true });
writeFileSync(new URL("./public/index.html", import.meta.url), html);
console.log("built public/index.html", (html.length / 1024).toFixed(0) + "KB");
