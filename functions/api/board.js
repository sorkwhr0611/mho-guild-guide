// ⚠️ 자동 생성: netlify/functions/board.mjs 에서 tools/port-functions.mjs 로 만들었어요. 직접 고치지 마세요.
import { kvStore } from "../_lib/store.js";
import { createHash, b64bytes } from "../_lib/hash.js";

// 공략 게시판 글쓰기 (누구나 쓰기 · 글쓴이 비밀번호 또는 길마가 삭제)
// 길마 인증은 guild.mjs와 같아요 (x-admin-key, 환경 변수 GUILD_ADMIN_KEY 우선).
const ADMIN_HASH = "af7f1a19a732de19eaae3eff4946ddad736ab5d5f64fdb7a965212a11972e1da";
const CATS = ["무기·세팅", "모험가", "몬스터·사냥", "채집·탐색", "초보·시스템", "생활·편의", "자유"];
const MAX_POSTS = 500, MAX_IMG = 3, MAX_IMG_LEN = 420000; // data URL 한 장 약 300KB까지

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const err = (code, status = 400) => json({ error: code }, status);
const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const uid = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const view = (p) => ({ id: p.id, at: p.at, nick: p.nick, cat: p.cat, title: p.title, lines: p.lines, imgs: p.imgs || 0, yt: p.yt || "", hid: !!p.hid });
const REPORT_HIDE = 3; // 신고 3번이면 자동으로 숨겨요 (길마가 다시 보이게 할 수 있음)
const pidOk = (x) => /^[a-z0-9_-]{1,60}$/i.test(String(x || ""));
const cView = (c, admin) => ({ id: c.id, at: c.at, nick: c.nick, text: c.hid && !admin ? "" : c.text, hid: !!c.hid });

