# 추천 장비 동기화 도우미 — GameWith·game8 추천 세트를 받아 한국어 방어구 이름으로 바꾸고, 시뮬 데이터로 스킬을 계산해 사이트 D.builds와 비교해요.
# usage: python3 tools/gear_sync.py [작업폴더]   (gamewith.jp·game8.jp는 허용 도메인이라 curl로 받아져요)
# 출력: match = 사이트에 이미 있는 세트 라벨 / NEW = 새 세트 / MISSING IN SIM = 시뮬 데이터에 없는 방어구(건너뛰고 보고)
import os,re,sys,json,subprocess
from bs4 import BeautifulSoup
D=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','src','data.json')))
A={a[0]:a for a in D['sim']['armor']};SETS=D['sim']['sets']
SER={'アロイ':'얼로이','インゴット':'잉곳','ウルムー':'우르무','オウビート':'킹비트','キングビート':'킹비트','カガチ':'카가치','ギルオス':'기르오스','クルル':'쿠루루','ジャナフ':'쟈나프','ディアネロ':'디아네로','ジュラ':'쥬라','タロス':'타로스','ツィツィ':'치치','チチ':'치치','ディアブロ':'디아블로','ハイメタル':'하이메탈','ハイメタ':'하이메탈','バルキン':'발킨','プケプケ':'푸케푸케','ボーン':'본','ランゴ':'랑고','リオハート':'리오하트','レウス':'레우스','レザー':'레더','チェイン':'체인','チェーン':'체인','ガロン':'가론','ギエナ':'기에나','ジャグラス':'쟈그라스','レイア':'레이아','ボロス':'보로스','パピメル':'파피메르','冒険者':'모험가','冒険団':'모험단'}
PART={'ヘルム':'헬름','メイル':'메일','アーム':'암','コイル':'코일','グリーヴ':'그리브','パンツ':'팬츠','ペット':'페트','ヘッド':'헤드','ベスト':'베스트','グラブ':'글러브','ベルト':'벨트','テスタ':'테스타','マーノ':'마노','アンカ':'앙카','ガンバ':'감바'}
FIX={'エアルダの守護':'에알다의 수호','エアルダの誓約':'에알다의 서약','エアルダの誠実':'에알다의 성실','エアルダの信念':'에알다의 신념','エアルダの審判':'에알다의 심판'}
def armor(j):
    j=re.sub(r'[ⅠⅡⅢⅣⅤⅥ]+$','',j).strip()  # Ⅵ(레어 13)도 떼고 계산 — sim diff로 레벨 차이 확인
    if j in FIX: return FIX[j]
    pre=''
    if j.startswith('融光種'): pre='융광종 '; j=j[3:]
    for s in sorted(SER,key=len,reverse=True):
        if j.startswith(s):
            rest=j[len(s):]
            if rest in PART: return pre+SER[s]+PART[rest]
    return None
