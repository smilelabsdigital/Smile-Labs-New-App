'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const s = fs.readFileSync(require('node:path').join(__dirname,'server.js'),'utf8');
const ui = fs.readFileSync(require('node:path').join(__dirname,'public','app.js'),'utf8');
assert.match(s, /missing:'Correct the smile by adding the missing teeth. Keep existing teeth unchanged.'/);
assert.match(s, /const editPrompt=selectEditPrompt\(d\.style,d\.shade\)/); assert.match(s, /form\.append\('prompt',editPrompt\)/);
for (const key of ['A2','B1',"'0M1'"]) {
  assert.match(s, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ':\\{label:'));
}
const activeBlock=s.slice(s.indexOf('const WHITENING_SHADES='),s.indexOf('let db='));
assert.equal((activeBlock.match(/Do not add or remove teeth/g)||[]).length,3);
assert.match(ui,/shade:selectedShade/);
assert.match(ui,/style:selected/);
assert.match(s,/form\.append\('image'/);
console.log('PASS: Missing-teeth prompt exact, three distinct whitening prompts, and client shade routing present.');
