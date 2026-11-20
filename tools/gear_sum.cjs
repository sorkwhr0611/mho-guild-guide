// 장비 5부위의 스킬 합계(세트 효과 포함)를 사이트 시뮬 데이터로 계산해요 — 추천 장비 검증용
// usage: node tools/gear_sum.cjs "머리" "몸통" "팔" "허리" "다리"
const D=require('../src/data.json');const A=D.sim.armor.map(a=>({name:a[0],series:a[1],skills:a[5]})),S=D.sim.sets;
const names=process.argv.slice(2);const t={};const ser={};
for(const n of names){const a=A.find(x=>x.name===n);if(!a){console.log('MISSING',n);continue;}a.skills.forEach(([s,l])=>t[s]=(t[s]||0)+l);ser[a.series]=(ser[a.series]||0)+1;}
for(const [k,v] of Object.entries(S)){if((ser[k]||0)>=v[1]){t[v[2][0]]=(t[v[2][0]]||0)+v[2][1];t['[세트] '+v[0]]=1;}}
console.log(JSON.stringify(Object.fromEntries(Object.entries(t).sort((a,b)=>b[1]-a[1]))));