SK={'のけぞり軽減':'움츠리기 경감','みなぎるエナジー':'샘솟는 에너지','アイテム専門家':'아이템 전문가','ガードテクニック':'가드 테크닉','ポテンシャル解放':'잠재능력 해방','リロード強化':'장전 강화','一撃貫通':'일격 관통','会心撃【属性】':'회심격【속성】','体力ループ':'체력 루프','体力回復':'체력 회복','体力強化':'체력 강화','制圧回復':'제압 회복','剛勢':'굳센 자세','加護':'가호','咆哮耐性':'포효 내성','回避強化':'회피 강화','壁登りの達人':'벽 오르기의 달인','威嚇':'위협','威圧':'위압','弁当好き':'도시락 애호가','弱点攻撃':'약점 공격','弱点追撃':'약점 추격','弾導強化':'탄도 강화','復活':'부활','徹底追撃':'집요한 추격','怖いもの無し':'두려움 없는 자','抜刀一閃':'발도일섬','振動耐性':'진동 내성','早食い術':'빨리 먹기술','本気':'진심','毒耐性':'독 내성','気力変換':'기력 변환','気絶耐性':'기절 내성','洞察':'통찰','溜め強化':'모으기 강화','溜め強射':'모으기 강사','無垢':'무구','狩人の第六感':'사냥꾼의 육감','環境の活用':'환경 활용','睡眠耐性':'수면 내성','破壊王':'파괴왕','破砕':'파쇄','融光感知':'융광 감지','裂傷耐性':'열상 내성','貫突':'꿰뚫기','逆境':'역경','連撃強化':'연격 강화','闘志':'투지','防御力DOWN耐性':'방어력 DOWN 내성','防御反撃':'방어 반격','防護':'방호','風圧耐性':'풍압 내성','鬼人の修羅':'귀인의 수라','麻痺耐性':'마비 내성','練気をまとう刃':'연기를 띤 칼날','練気まとう刃':'연기를 띤 칼날','爆破耐性':'폭파 내성','節約術':'절약술','体術':'체술','ジャストガード':'고압 가드','高圧ガード':'고압 가드','バリスタ弾強化':'발리스타탄 강화','弩弾強化':'발리스타탄 강화','変形強化':'변형 강화','練気をまといし刃':'연기를 띤 칼날','植物専門家':'식생 전문가','地質専門家':'지질 전문가','採集名人':'채집 명인','チャージ準備':'축적 준비','威震':'위압','弓スキル強化':'활 스킬 강화','滞空':'체공','オトモ強化':'동반자 강화','泥耐性':'진흙 내성','標本の達人':'표본의 달인','捕獲の達人':'포획의 달인','不屈の意志':'불굴의 의지','融光活性':'융광 활성'}
EL={'火':'불','水':'물','氷':'얼음','雷':'번개','龍':'용'}
def skill(j):
    if j in SK: return SK[j]
    m=re.match(r'^(.)属性ダメージUP$',j)
    if m: return EL[m.group(1)]+'속성 대미지 UP'
    m=re.match(r'^(.)耐性強化$',j)
    if m: return EL[m.group(1)]+' 내성 강화'
    return None
def gsum(names):
    t={};ser={};sets=[]
    for n in names:
        a=A.get(n)
        if not a: return None,None,n
        for s,l in a[5]: t[s]=t.get(s,0)+l
        ser[a[1]]=ser.get(a[1],0)+1
    for k,v in SETS.items():
        if ser.get(k,0)>=v[1]:
            t[v[2][0]]=t.get(v[2][0],0)+v[2][1]; sets.append(v[0])
    return sorted(t.items(),key=lambda x:-x[1]),sets,None

PARTS=['頭','胴','手','腰','脚']
def parse(path):
    t=BeautifulSoup(open(path).read(),'html.parser').get_text('\n',strip=True).split('\n')
    out=[];i=0
    while i<len(t):
        if t[i]=='防具' and i+10<len(t) and t[i+1]=='頭':
            arm=[t[i+2+2*k] for k in range(5)] if [t[i+1+2*k] for k in range(5)]==PARTS else None
            j=i+11
            # find preceding weapon & tab label
            k=i
            while k>0 and t[k]!='武器': k-=1
            wpn=t[k+1] if k>0 else ''
            sk=[];sets=[]
            if j<len(t) and t[j]=='発動スキル':
                j+=1
                while j<len(t):
                    if j+1<len(t) and t[j+1]=='(セット)': sets.append(t[j]); j+=2; continue
                    if j+1<len(t) and re.match(r'^Lv\d+$',t[j+1]): sk.append((t[j],int(t[j+1][2:]))); j+=2; continue
                    break
            # context text after block (heading)
            ctx=' / '.join(t[j:j+3])
            out.append(dict(weapon=wpn,armor=arm,skills=sk,sets=sets,after=ctx,pos=i))
            i=j
        else: i+=1
    return out,t

def parse_g8(path):
    t=BeautifulSoup(open(path).read(),'html.parser').get_text('\n',strip=True).split('\n')
    out=[];i=0
    while i<len(t)-12:
        if t[i]=='頭' and t[i+2]=='胴' and t[i+4]=='腕' and t[i+6]=='腰' and t[i+8]=='脚':
            k=i
            while k>0 and not ('おすすめ装備' in t[k] and ('（' in t[k] or '(' in t[k])) and i-k<40: k-=1
            head=t[k] if i-k<40 else '?'
            arm=[t[i+1],t[i+3],t[i+5],t[i+7],t[i+9]]
            j=i+10; sets=[];sk=[]
            if t[j]=='セットスキル':
                j+=1
                while t[j]!='発動スキル' and j<i+20:
                    if t[j]!='-': sets.append(t[j])
                    j+=1
            if t[j]=='発動スキル':
                j+=1
                while j+1<len(t) and re.match(r'^Lv\.?\d+$',t[j+1]): sk.append((t[j],int(re.sub(r'\D','',t[j+1])))); j+=2
            out.append(dict(head=head,armor=arm,skills=sk,sets=sets))
            i=j
        else: i+=1
    return out

