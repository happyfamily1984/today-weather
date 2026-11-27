const {chromium}=require('playwright');const fs=require('fs');const S=process.argv[2];
const KEY=fs.readFileSync(S+'/kma.key','utf8').trim();
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:844,height:1000},deviceScaleFactor:2});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.exposeFunction('__nodeGet',async(url,h)=>{for(let i=0;i<3;i++){try{const ac=new AbortController();const t=setTimeout(()=>ac.abort(),15000);const r=await fetch(url,{headers:JSON.parse(h||'{}'),signal:ac.signal});clearTimeout(t);return {ok:r.ok,data:{status:r.status,body:await r.text()}}}catch(e){if(i==2)return {ok:false,data:{status:0}}}}});
await p.addInitScript(k=>{window.App={nativeCb:(id,r)=>U.nativeCb(id,r)};window.NativeApi={kmaKey:()=>k,httpGet:(id,u,h)=>window.__nodeGet(u,h).then(r=>U.nativeCb(id,r))}},KEY);
await p.goto('file://'+S+'/widget/w.html');await p.waitForFunction(()=>window.done,null,{timeout:90000});await p.waitForTimeout(500);
await p.screenshot({path:S+'/widget/widgets.png',fullPage:true});await b.close()})();
