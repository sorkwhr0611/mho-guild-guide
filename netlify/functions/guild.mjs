import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

// 길드 투표 · 파티 모집 · 단원명부 · 토요일 출석부
// 길마 인증은 join.mjs와 같아요 (x-admin-key, 환경 변수 GUILD_ADMIN_KEY 우선).
const ADMIN_HASH = "af7f1a19a732de19eaae3eff4946ddad736ab5d5f64fdb7a965212a11972e1da";
const MAX_POLLS = 100, MAX_OPTS = 20, MAX_ROSTER = 300, KEEP_ATT = 26;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, "");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const err = (code, status = 400) => json({ error: code }, status);

// KST 기준 오늘이 속한 주의 토요일(오늘이 토요일이면 오늘, 아니면 지난 토요일)
function lastSaturday(now = Date.now()) {
  const k = new Date(now + 9 * 3600e3);
  const back = (k.getUTCDay() + 1) % 7; // 토=0, 일=1, ..., 금=6
  return new Date(k.getTime() - back * 864e5).toISOString().slice(0, 10);
}
const isSat = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + "T00:00:00Z").getUTCDay() === 6;

function pollView(p, admin) {
  const counts = p.options.map(() => 0);
  const names = p.kind === "party" ? p.options.map(() => []) : null;
  const vs = Object.values(p.votes || {});
  vs.forEach((v) => v.c.forEach((i) => { if (counts[i] !== undefined) { counts[i]++; if (names && v.n) names[i].push(v.n); } }));
  const closed = !!p.closed || (p.deadline && Date.now() > p.deadline);
  return { id: p.id, at: p.at, title: p.title, desc: p.desc || "", kind: p.kind, multi: p.multi, deadline: p.deadline || null, slots: p.slots || 0,
    by: p.by || "", closed, options: p.options, counts, names, voters: vs.length };
}

