import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

// 길마 관리 비밀번호(SHA-256). Netlify 환경 변수 GUILD_ADMIN_KEY가 있으면 그게 우선이에요.
const ADMIN_HASH = "af7f1a19a732de19eaae3eff4946ddad736ab5d5f64fdb7a965212a11972e1da";

const STATUSES = ["확인 중", "안내 완료", "가입 완료", "보류"];
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const clip = (v, n) => String(v ?? "").trim().slice(0, n);

export default async (req) => {
  const store = getStore({ name: "guild-join", consistency: "strong" });
  const key = req.headers.get("x-admin-key") || "";
  const envKey = process.env.GUILD_ADMIN_KEY || "";
  const hash = createHash("sha256").update(key).digest("hex");
  const isAdmin = key.length > 0 && (envKey ? key === envKey : hash === ADMIN_HASH);

  const meta = getStore({ name: "guild-meta", consistency: "strong" });

  // 이사용 백업: 길마만, 저장된 원본을 그대로 내보내요 (GET ?export=1)
  if (req.method === "GET" && new URL(req.url).searchParams.get("export") === "1") {
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    const dumpStore = async (s) => { const { blobs } = await s.list(); return Promise.all(blobs.map(async (b) => ({ key: b.key, value: await s.get(b.key) }))); };
    return json({ stores: { "guild-join": await dumpStore(store),"guild-meta": await dumpStore(meta) } });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("check") === "admin") return json({ admin: isAdmin });
    if (url.searchParams.get("meta") === "1") {
      const [arena, waitlist] = await Promise.all([meta.get("arena", { type: "json" }), meta.get("waitlist", { type: "json" })]);
      return json({ admin: isAdmin, arena: arena || null, waitlist: waitlist || null });
    }
    const { blobs } = await store.list();
    const rows = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
    rows.sort((a, b) => (b.at || 0) - (a.at || 0));
    const [waitlist, arena] = await Promise.all([meta.get("waitlist", { type: "json" }), meta.get("arena", { type: "json" })]);
    return json({ admin: isAdmin, waitlist: waitlist || null, arena: arena || null, rows: rows.map((r) => (isAdmin ? r : { ...r, contact: r.contact ? "(길마만 볼 수 있어요)" : "" })) });
  }

  if (req.method === "POST") {
    let b;
    try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
    if (b.website) return json({ ok: true }); // honeypot
    const row = {
      id: `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
      nickname: clip(b.nickname, 24),
      level: clip(b.level, 3),
      time: clip(b.time, 12),
      main: clip(b.main, 40),
      contact: clip(b.contact, 60),
      message: clip(b.message, 500),
      status: "확인 중",
    };
    if (!row.nickname || !row.message) return json({ error: "required" }, 400);
    const { blobs } = await store.list();
    if (blobs.length >= 500) return json({ error: "full" }, 429);
    await store.setJSON(row.id, row);
    return json({ ok: true, row: { ...row, contact: row.contact ? "(길마만 볼 수 있어요)" : "" } });
  }

  if (!isAdmin) return json({ error: "forbidden" }, 403);

  if (req.method === "PATCH") {
    let b;
    try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
    const row = await store.get(clip(b.id, 40), { type: "json" });
    if (!row) return json({ error: "not_found" }, 404);
    if (STATUSES.includes(b.status)) row.status = b.status;
    if (typeof b.note === "string") row.note = clip(b.note, 120);
    if (typeof b.nickname === "string" && clip(b.nickname, 24)) row.nickname = clip(b.nickname, 24);
    await store.setJSON(row.id, row);
    return json({ ok: true, row });
  }

  if (req.method === "PUT") {
    let b;
    try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
    if (b.arena && typeof b.arena === "object") {
      const rank = parseInt(b.arena.rank, 10);
      if (!(rank >= 1 && rank <= 9999)) return json({ error: "rank" }, 400);
      const doc = { rank, week: clip(b.arena.week, 30), msg: clip(b.arena.msg, 80), at: Date.now() };
      await meta.setJSON("arena", doc);
      return json({ ok: true, arena: doc });
    }
    if (!Array.isArray(b.waitlist)) return json({ error: "waitlist" }, 400);
    const groups = b.waitlist.slice(0, 12).map((g) => ({
      title: clip(g && g.title, 40),
      names: (Array.isArray(g && g.names) ? g.names : []).map((n) => clip(n, 40)).filter(Boolean).slice(0, 60),
    })).filter((g) => g.title || g.names.length);
    const doc = { groups, at: Date.now() };
    await meta.setJSON("waitlist", doc);
    return json({ ok: true, waitlist: doc });
  }

  if (req.method === "DELETE") {
    const id = clip(new URL(req.url).searchParams.get("id"), 40);
    if (!id) return json({ error: "id" }, 400);
    await store.delete(id);
    return json({ ok: true });
  }

  return json({ error: "method" }, 405);
};

export const config = { path: "/api/join" };
