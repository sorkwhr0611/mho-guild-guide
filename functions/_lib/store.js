// Cloudflare KV를 Netlify Blobs와 같은 모양(get/set/setJSON/list/delete)으로 감싸요.
// 모든 저장소는 KV 바인딩 MHO_KV 하나에 "<저장소 이름>/<키>" 형태로 들어가요.
//
// KV 무료 한도는 하루 list 1,000번 · 쓰기 1,000번 · 읽기 100,000번이에요.
// list()가 제일 빨리 바닥나서, 키 목록을 "<저장소>/__keys" 문서 하나에 따로 들고 있어요.
// → 목록 보기는 읽기 1번으로 끝나고, 진짜 KV list는 목록 문서가 없을 때 딱 한 번만 해요.
const IDX = "__keys";

export function kvStore(env, name) {
  const kv = env.MHO_KV;
  if (!kv) throw new Error("KV 바인딩 MHO_KV가 없어요 (Cloudflare Pages 설정 → Functions → KV 바인딩)");
  const p = name + "/";

  const realList = async () => {
    const keys = []; let cursor;
    do { const r = await kv.list({ prefix: p, cursor }); r.keys.forEach((x) => { const k = x.name.slice(p.length); if (k !== IDX) keys.push(k); }); cursor = r.list_complete ? null : r.cursor; } while (cursor);
    return keys;
  };
  const readIdx = async () => {
    const v = await kv.get(p + IDX);
    if (v != null) { try { const a = JSON.parse(v); if (Array.isArray(a)) return a; } catch {} }
    const keys = await realList();            // 목록 문서가 없으면 한 번만 진짜 list
    await kv.put(p + IDX, JSON.stringify(keys));
    return keys;
  };
  const addKey = async (k) => { const keys = await readIdx(); if (!keys.includes(k)) { keys.push(k); await kv.put(p + IDX, JSON.stringify(keys)); } };
  const dropKey = async (k) => { const keys = await readIdx(); const i = keys.indexOf(k); if (i >= 0) { keys.splice(i, 1); await kv.put(p + IDX, JSON.stringify(keys)); } };

  return {
    async get(k, o) { const v = await kv.get(p + k); if (v == null) return null; return o && o.type === "json" ? JSON.parse(v) : v; },
    async set(k, v) { await kv.put(p + k, String(v)); await addKey(k); },
    async setJSON(k, v) { await kv.put(p + k, JSON.stringify(v)); await addKey(k); },
    async delete(k) { await kv.delete(p + k); await dropKey(k); },
    async list(o = {}) {
      const pre = o.prefix || "";
      const keys = await readIdx();
      return { blobs: keys.filter((k) => k.startsWith(pre)).map((key) => ({ key })) };
    },
  };
}
