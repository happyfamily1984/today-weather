const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:400,height:400}});
await p.goto('file:///home/user/today-weather/app/src/main/assets/www/index.html');await p.waitForTimeout(500);
const list={wx_clear:[0,false],wx_clear_night:[0,true],wx_partly:[2,false],wx_partly_night:[2,true],wx_cloud:[3,false],wx_drizzle:[51,false],wx_rain:[63,false],wx_snow:[73,false],wx_sleet:[66,false],wx_storm:[95,false]};
for(const [n,[c,night]] of Object.entries(list)){
 await p.setContent('<html><body style="margin:0;background:transparent">'+await p.evaluate(([c,n])=>Icons.weather(c,192,n),[c,night])+'</body></html>');
 await p.locator('svg').screenshot({path:process.argv[2]+'/'+n+'.png',omitBackground:true});}
// 장식 구름
await p.setContent(`<html><body style="margin:0;background:transparent"><div id="d" style="width:240px;height:120px;position:relative;filter:blur(1.5px)">
<div style="position:absolute;left:60px;top:40px;width:90px;height:70px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff,rgba(255,255,255,.75))"></div>
<div style="position:absolute;left:120px;top:20px;width:110px;height:95px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff,rgba(255,255,255,.75))"></div>
<div style="position:absolute;left:20px;top:70px;width:220px;height:60px;border-radius:30px;background:rgba(255,255,255,.85)"></div></div></body></html>`);
await p.locator('#d').screenshot({path:process.argv[2]+'/w_deco_cloud.png',omitBackground:true});
await b.close()})();
