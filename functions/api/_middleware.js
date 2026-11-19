// 서버 오류가 나면 Cloudflare 기본 오류 화면(1101) 대신 원인을 JSON으로 알려 줘요.
export async function onRequest(ctx) {
  try { return await ctx.next(); }
  catch (e) { return new Response(JSON.stringify({ error: "server", detail: String((e && e.message) || e) }), { status: 500, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
}
