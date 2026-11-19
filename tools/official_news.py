#!/usr/bin/env python3
"""공식 사이트(글로벌판) 공지 목록·본문 가져오기.
monsterhunteroutlanders.com 의 뉴스는 playerinfinite.com CMS에서 불러와요 (game id 30075, area global).
글로벌 서버 기준이라 한국 서버와 날짜·쿠폰이 다를 수 있어요 → 한국 적용 여부는 디시·게임 안 공지로 확인.

사용법:
  python3 tools/official_news.py            # 최근 공지 12개 (영어) 목록
  python3 tools/official_news.py ja 20      # 일본어 20개
  python3 tools/official_news.py en 5 full  # 본문까지
"""
import json, sys, datetime, urllib.request

API = "https://sg-community.playerinfinite.com/api/gpts.information_feeds_svr.InformationFeedsSvr/"

def post(path, lang, body):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), method="POST", headers={
        "Content-Type": "application/json;charset=utf-8", "X-Language": lang, "X-GameId": "30075",
        "X-AreaId": "global", "X-Source": "pc_web", "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)

def main():
    lang = sys.argv[1] if len(sys.argv) > 1 else "en"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    full = len(sys.argv) > 3
    d = post("GetContentByLabel", lang, {"language": [lang], "gameid": "30075", "offset": 0, "get_num": n,
                                        "primary_label_id": 0, "secondary_label_id": 0, "use_default_language": False})
    for x in d.get("data", {}).get("info_content", []):
        t = datetime.datetime.fromtimestamp(int(x["pub_timestamp"]) + 9 * 3600, datetime.timezone.utc).strftime("%Y-%m-%d %H:%M KST")
        print(f"## {t} · {x['title']} · id={x['content_id']}")
        if full:
            try:
                det = post("GetContentInfoById", lang, {"content_id": x["content_id"], "language": [lang], "gameid": "30075"})
                info = det.get("data", {}).get("info_content") or det.get("data", {})
                txt = (info.get("content") if isinstance(info, dict) else "") or x.get("content_part", "")
            except Exception:
                txt = x.get("content_part", "")
            import re, html
            txt = html.unescape(re.sub(r"<[^>]+>", "\n", txt))
            lines = [l.strip() for l in txt.splitlines() if l.strip() and not l.strip().startswith("@") and "{" not in l and "}" not in l]
            print("\n".join(lines)[:6000])
            print()

if __name__ == "__main__":
    main()
