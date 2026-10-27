import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('editor references only DOM controls present in workspace',()=>{
 const html=readFileSync(new URL('../v1.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('./storymix-v1.mjs',import.meta.url),'utf8');
 const ids=[...js.matchAll(/\$\('([a-zA-Z][a-zA-Z\d]*)'\)/g)].map(m=>m[1]);
 const present=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 const missing=[...new Set(ids)].filter(id=>!present.has(id));
 assert.deepEqual(missing,[], 'Missing DOM controls: '+missing.join(', '));
});
