const {chromium}=require('playwright');const fs=require('fs');
const S=process.argv[2], scale=+(process.argv[3]||1), out=process.argv[4]||S+'/shots';
const KEY=fs.readFileSync(S+'/kma.key','utf8').trim();
const WWW='/home/user/today-weather/app/src/main/assets/www/index.html';
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:scale});
const p=await ctx.newPage();p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('CONSOLE',m.text())});p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.exposeFunction('__nodeGet',async(url,h)=>{for(let i=0;i<3;i++){try{const ac=new AbortController();const t=setTimeout(()=>ac.abort(),15000);const r=await fetch(url,{headers:JSON.parse(h||'{}'),signal:ac.signal});clearTimeout(t);const body=await r.text();return {ok:r.ok,data:{status:r.status,body}}}catch(e){if(i==2)return {ok:false,data:{status:0,error:String(e)}}}}});
await p.addInitScript(k=>{window.NativeApi={kmaKey:()=>k,appVersion:()=>'1.0.0',httpGet:(id,u,h)=>window.__nodeGet(u,h).then(r=>App.nativeCb(id,r)),
getLocation:id=>setTimeout(()=>App.nativeCb(id,{ok:true,data:{lat:37.5636,lon:126.9834}}),100),
reverseGeocode:(id)=>setTimeout(()=>App.nativeCb(id,{ok:true,data:{line:'대한민국 서울특별시 중구 명동 54',admin:'서울특별시'}}),50),
geocode:(id,q)=>setTimeout(()=>App.nativeCb(id,{ok:true,data:{items:[{line:'대한민국 부산광역시 해운대구 우동',admin:'부산광역시',lat:35.1631,lon:129.1636,country:'KR'},{line:'대한민국 부산광역시 해운대구 중동',admin:'부산광역시',lat:35.1630,lon:129.1700,country:'KR'}]}}),200),
openUrl(){},exitApp(){},openAppSettings(){},hasLocationPermission:()=>true};
localStorage.setItem('saved',JSON.stringify([{name:'경기 성남시 분당구',sub:'정자동',lat:37.3595,lon:127.1052},{name:'제주 제주시',sub:'연동',lat:33.4890,lon:126.4983},{name:'강원 강릉시',sub:'교동',lat:37.7637,lon:128.8995}]));
},KEY);
await p.goto('file://'+WWW);await p.waitForTimeout(9000);
const shot=async n=>{await p.waitForTimeout(800);await p.screenshot({path:out+'/'+n+'.png'})};
await shot('01-home');
await p.click('[data-act=hday][data-v="1"]');await shot('01b-home-tomorrow');await p.click('[data-act=hday][data-v="0"]');
await p.click('nav [data-s=week]');await shot('02-week');
await p.click('[data-k=metno]');await p.waitForTimeout(1500);await shot('02b-week-metno');
await p.click('nav [data-s=cmp]');await shot('03-compare-today');
await p.click('[data-v=tomorrow]');await shot('03b-compare-tomorrow');
await p.click('[data-v=week]');await shot('03c-compare-week');
await p.click('nav [data-s=region]');await p.waitForTimeout(1500);await shot('04-region');
await p.fill('#q','해운대');await p.waitForTimeout(1200);await shot('04b-region-search');
await p.click('nav [data-s=home]');await p.click('[data-k=ecmwf]');await p.waitForTimeout(800);await shot('05-home-ecmwf');
await p.evaluate(()=>App.onBack());await shot('06-exit');
const st=await p.evaluate(()=>{const o={};for(const [k,v] of Object.entries(App.st.data)){o[k]={};for(const [s,x] of Object.entries(v))o[k][s]=x.status+(x.err?':'+x.err:'')}return o});console.log(JSON.stringify(st));
await b.close()})();
