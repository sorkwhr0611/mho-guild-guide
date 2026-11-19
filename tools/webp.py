# src/img/*.jpg 마다 같은 이름의 .webp 를 만들어요 (화면에는 webp, 카톡 미리보기엔 jpg).
# 새 사진을 넣은 뒤 `python3 tools/webp.py` 를 돌리면 없는 것만 만들어요.
import os, sys
from PIL import Image
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "img")
n = 0; before = after = 0
for f in sorted(os.listdir(d)):
    if not f.endswith(".jpg"): continue
    src = os.path.join(d, f); dst = src[:-4] + ".webp"
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src): continue
    im = Image.open(src).convert("RGB")
    im.save(dst, "WEBP", quality=72, method=6)
    before += os.path.getsize(src); after += os.path.getsize(dst); n += 1
print(f"webp {n}장 만들었어요" + (f" ({before//1024}KB → {after//1024}KB)" if n else ""))
