import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

// 길드 투표 · 파티 모집 · 단원명부 · 토요일 출석부 · 길드전 고정 파티
// 길마 인증은 join.mjs와 같아요 (x-admin-key, 환경 변수 GUILD_ADMIN_KEY 우선).
const ADMIN_HASH = "af7f1a19a732de19eaae3eff4946ddad736ab5d5f64fdb7a965212a11972e1da";
const MAX_POLLS = 100, MAX_OPTS = 20, MAX_ROSTER = 300, KEEP_ATT = 26, MAX_PARTIES = 40;
const ROLES = ["atk", "dis", "sup", "dps", "any"]; // 돌격형 · 교란형 · 지원형 (dps·any는 예전 값)

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
// 그 주(토요일 d)에 단원이었나: from(들어온 주) ≤ d < to(나간 주)
const activeOn = (m, d) => (!m.from || m.from <= d) && (!m.to || d < m.to);
// 다음 주 토요일까지는 미리 만들어 둘 수 있어요
const nextSaturday = () => new Date(new Date(lastSaturday() + "T00:00:00Z").getTime() + 7 * 864e5).toISOString().slice(0, 10);
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

  // 이사용 백업: 길마만, 저장된 원본을 그대로 내보내요 (GET ?export=1)
  if (req.method === "GET" && new URL(req.url).searchParams.get("export") === "1") {
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    const dumpStore = async (s) => { const { blobs } = await s.list(); return Promise.all(blobs.map(async (b) => ({ key: b.key, value: await s.get(b.key) }))); };
    return json({ stores: { "guild-hub": await dumpStore(store) } });
  }

  const getRoster = async () => (await store.get("roster", { type: "json" })) || { members: [] };
  const listPolls = async () => {
    const { blobs } = await store.list({ prefix: "poll:" });
    return (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean).sort((a, b) => b.at - a.at);
  };
  const getAtt = async (d) => (await store.get("att:" + d, { type: "json" })) || { date: d, present: [] };

  // 길드전 고정 파티: 단원별 역할(돌격형·교란형·지원형) + 길마가 짠 파티 + 주마다 불참 표시
  const getTeam = async () => (await store.get("team", { type: "json" })) || { size: 4, roles: {}, parties: [] };
  const getAbs = async (d) => (await store.get("abs:" + d, { type: "json" })) || { date: d, ids: [] };
  const teamWeeks = () => [...new Set([lastSaturday(), nextSaturday()])];
  const teamView = async () => {
    const [team, ...abs] = await Promise.all([getTeam(), ...teamWeeks().map(getAbs)]);
    const a = {}; abs.forEach((x) => (a[x.date] = x.ids));
    return { team, abs: a };
  };

  if (req.method === "GET") {
    const [roster, polls, { blobs }, tv] = await Promise.all([getRoster(), listPolls(), store.list({ prefix: "att:" }), teamView()]);
    const keys = blobs.map((b) => b.key).sort().slice(-KEEP_ATT);
    const att = {};
    (await Promise.all(keys.map((k) => store.get(k, { type: "json" })))).filter(Boolean).forEach((a) => (att[a.date] = a.present));
    return json({ admin: isAdmin, saturday: lastSaturday(), roster: roster.members, polls: polls.map((p) => pollView(p, isAdmin)), att, team: tv.team, abs: tv.abs });
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
    const now = lastSaturday();
    return roster.members.find((m) => norm(m.name) === n && (!m.to || m.to > now)) || null;
  };

  // ---- 투표 · 파티 모집 ----
  if (act === "poll.create") {
    // 투표는 길마만 만드는 익명 투표 하나만 써요 (파티 모집은 없앴어요)
    const kind = "vote";
    if (!isAdmin) return err("forbidden", 403);
    const by = "";
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
    if (!isSat(d) || d > nextSaturday()) return err("date");
    if (act === "att.unmark" && !isAdmin) return err("forbidden", 403);
    const mid = clip(b.id, 40);
    const mm = roster.members.find((m) => m.id === mid);
    if (act === "att.mark" && (!mm || !activeOn(mm, d))) return err("not_member");
    const a = await getAtt(d);
    const set = new Set(a.present);
    act === "att.mark" ? set.add(mid) : set.delete(mid);
    a.present = [...set];
    await store.setJSON("att:" + d, a);
    return json({ ok: true, date: d, present: a.present });
  }

  // 출석 기록 지우기 (길마만): date가 있으면 그 주만, all이면 전부
  if (act === "att.clear") {
    if (!isAdmin) return err("forbidden", 403);
    if (b.all) {
      const { blobs } = await store.list({ prefix: "att:" });
      await Promise.all(blobs.map((x) => store.delete(x.key)));
      return json({ ok: true, cleared: blobs.length });
    }
    const d = clip(b.date, 10);
    if (!isSat(d)) return err("date");
    await store.delete("att:" + d);
    return json({ ok: true, date: d, present: [] });
  }

  // 여러 명 한 번에 저장 (추가는 누구나, 빼기는 길마만)
  if (act === "att.bulk") {
    const d = clip(b.date, 10);
    if (!isSat(d) || d > nextSaturday()) return err("date");
    const ids = (v) => (Array.isArray(v) ? v : []).map((x) => clip(x, 40)).slice(0, MAX_ROSTER);
    const add = ids(b.add), del = ids(b.remove);
    if (del.length && !isAdmin) return err("forbidden", 403);
    const ok = new Set(roster.members.filter((m) => activeOn(m, d)).map((m) => m.id));
    const a = await getAtt(d);
    const set = new Set(a.present);
    add.forEach((i) => ok.has(i) && set.add(i));
    del.forEach((i) => set.delete(i));
    a.present = [...set];
    await store.setJSON("att:" + d, a);
    return json({ ok: true, date: d, present: a.present });
  }

  // ---- 길드전 고정 파티 ----
  // 내 역할 입력: 단원명부 닉네임으로 누구나 (돌격형 atk · 교란형 dis · 지원형 sup, 빈 값이면 지우기)
  if (act === "team.role") {
    const m = inRoster(b.nickname);
    if (!m || !m.id) return err(norm(b.nickname) ? "not_member" : "nickname");
    const r = String(b.role || "");
    if (r && !ROLES.includes(r)) return err("role");
    const team = await getTeam();
    if (!r) delete team.roles[m.id];
    else team.roles[m.id] = { r, ch: clip(b.ch, 40), at: Date.now() };
    team.at = Date.now();
    await store.setJSON("team", team);
    return json({ ok: true, ...(await teamView()), me: m.id });
  }
  // 불참 표시: 단원명부 닉네임으로 누구나 (이번 주·다음 주 토요일만)
  if (act === "team.abs") {
    const m = inRoster(b.nickname);
    if (!m || !m.id) return err(norm(b.nickname) ? "not_member" : "nickname");
    const d = clip(b.date, 10);
    if (!teamWeeks().includes(d)) return err("date");
    const a = await getAbs(d);
    const set = new Set(a.ids);
    b.on === false ? set.delete(m.id) : set.add(m.id);
    a.ids = [...set];
    await store.setJSON("abs:" + d, a);
    return json({ ok: true, ...(await teamView()), me: m.id });
  }
  // 파티 저장 (길마만): parties = [{ id, name, leader, members: [단원 id] }]
  if (act === "team.save") {
    if (!isAdmin) return err("forbidden", 403);
    const team = await getTeam();
    const size = Math.max(2, Math.min(8, parseInt(b.size, 10) || team.size || 4));
    const ok = new Set(roster.members.filter((m) => !m.to || m.to > lastSaturday()).map((m) => m.id));
    const used = new Set();
    const parties = (Array.isArray(b.parties) ? b.parties : []).slice(0, MAX_PARTIES).map((p, i) => {
      const members = (Array.isArray(p.members) ? p.members : []).map((x) => clip(x, 40)).filter((x) => ok.has(x) && !used.has(x) && used.add(x)).slice(0, size);
      const leader = members.includes(clip(p.leader, 40)) ? clip(p.leader, 40) : null;
      return { id: clip(p.id, 20) || uid("t"), name: clip(p.name, 20) || `${i + 1}파티`, leader, members };
    });
    team.size = size; team.parties = parties; team.at = Date.now();
    await store.setJSON("team", team);
    return json({ ok: true, ...(await teamView()) });
  }

  // ---- 단원명부 (길마만) ----
  if (act.startsWith("roster.")) {
    if (!isAdmin) return err("forbidden", 403);
    const ms = roster.members;
    if (act === "roster.add") {
      const names = (Array.isArray(b.names) ? b.names : []).map((n) => clip(n, 24)).filter(Boolean);
      const from = isSat(clip(b.from, 10)) ? clip(b.from, 10) : null;
      const added = [];
      for (const n of names) {
        const old = ms.find((m) => norm(m.name) === norm(n));
        if (old) { if (old.to) { delete old.to; if (from) old.from = from; added.push(old); } continue; } // 나갔던 단원 다시 들어옴
        if (ms.length >= MAX_ROSTER) break;
        const m = { id: uid("m"), name: n };
        if (from) m.from = from;
        ms.push(m); added.push(m);
      }
      await store.setJSON("roster", { members: ms, at: Date.now() });
      return json({ ok: true, roster: ms, added: added.length });
    }
    if (act === "roster.clear") {
      // 명부 전체 삭제 — 출석 기록도 같이 지워요 (주인 없는 기록이 되니까)
      const { blobs } = await store.list({ prefix: "att:" });
      await Promise.all(blobs.map((x) => store.delete(x.key)));
      await store.setJSON("roster", { members: [], at: Date.now() });
      return json({ ok: true, roster: [], cleared: blobs.length });
    }
    if (act === "roster.sync") {
      // 엑셀 명단과 똑같이: 없던 이름은 추가, 명단에 없는 현재 단원은 leave 주부터 나간 것으로
      const names = [...new Map((Array.isArray(b.names) ? b.names : []).map((n) => clip(n, 24)).filter(Boolean).map((n) => [norm(n), n])).values()];
      if (!names.length) return err("names");
      const from = isSat(clip(b.from, 10)) ? clip(b.from, 10) : null;
      const leave = isSat(clip(b.leave, 10)) ? clip(b.leave, 10) : lastSaturday();
      const want = new Set(names.map(norm));
      let added = 0, left = 0;
      for (const n of names) {
        const old = ms.find((m) => norm(m.name) === norm(n));
        if (old) { if (old.to) { delete old.to; if (from) old.from = from; added++; } continue; }
        if (ms.length >= MAX_ROSTER) break;
        const m = { id: uid("m"), name: n }; if (from) m.from = from; ms.push(m); added++;
      }
      for (const m of ms) if (!want.has(norm(m.name)) && (!m.to || m.to > leave) && (!m.from || m.from < leave)) { m.to = leave; left++; }
      await store.setJSON("roster", { members: ms, at: Date.now() });
      return json({ ok: true, roster: ms, added, left });
    }
    const id = clip(b.id, 40);
    const m = ms.find((x) => x.id === id);
    if (!m) return err("not_found", 404);
    if (act === "roster.rename") {
      const n = clip(b.name, 24);
      if (!n) return err("name");
      if (ms.some((x) => x.id !== id && norm(x.name) === norm(n))) return err("dup");
      m.name = n; // id가 그대로라 출석 기록은 그대로 이어져요
    } else if (act === "roster.period") {
      const f = clip(b.from, 10), t = clip(b.to, 10);
      if ((f && !isSat(f)) || (t && !isSat(t)) || (f && t && t <= f)) return err("period");
      if (f) m.from = f; else delete m.from;
      if (t) m.to = t; else delete m.to;
    } else if (act === "roster.del") {
      roster.members = ms.filter((x) => x.id !== id);
    } else return err("action");
    await store.setJSON("roster", { members: roster.members, at: Date.now() });
    return json({ ok: true, roster: roster.members });
  }

  return err("action");
};

export const config = { path: "/api/guild" };
