#!/usr/bin/env node
// Integration checks; generated choices here are fixtures, never user approvals.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const moduleDir=process.argv[2]==='--modules'?process.argv[3]:null;
const require=createRequire(import.meta.url);
const runtime=moduleDir?require(require.resolve('playwright',{paths:[path.resolve(moduleDir)]})):require('playwright');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const temporary=path.join(root,'.tmp','cover-system-'+Date.now());
const example=path.join(root,'examples/cover-system/nature-museum');
const readJSON=async file=>JSON.parse(await fs.readFile(file,'utf8'));
async function writeJSON(name,data){const file=path.join(temporary,name);await fs.writeFile(file,JSON.stringify(data));return file}
function run(script,parameters,success=true){
 const result=spawnSync(process.execPath,[path.join(root,'scripts',script),...parameters],{encoding:'utf8',timeout:60000});
 assert.equal(result.status===0,success,result.stdout+result.stderr);return result;
}
async function main(){
 await fs.mkdir(temporary,{recursive:true});
 const brand=await readJSON(path.join(example,'brand-exploration-v2.json'));
 brand.font.file=path.resolve(example,brand.font.file);brand.font.license=path.resolve(example,brand.font.license);
 const request=await readJSON(path.join(example,'request-exploration-v2.json'));
 for(const c of request.candidates)c.asset=path.resolve(example,c.asset);
 const brandFile=await writeJSON('brand.json',brand),requestFile=await writeJSON('request.json',request);
 const review=path.join(temporary,'review');
 const render=(req,out,b=brandFile,success=true,extra=[])=>run('render_covers.mjs',['--request',req,'--brand',b,'--out-dir',out,...(moduleDir?['--modules',moduleDir]:[]),...extra],success);
 render(requestFile,review);const report=await readJSON(path.join(review,'render-report.json'));assert.equal(report.renderPassed,true);assert.equal(report.checks.length,6);
 for(const check of report.checks){const png=await fs.readFile(path.join(review,check.id,'cover-'+check.ratio+'.png'));assert.equal(sha(png),check.imageSha256);assert.equal(png.readUInt32BE(16),check.width);assert.equal(png.readUInt32BE(20),check.height);assert.equal(check.errors.length,0);assert.equal(check.headlineAngle,-2)}
 console.log('PASS: real example, six PNGs, exact dimensions, font and image fingerprints');
 const standardBrand=await readJSON(path.join(example,'brand.json'));standardBrand.font.file=path.resolve(example,standardBrand.font.file);standardBrand.font.license=path.resolve(example,standardBrand.font.license);
 const standardRequest=await readJSON(path.join(example,'request.json'));for(const c of standardRequest.candidates){c.asset=path.resolve(example,c.asset);if(c.secondaryAsset)c.secondaryAsset=path.resolve(example,c.secondaryAsset)}
 const standardRequestFile=await writeJSON('standard-request.json',standardRequest),standardBrandFile=await writeJSON('standard-brand.json',standardBrand);
 const standardReview=path.join(temporary,'standard');render(standardRequestFile,standardReview,standardBrandFile);
 const standardReport=await readJSON(path.join(standardReview,'render-report.json'));assert.equal(standardReport.renderPassed,true);assert.equal(standardReport.checks.length,2);assert.equal(standardReport.candidates[0].assets.length,2);assert.equal(standardReport.checks[0].signatureSize,26);
 for(const check of standardReport.checks)assert.equal(check.headlineAngle,-2);
 const collisionBrand=structuredClone(standardBrand);collisionBrand.formats['4x3'].hero={left:200,top:350,width:240,height:240};
 const collisionReview=path.join(temporary,'artwork-collision');render(standardRequestFile,collisionReview,await writeJSON('collision-brand.json',collisionBrand),false);
 assert.ok((await readJSON(path.join(collisionReview,'render-report.json'))).checks[0].errors.some(e=>e.includes('visible artwork overlaps text')));
 console.log('PASS: tilted title retains safe layout and still rejects real artwork collisions');
 const standardReplay=path.join(temporary,'standard-replay');render(path.join(standardReview,'request.json'),standardReplay,path.join(standardReview,'brand.json'));assert.deepEqual(standardReport.checks.map(c=>c.imageSha256),(await readJSON(path.join(standardReplay,'render-report.json'))).checks.map(c=>c.imageSha256));console.log('PASS: reference-based standard, two artwork layers, fixed per-ratio typography and replay');
 const customSignature='星河 & AI <实验室>',customReview=path.join(temporary,'custom-signature');
 render(standardRequestFile,customReview,standardBrandFile,true,['--signature',customSignature]);
 const customReport=await readJSON(path.join(customReview,'render-report.json'));
 assert.equal(customReport.signature,customSignature);assert.equal((await readJSON(path.join(customReview,'brand.json'))).signature,customSignature);
 assert.equal((await readJSON(standardBrandFile)).signature,standardBrand.signature);
 for(const check of customReport.checks){assert.equal(check.text.at(-1),customSignature);assert.equal(check.signatureSize,26);assert.notEqual(check.imageSha256,standardReport.checks.find(c=>c.ratio===check.ratio).imageSha256)}
 const customReplay=path.join(temporary,'custom-replay');render(path.join(customReview,'request.json'),customReplay,path.join(customReview,'brand.json'));
 assert.deepEqual(customReport.checks.map(c=>c.imageSha256),(await readJSON(path.join(customReplay,'render-report.json'))).checks.map(c=>c.imageSha256));
 const hiddenReview=path.join(temporary,'hidden-signature');render(standardRequestFile,hiddenReview,standardBrandFile,true,['--signature','']);
 assert.equal((await readJSON(path.join(hiddenReview,'brand.json'))).signature,'');
 const longSignature=path.join(temporary,'long-signature');render(standardRequestFile,longSignature,standardBrandFile,false,['--signature','品牌'.repeat(15)]);
 assert.ok((await readJSON(path.join(longSignature,'render-report.json'))).checks[0].errors.includes('signature: text overflow; shorten brand name'));
 const multilineSignature=path.join(temporary,'multiline-signature');render(standardRequestFile,multilineSignature,standardBrandFile,false,['--signature','品牌\n第二行']);assert.equal(await fs.stat(multilineSignature).then(()=>true,()=>false),false);
 console.log('PASS: custom signature overrides example, survives replay, hides when empty and rejects overflow/multiline');
 const replay=path.join(temporary,'replay');render(path.join(review,'request.json'),replay,path.join(review,'brand.json'));
 const report2=await readJSON(path.join(replay,'render-report.json'));assert.deepEqual(report.checks.map(c=>c.imageSha256),report2.checks.map(c=>c.imageSha256));console.log('PASS: self-contained replay produces identical PNG bytes in the same runtime');
 const sentinel=path.join(review,'sentinel.txt');await fs.writeFile(sentinel,'preserve');render(requestFile,review,brandFile,false);assert.equal(await fs.readFile(sentinel,'utf8'),'preserve');console.log('PASS: existing output preserved');
 const badFont=structuredClone(brand);badFont.font.sha256='0'.repeat(64);render(requestFile,path.join(temporary,'bad-font'),await writeJSON('bad-font.json',badFont),false);assert.equal(await fs.stat(path.join(temporary,'bad-font')).then(()=>true,()=>false),false);
 const missing=structuredClone(request);missing.candidates[0].asset=path.join(temporary,'absent.png');render(await writeJSON('missing.json',missing),path.join(temporary,'missing'),brandFile,false);
 const duplicate=structuredClone(request);duplicate.candidates[1].id=duplicate.candidates[0].id;render(await writeJSON('duplicate.json',duplicate),path.join(temporary,'duplicate'),brandFile,false);
 const long=structuredClone(request);long.candidates=long.candidates.slice(0,1);long.recommendedId=long.candidates[0].id;long.candidates[0].headline=['一二三四五六七八九十一二三四五六','不应该静默缩字'];const longDir=path.join(temporary,'overflow');render(await writeJSON('long.json',long),longDir,brandFile,false);assert.equal((await readJSON(path.join(longDir,'render-report.json'))).renderPassed,false);assert.equal(await fs.stat(path.join(longDir,'change','cover-4x3.png')).then(()=>true,()=>false),false);console.log('PASS: bad font, missing image, duplicate id and overflowing title rejected');
 const other=structuredClone(request);other.candidates=[{...other.candidates[0],id:'links',name:'其他题材技术测试',category:'效率工具',headline:['存过的网页','一搜就找回'],subhead:'假设输入：保存、标签与搜索；测试素材不代表产品',reason:'仅测试不同题材文字能沿用模板；图像沿用测试夹具，不能作为该产品发布封面。'}];other.recommendedId='links';const otherReview=path.join(temporary,'links');render(await writeJSON('links.json',other),otherReview);for(const check of (await readJSON(path.join(otherReview,'render-report.json'))).checks)assert.equal(check.headlineAngle,-2);console.log('PASS: non-butterfly text uses the same tilted template without topic-specific logic');
 let servedReview=review;const server=http.createServer(async(req,res)=>{try{const file=path.resolve(servedReview,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(servedReview+path.sep))throw Error('outside');const data=await fs.readFile(file);const type={'.html':'text/html; charset=utf-8','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type});res.end(data)}catch{res.writeHead(404).end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await runtime.chromium.launch({headless:true});
 try{const page=await browser.newPage({viewport:{width:1200,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/review.html');await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
  assert.equal(await page.locator('#download-selection').isDisabled(),true);await page.locator('#ratio').click();await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));assert.equal(await page.locator('article img').first().evaluate(img=>img.naturalWidth),1600);await page.locator('#size').click();assert.equal((await page.locator('.picture').first().boundingBox()).width,240);await page.locator('#gray').click();assert.equal(await page.locator('article img').first().evaluate(img=>getComputedStyle(img).filter),'grayscale(1)');await page.locator('#duration').click();assert.equal(await page.locator('.duration').first().isVisible(),true);
  await page.locator('button.choose[data-id="museum"]').click();const downloadEvent=page.waitForEvent('download');await page.locator('#download-selection').click();const download=await downloadEvent;const selectionFile=path.join(temporary,'test-browser-selection.json');await download.saveAs(selectionFile);assert.equal((await readJSON(selectionFile)).candidateId,'museum');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);assert.deepEqual(errors,[]);console.log('PASS: ratio, thumbnail, grayscale, overlay, selection download and mobile layout');
  const finalDir=path.join(temporary,'test-final-only');run('finalize_cover.mjs',['--review',review,'--selection',selectionFile,'--out-dir',finalDir]);assert.equal((await readJSON(path.join(finalDir,'finalization.json'))).published,false);assert.equal(sha(await fs.readFile(path.join(finalDir,'cover-3x4.png'))),report.checks.find(c=>c.id==='museum'&&c.ratio==='3x4').imageSha256);
  const recommendation=await writeJSON('editor.json',{candidateId:'museum',status:'editor-recommended'});run('finalize_cover.mjs',['--review',review,'--selection',recommendation,'--out-dir',path.join(temporary,'must-not-finalize')],false);
  await fs.appendFile(path.join(review,'museum','cover-3x4.png'),'changed');run('finalize_cover.mjs',['--review',review,'--selection',selectionFile,'--out-dir',path.join(temporary,'tampered-final')],false);console.log('PASS: final export is byte-preserving; editor recommendation and altered PNG refused');
  servedReview=standardReview;await page.setViewportSize({width:1200,height:1000});await page.goto('http://127.0.0.1:'+server.address().port+'/review.html');await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));assert.equal(await page.title(),'标准封面 · 横竖双版');assert.equal(await page.locator('article').count(),2);assert.equal(await page.locator('#download-selection').isDisabled(),true);await page.locator('#size').click();assert.equal((await page.locator('.landscape .picture').boundingBox()).width,240);assert.equal((await page.locator('.portrait .picture').boundingBox()).width,180);await page.locator('#gray').click();assert.equal(await page.locator('article img').first().evaluate(img=>getComputedStyle(img).filter),'grayscale(1)');await page.locator('#approve').click();assert.equal(await page.locator('#download-selection').isEnabled(),true);await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);console.log('PASS: single-standard dual-ratio preview, thumbnail, grayscale, confirmation and mobile layout');
  servedReview=customReview;
  for(const ratio of ['4x3','3x4']){await page.goto('http://127.0.0.1:'+server.address().port+'/standard/cover-'+ratio+'.html');await page.evaluate(()=>window.coverReady);assert.equal(await page.locator('.signature').textContent(),customSignature);assert.equal(await page.locator('.signature').locator('*').count(),0);assert.deepEqual(await page.evaluate(()=>['.category','.subhead','.signature'].map(selector=>getComputedStyle(document.querySelector(selector)).transform)),['none','none','none']);assert.equal(await page.locator('.emphasis').evaluate(el=>getComputedStyle(el,'::after').transform),'none');assert.equal(await page.evaluate(()=>window.inspectCover().headlineAngle),-2)}
  servedReview=hiddenReview;await page.goto('http://127.0.0.1:'+server.address().port+'/standard/cover-3x4.html');await page.evaluate(()=>window.coverReady);assert.equal(await page.locator('.signature').count(),0);assert.deepEqual(errors,[]);
  const customSelection=await writeJSON('test-custom-selection.json',{candidateId:'standard',status:'user-selected-in-review'}),customFinal=path.join(temporary,'test-custom-final');
  run('finalize_cover.mjs',['--review',customReview,'--selection',customSelection,'--out-dir',customFinal]);assert.equal((await readJSON(path.join(customFinal,'finalization.json'))).signature,customSignature);assert.equal(sha(await fs.readFile(path.join(customFinal,'cover-3x4.png'))),customReport.checks.find(c=>c.ratio==='3x4').imageSha256);
  console.log('PASS: custom text is literal in both ratios; empty signature removes its decoration; final export retains branding');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
 console.log('All checks passed. Test choices are fixtures only: '+temporary);
}
main().catch(error=>{console.error(error);process.exitCode=1});