GW_ADV={'577455':'류노스케','577456':'브릭스','577458':'아케니아','577459':'케레스','577460':'엔쇼우','577461':'루카','577462':'폴리오','577463':'라야','577464':'매들린','577465':'미도리','561564':'페페','583506':'로드','586524':'프레야','588284':'스티리아'}
G8_ADV={'784183':'미도리','784185':'페페','784186':'케레스','784187':'루카','784188':'엔쇼우','784189':'아케니아','784190':'매들린','784193':'라야','784194':'폴리오','808772':'브릭스','808773':'류노스케','833427':'로드'}
HERO_ORDER=[('헤비보우건',6),('대검',6),('태도',6),('쌍검',6),('랜스',6),('활',6),('차지액스',6),('해머',6)]  # 11/23 20시: 차지액스에도 対通常種(범용) 세트가 생겼어요
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'
def get(url,out):
    subprocess.run(['curl','-s','-A',UA,url,'-o',out],check=False); return out
def cur_sets(b):
    return [('MAIN',b.get('lsrc'),b.get('label'),[a[1] for a in b['armor']])]+[(a['src'],a['src'],a['label'],[x[1] for x in a['armor']]) for a in b.get('alts',[])]
def show(tag,arm_jp,sk_jp,cur):
    kr=[armor(a) for a in arm_jp]
    jsk=[(skill(s) or '?'+s,l) for s,l in sk_jp]
    m=[c[2] for c in cur if c[3]==kr]
    if None in kr: print('  ',tag,'UNMAPPED',arm_jp); return
    sk,sets,miss=gsum(kr)
    diff=('MISSING IN SIM: '+miss) if miss else [(s,l,dict(sk).get(s)) for s,l in jsk if dict(sk).get(s)!=l][:5]
    print('  ',tag,'| match:' ,m or 'NEW', '|',kr,'| top:',jsk[:3],'| sim diff:',diff)
if __name__=='__main__':
    out=sys.argv[1] if len(sys.argv)>1 else '/tmp/gear_sync'; os.makedirs(out,exist_ok=True)
    B={b['name']:b for b in D['builds'] if b.get('group')=='adv'}
    for id,n in GW_ADV.items():
        f=get(f'https://gamewith.jp/mhoutlanders/{id}',f'{out}/gw_{id}.html'); s=open(f).read()
        i=s.find('最終更新'); up=re.sub(r'<[^>]+>|\s+',' ',s[i:i+120])[:32]
        o,t=parse(f); hi=[k for k,l in enumerate(t) if l.endswith('のおすすめ最強装備')]
        print('== GameWith',n,id,up,'tabs:',t[hi[0]+1:hi[0]+5] if hi else '')
        for x in o: show('GW',x['armor'],x['skills'],cur_sets(B[n]) if n in B else [])
    for id,n in G8_ADV.items():
        f=get(f'https://game8.jp/mhoutlanders/{id}',f'{out}/g8_{id}.html'); m=re.search(r'dateModified":"([^"]+)',open(f).read())
        print('== game8',n,id,m.group(1) if m else '')
        for x in parse_g8(f): show('g8 '+x['head'][:14],x['armor'],x['skills'],cur_sets(B[n]) if n in B else [])
    H={(b['type'],b['elem']):b for b in D['builds'] if b.get('group')=='hero'}
    for pid in ['559642']:
        f=get(f'https://gamewith.jp/mhoutlanders/{pid}',f'{out}/gw_{pid}.html'); s=open(f).read(); i=s.find('最終更新')
        print('== GameWith 주인공',pid,re.sub(r'<[^>]+>|\s+',' ',s[i:i+120])[:32])
        o,t=parse(f); seq=[(w,e) for w,n in HERO_ORDER for e in (['범용','불','번개','물','얼음','용'] if n==6 else ['불','번개','물','얼음','용'])]
        if len(seq)!=len(o): print('  !! 세트 수가 달라요',len(o),'→ 순서 매핑을 다시 확인하세요')
        for (w,e),x in zip(seq,o):
            cur=[]
            for (tw,te),b in H.items():
                if tw==w: cur+=[c for c in cur_sets(b) if te==e or e=='범용']
            show(f'{w} {e}',x['armor'],x['skills'],cur)
