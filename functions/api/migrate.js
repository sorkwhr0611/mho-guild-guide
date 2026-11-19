// Netlify → Cloudflare 이사 도우미 (길마 전용)
// POST /api/migrate : 예전 Netlify 사이트의 /api/{join,guild,board}?export=1 에서 원본을 받아 KV에 그대로 옮겨요.
// GET  /api/migrate : 지금 KV에 저장소별로 몇 개가 들어 있는지 보여 줘요.
import { createHash } from "node:crypto";
const ADMIN_HASH = "af7f1a19a732de19eaae3eff4946ddad736ab5d5f64fdb7a965212a11972e1da";
const OLD = "https://wondrous-otter-9e87e6.netlify.app";
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
export async function onRequest({ request: req, env }) {
  const key = req.headers.get("x-admin-key") || "";
  const envKey = env.GUILD_ADMIN_KEY || "";
  const isAdmin = key.length > 0 && (envKey ? key === envKey : createHash("sha256").update(key).digest("hex") === ADMIN_HASH);
  if (!isAdmin) return json({ error: "forbidden" }, 403);
  const kv = env.MHO_KV;
  if (!kv) return json({ error: "no_kv" }, 500);
  const count = async () => { const out = {}; let cursor; do { const r = await kv.list({ cursor }); r.keys.forEach((k) => { const s = k.name.split("/")[0]; out[s] = (out[s] || 0) + 1; }); cursor = r.list_complete ? null : r.cursor; } while (cursor); return out; };
  if (req.method === "GET") return json({ ok: true, counts: await count() });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const from = (env.OLD_SITE || OLD).replace(/\/$/, "");
  const result = {};
  for (const ep of ["join", "guild", "board"]) {
    const r = await fetch(`${from}/api/${ep}?export=1`, { headers: { "x-admin-key": key } });
    if (!r.ok) return json({ error: "export_failed", endpoint: ep, status: r.status, done: result }, 502);
    const { stores } = await r.json();
    for (const [name, items] of Object.entries(stores || {})) {
      let n = 0;
      for (const it of items) { if (it && it.key && it.value != null) { await kv.put(name + "/" + it.key, typeof it.value === "string" ? it.value : JSON.stringify(it.value)); n++; } }
      result[name] = n;
    }
  }
  return json({ ok: true, copied: result, counts: await count() });
}
