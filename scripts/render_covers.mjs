#!/usr/bin/env node
// Deterministic template rendering. No image-generation API, font fallback or CTR score.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const skillRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require=createRequire(import.meta.url);
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const json=object=>JSON.stringify(object).replaceAll('<','\\u003c');
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function args(){
 const result={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];if(!['--request','--brand','--out-dir','--modules','--signature'].includes(key)||value===undefined||(key!=='--signature'&&!value)||value.startsWith('--'))throw Error('Usage: node scripts/render_covers.mjs --request <json> --brand <json> --out-dir <new-dir> [--modules <node_modules>] [--signature <brand-name-or-empty>]');result[key.slice(2)]=value}
 for(const key of ['request','brand','out-dir'])if(!result[key])throw Error('Missing --'+key);return result;
}
function validate(brand,request){
 if(brand.schemaVersion!==1||request.schemaVersion!==1)throw Error('Unsupported schemaVersion');
 for(const key of ['bg','ink','accent','marker','muted','surface'])if(!/^#[0-9a-f]{6}$/i.test(brand.palette?.[key]||''))throw Error('Invalid palette.'+key);
 if(typeof brand.signature!=='string'||!brand.font?.file||!/^([0-9a-f]{64})$/.test(brand.font.sha256||''))throw Error('Brand requires signature and a font file with SHA-256');
 if(/[\r\n\u2028\u2029]/.test(brand.signature))throw Error('Brand signature must be a single line');
 if(!Array.isArray(request.candidates)||request.candidates.length<1||request.candidates.length>6)throw Error('Use 1–6 candidates');
 const ids=new Set();
 for(const c of request.candidates){
  if(!/^[a-z0-9-]{1,40}$/.test(c.id)||ids.has(c.id))throw Error('Invalid or duplicate candidate id');ids.add(c.id);
  if(!Array.isArray(c.headline)||c.headline.length!==2||c.headline.some(s=>typeof s!=='string'||!s.trim()||s.length>24))throw Error(c.id+': provide two nonempty headline lines');
  for(const key of ['category','subhead','reason','asset'])if(typeof c[key]!=='string'||!c[key].trim())throw Error(c.id+': missing '+key);
  if(!['object','window','people'].includes(c.layout))throw Error(c.id+': unsupported layout');
  if(c.layout==='window'&&!c.domain)throw Error(c.id+': window requires domain');
 }
 if(request.recommendedId&&!ids.has(request.recommendedId))throw Error('Unknown recommendedId');
 for(const [id,expected] of Object.entries({'4x3':[1600,1200],'3x4':[1200,1600]})){
  const f=brand.formats?.[id];if(!f||f.width!==expected[0]||f.height!==expected[1])throw Error('Expected '+id+' canvas '+expected.join('x'));
  for(const key of ['headlineSize','subheadSize','metaSize','safeMargin'])if(!Number.isFinite(f[key])||f[key]<=0)throw Error('Invalid '+id+'.'+key);
  for(const name of ['category','copy','hero','signature'])for(const key of ['left','top','width','height'])if(!Number.isFinite(f[name]?.[key])||f[name][key]<0)throw Error('Invalid '+id+'.'+name+'.'+key);
  for(const key of ['emphasisSize','signatureSize','headlineLeading','copyGap'])if(f[key]!==undefined&&(!Number.isFinite(f[key])||f[key]<=0))throw Error('Invalid '+id+'.'+key);
  for(const name of ['secondaryHero','arrow']){if(request.candidates.some(c=>c.secondaryAsset)&&!f.secondaryHero)throw Error('Secondary artwork requires a secondaryHero region');if(f[name])for(const key of ['left','top','width','height'])if(!Number.isFinite(f[name][key])||f[name][key]<0)throw Error('Invalid '+id+'.'+name+'.'+key)}
 }
}
async function localAsset(base,relative){
 if(typeof relative!=='string'||/^[a-z][a-z0-9+.-]*:/i.test(relative))throw Error('Only local assets are accepted');
 return fs.readFile(path.resolve(base,relative));
}
function standardPage(request,brand){
 const c=request.candidates[0];
 const pair=[['4x3','4:3 横版 · 1600×1200'],['3x4','3:4 竖版 · 1200×1600']].map(([ratio,label])=>`<article class="${ratio==='4x3'?'landscape':'portrait'}"><h2>${label}</h2><div class="picture"><img src="${escape(c.id)}/cover-${ratio}.png" alt="${escape(c.headline.join('，'))}"><span class="duration">${escape(request.durationLabel||'00:00')}</span></div><a class="download" href="${escape(c.id)}/cover-${ratio}.png" download>下载这一版</a></article>`).join('');
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>标准封面 · 横竖双版</title><style>
 @font-face{font-family:CoverSans;src:url("assets/font.woff2");font-weight:100 900;font-display:block}*{box-sizing:border-box}body{margin:0;background:#f4f2eb;color:#1a1a2e;font-family:CoverSans,sans-serif}main{max-width:1400px;margin:auto;padding:40px 28px}h1{font-size:30px;margin:0 0 12px}.intro{color:#62626d;margin:0 0 24px;line-height:1.7}.controls{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:26px}button,a{font:inherit}button{cursor:pointer;min-height:44px;border:1px solid #dad8d0;background:white;border-radius:6px;padding:10px 16px}button[aria-pressed=true]{background:#1a1a2e;color:white}.board{display:grid;grid-template-columns:1.7fr 1fr;gap:24px;align-items:start}article{min-width:0;background:#fffdf7;border:1px solid #ddd9ce;border-radius:8px;padding:18px}h2{font-size:14px;margin:0 0 16px}.picture{position:relative;background:#fefcf6}.picture img{width:100%;height:auto;display:block}.download{display:inline-block;color:#2b7fd8;margin-top:18px;font-size:14px}.duration{display:none;position:absolute;bottom:5px;right:5px;background:#333b;color:white;font-size:11px;padding:2px 4px}.tiny .picture{margin:auto}.tiny .landscape .picture{width:240px}.tiny .portrait .picture{width:180px}.gray img{filter:grayscale(1)}.show-duration .duration{display:block}.status{font-size:13px;color:#62626d;line-height:1.7;margin-top:24px}footer{font-size:12px;line-height:1.8;color:#62626d;margin-top:28px;padding-top:24px;border-top:1px solid #ddd9ce}@media(max-width:900px){.board{grid-template-columns:1fr}main{padding:24px 18px}.portrait .picture{max-width:440px;margin:auto}}
 </style></head><body><main><h1>标准封面 · 横竖双版</h1><p class="intro">沿用选定的视觉参考，固定字体、配色、字号层级与布局。横竖两版分别排版。</p><div class="controls"><button id="size" aria-pressed="false">缩略尺寸</button><button id="gray" aria-pressed="false">灰度检查</button><button id="duration" aria-pressed="false">时长遮挡模拟</button><button id="approve" aria-pressed="false">标记本版可用</button><button id="download-selection" disabled>下载确认记录</button></div><section class="board">${pair}</section><p class="status" aria-live="polite">当前为按参考制作的标准效果稿；不会自动发布。</p><footer>暖白底、墨色标题、蓝色重点、单处黄色强调。字体为本地思源黑体 Heavy / Medium，横竖字号分别写入品牌配置。<br>下载文件不含这个页面、按钮或模拟时长。</footer></main><script>
 let selection=null;
 for(const [id,cls] of [['size','tiny'],['gray','gray'],['duration','show-duration']])document.querySelector('#'+id).onclick=function(){this.setAttribute('aria-pressed',String(document.body.classList.toggle(cls)))};
 document.querySelector('#approve').onclick=function(){selection={candidateId:${json(c.id)},status:'user-selected-in-review',timestamp:new Date().toISOString(),note:'Visual confirmation only; no publishing authorization'};this.setAttribute('aria-pressed','true');document.querySelector('#download-selection').disabled=false;document.querySelector('.status').textContent='已标记本版可用，可以下载确认记录；未执行发布。'};
 document.querySelector('#download-selection').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(selection,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='selection.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 </script></body></html>`;
}
function reviewPage(request,brand){
 if(request.candidates.length===1)return standardPage(request,brand);
 const cards=request.candidates.map(c=>`<article data-id="${escape(c.id)}"><div class="label"><b>${escape(c.name||c.id)}</b>${c.id===request.recommendedId?'<em>编辑主推</em>':''}</div><div class="picture"><img src="${escape(c.id)}/cover-3x4.png" alt="${escape(c.headline.join('，'))}"><span class="duration">${escape(request.durationLabel||"00:00")}</span></div><p>${escape(c.reason)}</p><div class="links"><a href="${escape(c.id)}/cover-4x3.png" download>下载横版</a><a href="${escape(c.id)}/cover-3x4.png" download>下载竖版</a></div><button class="choose" aria-pressed="false" data-id="${escape(c.id)}">选择这一方向</button></article>`).join('');
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>封面定稿比较</title><style>
 @font-face{font-family:CoverSans;src:url("assets/font.woff2");font-weight:100 900;font-display:block}*{box-sizing:border-box}body{margin:0;background:#f4f2eb;color:#1a1a2e;font-family:CoverSans,sans-serif}main{max-width:1200px;margin:auto;padding:48px 32px}h1{font-size:32px;margin:0 0 12px}header p{color:#62626d;margin:0 0 28px;line-height:1.7}.controls{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:28px}button,a{font:inherit}button{cursor:pointer;padding:10px 16px;border:1px solid #dad8d0;border-radius:6px;background:white;min-height:44px}button[aria-pressed=true]{background:#1a1a2e;color:white}.board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;align-items:start}article{min-width:0;background:#fffdf7;padding:20px;border:1px solid #ddd9ce;border-radius:8px}.label{display:flex;gap:12px;align-items:center;margin-bottom:16px;font-size:15px}em{font-style:normal;font-size:11px;color:#2b7fd8}.picture{position:relative;margin:auto;width:100%;aspect-ratio:3/4;background:#fefcf6}.picture img{width:100%;height:100%;display:block}.duration{display:none;position:absolute;bottom:5px;right:5px;font-size:11px;color:white;background:#333b;padding:2px 4px}article p{font-size:13px;line-height:1.8;color:#62626d;min-height:70px}.links{display:flex;gap:16px;font-size:12px;margin-bottom:15px}.links a{color:#2b7fd8}.choose{width:100%}.selected{border-color:#2b7fd8}.selected .choose{background:#2b7fd8;color:white}.status{margin-top:24px;font-size:13px;color:#62626d}.tiny .picture{width:180px;height:240px}.landscape .picture{aspect-ratio:4/3}.tiny.landscape .picture{width:240px;height:180px}.gray img{filter:grayscale(1)}.show-duration .duration{display:block}footer{padding-top:32px;border-top:1px solid #ddd9ce;margin-top:40px;font-size:12px;color:#62626d;line-height:1.8}@media(max-width:900px){.board{grid-template-columns:1fr}.picture{max-width:360px}main{padding:28px 20px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
 </style></head><body><main><header><h1>先选看点，再定封面</h1><p>同一视频的${request.candidates.length}个创意方向。固定字体与版式，比较你更愿意点击哪一张。这里是候选比较，不是真实账号主页。</p></header><div class="controls"><button id="ratio" aria-pressed="false">切换到 4:3</button><button id="size" aria-pressed="false">缩略尺寸</button><button id="gray" aria-pressed="false">灰度检查</button><button id="duration" aria-pressed="false">时长遮挡模拟</button><button id="download-selection" disabled>下载选择记录</button></div><section class="board">${cards}</section><p class="status" aria-live="polite">尚未选择；编辑主推不是你的最终确认。</p><footer>字体：思源黑体 · 主标题 ${brand.formats['3x4'].headlineSize}px · 颜色、字号、位置由同一品牌配置控制。<br>下载是纯封面文件，不含比较页面或时长叠层。图片为视频内容的概念插画，不是产品界面截图。</footer></main><script>
 const request=${json(request)};let ratio='3x4';let selection=null;
 function toggle(id,cls){document.querySelector('#'+id).onclick=function(){const active=document.body.classList.toggle(cls);this.setAttribute('aria-pressed',String(active));return active}}
 toggle('size','tiny');toggle('gray','gray');toggle('duration','show-duration');
 document.querySelector('#ratio').onclick=function(){ratio=ratio==='3x4'?'4x3':'3x4';document.body.classList.toggle('landscape',ratio==='4x3');this.textContent=ratio==='3x4'?'切换到 4:3':'切换到 3:4';this.setAttribute('aria-pressed',String(ratio==='4x3'));document.querySelectorAll('article').forEach(el=>el.querySelector('img').src=el.dataset.id+'/cover-'+ratio+'.png')};
 document.querySelectorAll('.choose').forEach(button=>button.onclick=()=>{selection={candidateId:button.dataset.id,status:'user-selected-in-review',timestamp:new Date().toISOString(),note:'Visual preference only; not approval to publish or CTR evidence'};document.querySelectorAll('article').forEach(el=>{const chosen=el.dataset.id===selection.candidateId;el.classList.toggle('selected',chosen);el.querySelector('.choose').setAttribute('aria-pressed',String(chosen))});document.querySelector('.status').textContent='已选择 '+selection.candidateId+'；可下载记录后交给后续制作。';document.querySelector('#download-selection').disabled=false});
 document.querySelector('#download-selection').onclick=()=>{const blob=new Blob([JSON.stringify(selection,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='selection.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
 </script></body></html>`;
}
async function main(){
 const opt=args();const requestPath=path.resolve(opt.request),brandPath=path.resolve(opt.brand),out=path.resolve(opt['out-dir']);
 const request=JSON.parse(await fs.readFile(requestPath,'utf8')),brand=JSON.parse(await fs.readFile(brandPath,'utf8'));
 // Per-run input overrides the example identity without modifying its source file.
 if(opt.signature!==undefined)brand.signature=opt.signature;
 validate(brand,request);brand.signature=brand.signature.trim();
 const font=await localAsset(path.dirname(brandPath),brand.font.file);if(hash(font)!==brand.font.sha256)throw Error('Font SHA-256 mismatch; do not silently substitute');
 const fontLicense=await localAsset(path.dirname(brandPath),brand.font.license);
 const template=await fs.readFile(path.join(skillRoot,'assets/cover-system/cover.html'),'utf8');
 const assets=[];for(const c of request.candidates){for(const field of ['asset','secondaryAsset']){if(!c[field])continue;const buffer=await localAsset(path.dirname(requestPath),c[field]);if(!/\.(png|jpe?g|webp)$/i.test(c[field]))throw Error('Expected PNG/JPEG/WebP artwork');assets.push({id:c.id,field,buffer,ext:path.extname(c[field]).toLowerCase()})}}
 let runtime;try{runtime=require('playwright')}catch{if(!opt.modules)throw Error('Playwright unavailable. Use existing runtime with --modules; no automatic dependency installation.');runtime=require(require.resolve('playwright',{paths:[path.resolve(opt.modules)]}))}
 // mkdir is deliberately exclusive. All inputs and dependencies are checked first.
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);await fs.mkdir(path.join(out,'assets'));
 await fs.writeFile(path.join(out,'assets/font.woff2'),font);
 await fs.writeFile(path.join(out,'assets/FONT-LICENSE.txt'),fontLicense);
 const runtimeRequest=structuredClone(request);const provenance={schemaVersion:1,status:'review',brandId:brand.id,signature:brand.signature,fontSha256:hash(font),templateSha256:hash(Buffer.from(template)),brandSha256:hash(Buffer.from(json(brand))),recommendedId:request.recommendedId||null,userSelectedId:null,candidates:[],checks:[]};
 for(const asset of assets){const filename=asset.id+(asset.field==='secondaryAsset'?'-secondary':'')+asset.ext;await fs.writeFile(path.join(out,'assets',filename),asset.buffer);const candidate=runtimeRequest.candidates.find(c=>c.id===asset.id);candidate[asset.field]='../assets/'+filename}
 for(const candidate of runtimeRequest.candidates){await fs.mkdir(path.join(out,candidate.id));provenance.candidates.push({id:candidate.id,assets:assets.filter(a=>a.id===candidate.id).map(a=>({role:a.field,sha256:hash(a.buffer)})),headline:candidate.headline,reason:candidate.reason});
  for(const [ratio,format] of Object.entries(brand.formats)){const html=template.replace('__FONT_URL__','../assets/font.woff2').replace('__COVER_DATA__',json({brand,candidate,format}));await fs.writeFile(path.join(out,candidate.id,'cover-'+ratio+'.html'),html)}
 }
 const packagedBrand=structuredClone(brand);packagedBrand.font.file='assets/font.woff2';packagedBrand.font.license='assets/FONT-LICENSE.txt';
 const packagedRequest=structuredClone(request);for(const c of packagedRequest.candidates){c.asset='assets/'+c.id+path.extname(c.asset).toLowerCase();if(c.secondaryAsset)c.secondaryAsset='assets/'+c.id+'-secondary'+path.extname(c.secondaryAsset).toLowerCase()}
 await fs.writeFile(path.join(out,'review.html'),reviewPage(request,brand));await fs.writeFile(path.join(out,'brand.json'),JSON.stringify(packagedBrand,null,2)+'\n');await fs.writeFile(path.join(out,'request.json'),JSON.stringify(packagedRequest,null,2)+'\n');
 const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(out,'.'+pathname);if(!file.startsWith(out+path.sep)){res.writeHead(403).end();return}const content=await fs.readFile(file);const type={'.html':'text/html; charset=utf-8','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type});res.end(content)}catch{res.writeHead(404).end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;let browser;
 try{browser=await runtime.chromium.launch({headless:true});provenance.browserVersion=browser.version();const page=await browser.newPage({deviceScaleFactor:1});const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  for(const candidate of request.candidates)for(const [ratio,format] of Object.entries(brand.formats)){await page.setViewportSize({width:format.width,height:format.height});await page.goto(origin+'/'+candidate.id+'/cover-'+ratio+'.html');await page.evaluate(()=>window.coverReady);const check=await page.evaluate(()=>window.inspectCover());provenance.checks.push({id:candidate.id,ratio,...check});if(check.errors.length)throw Error(candidate.id+'/'+ratio+': '+check.errors.join('; '));const png=await page.locator('#cover').screenshot({path:path.join(out,candidate.id,'cover-'+ratio+'.png')});check.imageSha256=hash(png);Object.assign(provenance.checks.at(-1),{imageSha256:check.imageSha256})}
  if(pageErrors.length)throw Error(pageErrors.join('; '));await page.setViewportSize({width:1200,height:1100});await page.goto(origin+'/review.html');await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));await page.locator('#size').click();await page.locator('.board').screenshot({path:path.join(out,'preview-grid.jpg'),type:'jpeg',quality:92});if(request.candidates.length>1){await page.locator('#ratio').click();await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));await page.locator('.board').screenshot({path:path.join(out,'preview-landscape.jpg'),type:'jpeg',quality:92})}
  provenance.renderPassed=true;console.log('Rendered '+request.candidates.length+' candidates × 2 ratios: '+out);
 }catch(error){provenance.renderPassed=false;provenance.failure=error.message;throw error}finally{await fs.writeFile(path.join(out,'render-report.json'),JSON.stringify(provenance,null,2)+'\n');if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
