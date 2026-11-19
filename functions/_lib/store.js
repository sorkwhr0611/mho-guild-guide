// Cloudflare KV를 Netlify Blobs와 같은 모양(get/set/setJSON/list/delete)으로 감싸요.
// 모든 저장소는 KV 바인딩 MHO_KV 하나에 "<저장소 이름>/<키>" 형태로 들어가요.
export function kvStore(env, name) {
  const kv = env.MHO_KV;
  if (!kv) throw new Error("KV 바인딩 MHO_KV가 없어요 (Cloudflare Pages 설정 → Functions → KV 바인딩)");
  const p = name + "/";
  return {
    async get(k, o) { const v = await kv.get(p + k); if (v == null) return null; return o && o.type === "json" ? JSON.parse(v) : v; },
    async set(k, v) { await kv.put(p + k, String(v)); },
    async setJSON(k, v) { await kv.put(p + k, JSON.stringify(v)); },
    async delete(k) { await kv.delete(p + k); },
    async list(o = {}) {
      const pre = p + (o.prefix || ""); const blobs = []; let cursor;
      do { const r = await kv.list({ prefix: pre, cursor }); r.keys.forEach((x) => blobs.push({ key: x.name.slice(p.length) })); cursor = r.list_complete ? null : r.cursor; } while (cursor);
      return { blobs };
    },
  };
}
