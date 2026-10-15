#!/usr/bin/env node
// Promote only a selection record supplied by the user; does not publish anything.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
 const opt={};for(let i=2;i<process.argv.length;i+=2){const k=process.argv[i];if(!['--review','--selection','--out-dir'].includes(k)||!process.argv[i+1])throw Error('Usage: node scripts/finalize_cover.mjs --review <dir> --selection <user-selection.json> --out-dir <new-dir>');opt[k.slice(2)]=process.argv[i+1]}
 if(!opt.review||!opt.selection||!opt['out-dir'])throw Error('Missing required arguments');
 const review=path.resolve(opt.review);const selection=JSON.parse(await fs.readFile(path.resolve(opt.selection),'utf8'));const report=JSON.parse(await fs.readFile(path.join(review,'render-report.json'),'utf8'));
 if(selection.status!=='user-selected-in-review'||!/^[a-z0-9-]{1,40}$/.test(selection.candidateId||''))throw Error('A user selection record is required; an editor recommendation is insufficient');
 if(!report.renderPassed||!report.candidates.some(c=>c.id===selection.candidateId))throw Error('Selection does not belong to a successfully rendered review');
 const files=[];
 for(const [ratio,width,height] of [['4x3',1600,1200],['3x4',1200,1600]]){
  const check=report.checks.find(c=>c.id===selection.candidateId&&c.ratio===ratio);const name='cover-'+ratio+'.png';const buffer=await fs.readFile(path.join(review,selection.candidateId,name));
  if(!check||check.errors.length||hash(buffer)!==check.imageSha256)throw Error('Artwork changed or failed QA; rerender before finalizing');
  if(buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||buffer.readUInt32BE(16)!==width||buffer.readUInt32BE(20)!==height)throw Error('PNG dimensions do not match '+ratio);
  files.push({name,buffer});
 }
 const out=path.resolve(opt['out-dir']);await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
 for(const f of files)await fs.writeFile(path.join(out,f.name),f.buffer);
 await fs.writeFile(path.join(out,'selection.json'),JSON.stringify(selection,null,2)+'\n');
 await fs.writeFile(path.join(out,'finalization.json'),JSON.stringify({status:'finalized-from-user-selection',candidateId:selection.candidateId,sourceReview:review,brandId:report.brandId,signature:report.signature??null,fontSha256:report.fontSha256,files:files.map(f=>({file:f.name,sha256:hash(f.buffer)})),published:false},null,2)+'\n');
 console.log('Finalized local cover pair: '+out);
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