export default async (req) => {
  const store = getStore({ name: "guild-hub", consistency: "strong" });
  const key = req.headers.get("x-admin-key") || "";
  const envKey = process.env.GUILD_ADMIN_KEY || "";
  const isAdmin = key.length > 0 && (envKey ? key === envKey : sha(key) === ADMIN_HASH);

  const getRoster = async () => (await store.get("roster", { type: "json" })) || { members: [] };
  const listPolls = async () => {
    const { blobs } = await store.list({ prefix: "poll:" });
    return (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean).sort((a, b) => b.at - a.at);
  };
  const getAtt = async (d) => (await store.get("att:" + d, { type: "json" })) || { date: d, present: [] };

  if (req.method === "GET") {
    const [roster, polls, { blobs }] = await Promise.all([getRoster(), listPolls(), store.list({ prefix: "att:" })]);
    const keys = blobs.map((b) => b.key).sort().slice(-KEEP_ATT);
    const att = {};
    (await Promise.all(keys.map((k) => store.get(k, { type: "json" })))).filter(Boolean).forEach((a) => (att[a.date] = a.present));
    return json({ admin: isAdmin, saturday: lastSaturday(), roster: roster.members, polls: polls.map((p) => pollView(p, isAdmin)), att });
  }
  if (req.method !== "POST") return err("method", 405);

  let b;
  try { b = await req.json(); } catch { return err("bad_json"); }
  const act = String(b.action || "");
  const roster = await getRoster();
  const inRoster = (nick) => {
    const n = norm(nick);
    if (!n) return null;
    if (!roster.members.length) return { name: clip(nick, 24) };
    return roster.members.find((m) => norm(m.name) === n) || null;
  };

  // ---- 투표 · 파티 모집 ----
  if (act === "poll.create") {
    const kind = b.kind === "party" ? "party" : "vote";
    let by = "";
    if (!isAdmin) {
      if (kind !== "party") return err("forbidden", 403);
      const m = inRoster(b.nickname);
      if (!m) return err(norm(b.nickname) ? "not_member" : "nickname");
      by = m.name;
    } else if (b.nickname) by = clip(b.nickname, 24);
    const title = clip(b.title, 60);
    const options = (Array.isArray(b.options) ? b.options : []).map((o) => clip(o, 40)).filter(Boolean);
    const uniq = [...new Set(options)].slice(0, MAX_OPTS);
    if (!title) return err("title");
    if (uniq.length < 1 || (kind === "vote" && uniq.length < 2)) return err("options");
    const { blobs } = await store.list({ prefix: "poll:" });
    if (blobs.length >= MAX_POLLS) return err("full", 429);
    const dl = Number(b.deadline) || 0;
    const p = { id: uid("p"), at: Date.now(), title, desc: clip(b.desc, 500), kind, multi: !!b.multi, options: uniq,
      deadline: dl > Date.now() ? dl : null, slots: kind === "party" ? Math.max(0, Math.min(99, parseInt(b.slots, 10) || 0)) : 0,
      by, closed: false, votes: {} };
    await store.setJSON("poll:" + p.id, p);
    return json({ ok: true, poll: pollView(p, isAdmin) });
  }

  if (act === "poll.vote") {
    const id = clip(b.id, 40);
    const p = await store.get("poll:" + id, { type: "json" });
    if (!p) return err("not_found", 404);
    if (p.closed || (p.deadline && Date.now() > p.deadline)) return err("closed");
    const m = inRoster(b.nickname);
    if (!m) return err(norm(b.nickname) ? "not_member" : "nickname");
    let c = (Array.isArray(b.choices) ? b.choices : []).map((x) => parseInt(x, 10)).filter((x) => x >= 0 && x < p.options.length);
    c = [...new Set(c)];
    if (!p.multi) c = c.slice(0, 1);
    const vk = p.kind === "party" ? "n:" + norm(m.name) : "h:" + sha(norm(m.name) + "|" + p.id);
    if (!c.length) { // 빈 선택 = 내 표 취소
      delete p.votes[vk];
      await store.setJSON("poll:" + id, p);
      return json({ ok: true, poll: pollView(p, isAdmin), removed: true });
    }
    if (p.kind === "party" && p.slots) {
      for (const i of c) {
        const taken = Object.entries(p.votes).filter(([k, v]) => k !== vk && v.c.includes(i)).length;
        if (taken >= p.slots) return err("slot_full");
      }
    }
    const replaced = !!p.votes[vk];
    p.votes[vk] = p.kind === "party" ? { c, n: m.name } : { c };
    await store.setJSON("poll:" + id, p);
    return json({ ok: true, poll: pollView(p, isAdmin), replaced });
  }

  if (act === "poll.close" || act === "poll.delete") {
    if (!isAdmin) return err("forbidden", 403);
    const id = clip(b.id, 40);
    const p = await store.get("poll:" + id, { type: "json" });
    if (!p) return err("not_found", 404);
    if (act === "poll.delete") { await store.delete("poll:" + id); return json({ ok: true }); }
    p.closed = b.closed !== false;
    if (!p.closed && p.deadline && Date.now() > p.deadline) p.deadline = null; // 다시 열면 마감 시간 해제
    await store.setJSON("poll:" + id, p);
    return json({ ok: true, poll: pollView(p, isAdmin) });
  }

  // ---- 출석부 ----
  if (act === "att.mark" || act === "att.unmark") {
    const d = clip(b.date, 10);
    if (!isSat(d) || d > lastSaturday()) return err("date");
    if (act === "att.unmark" && !isAdmin) return err("forbidden", 403);
    const mid = clip(b.id, 40);
    if (act === "att.mark" && !roster.members.some((m) => m.id === mid)) return err("not_member");
    const a = await getAtt(d);
    const set = new Set(a.present);
    act === "att.mark" ? set.add(mid) : set.delete(mid);
    a.present = [...set];
    await store.setJSON("att:" + d, a);
    return json({ ok: true, date: d, present: a.present });
  }

  // ---- 단원명부 (길마만) ----
  if (act.startsWith("roster.")) {
    if (!isAdmin) return err("forbidden", 403);
    const ms = roster.members;
    if (act === "roster.add") {
      const names = (Array.isArray(b.names) ? b.names : []).map((n) => clip(n, 24)).filter(Boolean);
      const added = [];
      for (const n of names) {
        if (ms.length >= MAX_ROSTER) break;
        if (ms.some((m) => norm(m.name) === norm(n))) continue;
        const m = { id: uid("m"), name: n };
        ms.push(m); added.push(m);
      }
      await store.setJSON("roster", { members: ms, at: Date.now() });
      return json({ ok: true, roster: ms, added: added.length });
    }
    const id = clip(b.id, 40);
    const m = ms.find((x) => x.id === id);
    if (!m) return err("not_found", 404);
    if (act === "roster.rename") {
      const n = clip(b.name, 24);
      if (!n) return err("name");
      if (ms.some((x) => x.id !== id && norm(x.name) === norm(n))) return err("dup");
      m.name = n; // id가 그대로라 출석 기록은 그대로 이어져요
    } else if (act === "roster.del") {
      roster.members = ms.filter((x) => x.id !== id);
    } else return err("action");
    await store.setJSON("roster", { members: roster.members, at: Date.now() });
    return json({ ok: true, roster: roster.members });
  }

  return err("action");
};

export const config = { path: "/api/guild" };
