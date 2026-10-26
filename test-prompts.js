'use strict';
// Verifies the code path that chooses the prompt before it is placed in the API FormData.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const client=fs.readFileSync(path.join(__dirname,'public','app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8');
const start=server.indexOf('const styles=Object.freeze(');
const end=server.indexOf('\nlet db={',start);
assert(start!==-1 && end!==-1,'Prompt configuration not found');
const code=server.slice(start,end)+'\n;globalThis.selectEditPrompt=selectEditPrompt;';
const context=vm.createContext({});
vm.runInContext(code,context);
const selected=context.selectEditPrompt;
assert.equal(selected('missing','B1'),'Correct the smile by adding the missing teeth. Keep existing teeth unchanged.');
const list=['A2','B1','0M1'];
const prompts=list.map(s=>selected('whitening',s));
assert.equal(new Set(prompts).size,3,'Whitening prompts must be different');
for (const prompt of prompts){
 assert.match(prompt,/Whiten existing teeth only/);
 assert.match(prompt,/Do not add or remove teeth/);
 assert.match(prompt,/Keep all existing tooth shapes, sizes, positions and spacing the same/);
 assert.doesNotMatch(prompt,/restore|missing teeth|correct the smile/i);
}
for(const shade of list)assert(html.includes('data-shade="'+shade+'"'));
assert.match(client,/shade:selectedShade/);
assert.match(client,/style:selected/);
assert.match(server,/form\.append\('prompt',editPrompt\)/);
assert.match(server,/const editPrompt=selectEditPrompt\(d\.style,d\.shade\)/);
assert.match(server,/form\.append\('image',new Blob\(\[prepared\]/);
assert.throws(()=>selected('whitening','invalid'));
assert.throws(()=>selected('other','B1'));
console.log('PASS: Exact missing-teeth prompt, 3 separate whitening-only prompts, UI values and API routing verified.');
console.log('NOTE: This checks routing, not whether a generative AI preserves tooth anatomy in its image output.');
