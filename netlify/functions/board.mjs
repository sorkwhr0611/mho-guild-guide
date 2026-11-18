import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

// 공략 게시판 글쓰기 (누구나 쓰기 · 글쓴이 비밀번호 또는 길마가 삭제)
// 길마 인증은 guild.mjs와 같아요 (x-admin-key, 환경 변수 GUILD_ADMIN_KEY 우선).
const ADMIN_HASH = "af7f1a19a732de19eaae3eff4946ddad736ab5d5f64fdb7a965212a11972e1da";
const CATS = ["무기·세팅", "모험가", "몬스터·사냥", "채집·탐색", "초보·시스템", "생활·편의"];
const MAX_POSTS = 500, MAX_IMG = 3, MAX_IMG_LEN = 420000; // data URL 한 장 약 300KB까지

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const err = (code, status = 400) => json({ error: code }, status);
const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const uid = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const view = (p) => ({ id: p.id, at: p.at, nick: p.nick, cat: p.cat, title: p.title, lines: p.lines, imgs: p.imgs || 0, yt: p.yt || "" });

export default async (req) => {
  const store = getStore({ name: "guild-board", consistency: "strong" });
  const key = req.headers.get("x-admin-key") || "";
  const envKey = process.env.GUILD_ADMIN_KEY || "";
  const isAdmin = key.length > 0 && (envKey ? key === envKey : sha(key) === ADMIN_HASH);
  const url = new URL(req.url);

  if (req.method === "GET") {
    const img = url.searchParams.get("img");
    if (img) {
      if (!/^u[a-z0-9]+:\d$/.test(img)) return err("img");
      const d = await store.get("img:" + img);
      if (!d) return err("not_found", 404);
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(d);
      if (!m) return err("img");
      return new Response(Buffer.from(m[2], "base64"), { headers: { "content-type": m[1], "cache-control": "public, max-age=31536000, immutable" } });
    }
    const idx = (await store.get("index", { type: "json" })) || [];
    return json({ admin: isAdmin, posts: idx.map(view) });
  }
  if (req.method !== "POST") return err("method", 405);
  let b;
  try { b = await req.json(); } catch { return err("bad_json"); }
  const act = String(b.action || "");
  const idx = (await store.get("index", { type: "json" })) || [];

  if (act === "create") {
    const nick = clip(b.nick, 24), title = clip(b.title, 80), cat = CATS.includes(b.cat) ? b.cat : "초보·시스템";
    const lines = String(b.body ?? "").replace(/\r/g, "").split("\n").map((l) => l.trim().slice(0, 400)).filter(Boolean).slice(0, 40);
    if (!nick) return err("nick");
    if (!title) return err("title");
    if (!lines.length) return err("body");
    const pw = clip(b.pw, 40);
    if (pw.length < 4) return err("pw");
    if (idx.length >= MAX_POSTS) return err("full", 429);
    const imgs = (Array.isArray(b.images) ? b.images : []).filter((s) => typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(s) && s.length <= MAX_IMG_LEN).slice(0, MAX_IMG);
    let yt = "";
    const ym = /(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/.exec(String(b.yt || ""));
    if (ym) yt = ym[1];
    const p = { id: uid(), at: Date.now(), nick, cat, title, lines, imgs: imgs.length, yt, pw: sha("bp|" + pw) };
    await Promise.all(imgs.map((s, i) => store.set(`img:${p.id}:${i}`, s)));
    idx.unshift(p);
    await store.setJSON("index", idx);
    return json({ ok: true, post: view(p) });
  }

  if (act === "delete") {
    const id = clip(b.id, 40);
    const p = idx.find((x) => x.id === id);
    if (!p) return err("not_found", 404);
    if (!isAdmin && p.pw !== sha("bp|" + clip(b.pw, 40))) return err("forbidden", 403);
    await Promise.all(Array.from({ length: p.imgs || 0 }, (_, i) => store.delete(`img:${p.id}:${i}`)));
    await store.setJSON("index", idx.filter((x) => x.id !== id));
    return json({ ok: true });
  }

  return err("action");
};

export const config = { path: "/api/board" };
