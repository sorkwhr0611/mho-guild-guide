// netlify/functions/*.mjs 를 Cloudflare Pages Functions(functions/api/*.js)로 옮겨 적어요.
// 서버 코드를 고치면 `node tools/port-functions.mjs` 를 다시 돌려 두 쪽을 맞춰요.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const root = new URL("..", import.meta.url);
for (const f of readdirSync(new URL("netlify/functions/", root)).filter((x) => x.endsWith(".mjs"))) {
  let s = readFileSync(new URL("netlify/functions/" + f, root), "utf8");
  const n0 = s.length;
  s = s.replace('import { getStore } from "@netlify/blobs";', 'import { kvStore } from "../_lib/store.js";');
  s = s.replace(/getStore\(\{ name: "([^"]+)", consistency: "strong" \}\)/g, (_, n) => `kvStore(env, "${n}")`);
  s = s.replace("export default async (req) => {", "export async function onRequest({ request: req, env }) {");
  s = s.replace(/process\.env\.([A-Z_]+)/g, "env.$1");
  s = s.replace('import { createHash } from "node:crypto";', 'import { createHash, b64bytes } from "../_lib/hash.js";');
  s = s.replace(/Buffer\.from\(([^,]+), "base64"\)/g, "b64bytes($1)");
  s = s.replace(/\n\};\n\nexport const config = \{[^}]*\};\n?$/, "\n}\n");
  if (/getStore|export default|export const config|process\.env|node:crypto|Buffer\./.test(s)) throw new Error(f + ": 변환이 덜 됐어요");
  writeFileSync(new URL("functions/api/" + f.replace(".mjs", ".js"), root), "// ⚠️ 자동 생성: netlify/functions/" + f + " 에서 tools/port-functions.mjs 로 만들었어요. 직접 고치지 마세요.\n" + s);
  console.log("ported", f, n0, "→", s.length);
}