export async function onRequest({ request: req, env }) {
  const store = kvStore(env, "guild-board");
  const key = req.headers.get("x-admin-key") || "";
  const envKey = env.GUILD_ADMIN_KEY || "";
  const isAdmin = key.length > 0 && (envKey ? key === envKey : sha(key) === ADMIN_HASH);
  const url = new URL(req.url);

  // 이사용 백업: 길마만, 저장된 원본을 그대로 내보내요 (GET ?export=1)
  if (req.method === "GET" && new URL(req.url).searchParams.get("export") === "1") {
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    const dumpStore = async (s) => { const { blobs } = await s.list(); return Promise.all(blobs.map(async (b) => ({ key: b.key, value: await s.get(b.key) }))); };
    return json({ stores: { "guild-board": await dumpStore(store) } });
  }

  if (req.method === "GET") {
    const img = url.searchParams.get("img");
    if (img) {
      if (!/^u[a-z0-9]+:\d$/.test(img)) return err("img");
      const d = await store.get("img:" + img);
      if (!d) return err("not_found", 404);
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(d);
      if (!m) return err("img");
      return new Response(b64bytes(m[2]), { headers: { "content-type": m[1], "cache-control": "public, max-age=31536000, immutable" } });
    }
    const idx = (await store.get("index", { type: "json" })) || [];
    const meta = (await store.get("meta", { type: "json" })) || {};
    const pid = url.searchParams.get("post");
    if (pid) {
      if (!pidOk(pid)) return err("post");
      const m = meta[pid] || {};
      const tok = sha("tk|" + clip(url.searchParams.get("tk"), 64));
      return json({ admin: isAdmin, likes: (m.l || []).length, liked: (m.l || []).includes(tok), reported: (m.r || []).includes(tok), comments: (m.c || []).map((c) => cView(c, isAdmin)) });
    }
    const counts = {};
    Object.entries(meta).forEach(([k, m]) => { const l = (m.l || []).length, c = (m.c || []).filter((x) => !x.hid).length; if (l || c) counts[k] = [l, c]; });
    return json({ admin: isAdmin, posts: idx.filter((p) => isAdmin || !p.hid).map(view), counts });
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
    if (idx.length >= MAX_POSTS) return err("full", 429);
    const imgs = (Array.isArray(b.images) ? b.images : []).filter((s) => typeof s === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(s) && s.length <= MAX_IMG_LEN).slice(0, MAX_IMG);
    let yt = "";
    const ym = /(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/.exec(String(b.yt || ""));
    if (ym) yt = ym[1];
    const p = { id: uid(), at: Date.now(), nick, cat, title, lines, imgs: imgs.length, yt }; // 글 삭제는 길마만
    await Promise.all(imgs.map((s, i) => store.set(`img:${p.id}:${i}`, s)));
    idx.unshift(p);
    await store.setJSON("index", idx);
    return json({ ok: true, post: view(p) });
  }

  if (act === "delete") {
    const id = clip(b.id, 40);
    const p = idx.find((x) => x.id === id);
    if (!p) return err("not_found", 404);
    if (!isAdmin) return err("forbidden", 403);
    await Promise.all(Array.from({ length: p.imgs || 0 }, (_, i) => store.delete(`img:${p.id}:${i}`)));
    await store.setJSON("index", idx.filter((x) => x.id !== id));
    const mt = (await store.get("meta", { type: "json" })) || {};
    if (mt["u-" + id]) { delete mt["u-" + id]; await store.setJSON("meta", mt); }
    return json({ ok: true });
  }

  // ---- 추천 · 댓글 · 신고 · 숨김 ----
  const meta = (await store.get("meta", { type: "json" })) || {};
  const pid = clip(b.post, 60);
  if (!pidOk(pid)) return err("post");
  const m = meta[pid] || (meta[pid] = {});
  m.l = m.l || []; m.c = m.c || []; m.r = m.r || [];
  const tokRaw = clip(b.tk, 64);
  const tok = sha("tk|" + tokRaw);
  const save = async () => { await store.setJSON("meta", meta); return json({ ok: true, likes: m.l.length, liked: m.l.includes(tok), comments: m.c.map((c) => cView(c, isAdmin)) }); };
  const userPost = pid.startsWith("u-") ? idx.find((x) => "u-" + x.id === pid) : null;

  if (act === "like") {
    if (tokRaw.length < 8) return err("tk");
    const i = m.l.indexOf(tok);
    i >= 0 ? m.l.splice(i, 1) : m.l.push(tok);
    return save();
  }
  if (act === "comment.add") {
    const nick = clip(b.nick, 24), text = clip(b.text, 500), pw = clip(b.pw, 40);
    if (!nick) return err("nick");
    if (!text) return err("body");
    if (pw.length < 4) return err("pw");
    if (m.c.length >= 300) return err("full", 429);
    m.c.push({ id: uid(), at: Date.now(), nick, text, pw: sha("bp|" + pw), r: [] });
    return save();
  }
  if (act === "comment.del") {
    const c = m.c.find((x) => x.id === clip(b.id, 40));
    if (!c) return err("not_found", 404);
    if (!isAdmin && c.pw !== sha("bp|" + clip(b.pw, 40))) return err("forbidden", 403);
    m.c = m.c.filter((x) => x !== c);
    return save();
  }
  if (act === "report") {
    if (tokRaw.length < 8) return err("tk");
    if (b.id) { // 댓글 신고
      const c = m.c.find((x) => x.id === clip(b.id, 40));
      if (!c) return err("not_found", 404);
      c.r = c.r || [];
      if (!c.r.includes(tok)) c.r.push(tok);
      if (c.r.length >= REPORT_HIDE) c.hid = true;
      return save();
    }
    if (!userPost) return err("post");
    if (!m.r.includes(tok)) m.r.push(tok);
    if (m.r.length >= REPORT_HIDE && !userPost.hid) { userPost.hid = true; await store.setJSON("index", idx); }
    return save();
  }
  if (act === "hide") { // 길마: 글이나 댓글 숨기기/보이기
    if (!isAdmin) return err("forbidden", 403);
    const on = b.hide !== false;
    if (b.id) { const c = m.c.find((x) => x.id === clip(b.id, 40)); if (!c) return err("not_found", 404); c.hid = on; if (!on) c.r = []; return save(); }
    if (!userPost) return err("post");
    userPost.hid = on; if (!on) m.r = [];
    await store.setJSON("index", idx);
    return save();
  }
  return err("action");
}
