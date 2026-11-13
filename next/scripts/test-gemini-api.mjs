import assert from 'node:assert/strict'
import handler from '../api/transcribe.ts'

const url='https://storymix-preview.test/api/transcribe'
const key='AIza'+'x'.repeat(35)
const wav=new Uint8Array(44+16000*2)
const view=new DataView(wav.buffer)
for(let i=0;i<4;i++)wav[i]='RIFF'.charCodeAt(i)
for(let i=0;i<4;i++)wav[8+i]='WAVE'.charCodeAt(i+0)
const request=(method='POST',headers={},body=wav)=>new Request(url,{method,
 headers:{'content-type':'audio/wav','x-storymix-gemini-key':key,...headers},
 ...(method==='POST'?{body}:{}),
})

assert.equal((await handler.fetch(new Request(url))).status,405)
assert.equal((await handler.fetch(request('POST',{'content-type':'text/plain'}))).status,415)
assert.equal((await handler.fetch(request('POST',{'x-storymix-gemini-key':''}))).status,401)
assert.equal((await handler.fetch(request('POST',{},new Uint8Array(11)))).status,413)
const originalFetch=globalThis.fetch
let googleCalls=0
try{
 globalThis.fetch=async (destination,options)=>{
  assert.equal(String(destination),'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
  assert.equal(options.headers['x-goog-api-key'],key)
  const body=JSON.parse(options.body)
  assert.equal(body.contents[0].parts[1].inlineData.mimeType,'audio/wav')
  assert.equal(body.generationConfig.responseMimeType,'application/json')
  googleCalls++
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({segments:[
   {start:.1,end:.5,text:'ආයුබෝවන්'},
   {start:.6,end:.9,text:'Hello'},
   {start:10,end:20,text:'too late'},
   {start:1,end:.5,text:'invalid'},
  ]})}]}}]})
 }
 const response=await handler.fetch(request())
 assert.equal(response.status,200)
 const json=await response.json()
 assert.equal(json.segments.length,2)
 assert.equal(json.segments[0].text,'ආයුබෝවන්')
 assert.equal(json.segments[1].text,'Hello')
 assert.equal(googleCalls,1)

 globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'secret raw diagnostic'}}),{status:429,headers:{'content-type':'application/json'}})
 const limit=await handler.fetch(request())
 assert.equal(limit.status,429)
 assert.match((await limit.json()).error,/Free Tier rate limit/)
 assert.doesNotMatch(JSON.stringify(await (await handler.fetch(request())).json()),/secret raw diagnostic/)

 globalThis.fetch=async()=>Response.json({candidates:[]})
 const missing=await handler.fetch(request())
 assert.equal(missing.status,502)
}finally{globalThis.fetch=originalFetch}
console.log('Gemini Vercel gateway tests passed (method, key, WAV, structured text, quotas, error sanitization)')
