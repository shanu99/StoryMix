import {test,expect,Page} from '@playwright/test'
import {join} from 'node:path'
import {readFileSync} from 'node:fs'
const fixture=(name:string)=>join(process.cwd(),'e2e','fixtures',name)
const MOCK_KEY='AIza'+'x'.repeat(35)
async function importAudio(page:Page){
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(fixture('test-audio.wav'))
 await expect(page.getByText(/placed 1 clips/)).toBeVisible({timeout:25000})
 await page.getByRole('button',{name:'Captions',exact:true}).click()
}
async function save(page:Page){
 const menu=page.locator('.sm-top-menu').first()
 if((await menu.getAttribute('open'))===null)await menu.locator('summary').click()
 const event=page.waitForEvent('download')
 await page.getByRole('button',{name:'Save project'}).click()
 return JSON.parse(readFileSync((await(await event).path())!,'utf8'))
}
test('Gemini key is saved encrypted on this device, restores on reload, and is editable',async({page})=>{
 await importAudio(page)
 const panel=page.getByRole('region',{name:'Sinhala AI Auto Captions'})
 await expect(panel.getByLabel('Gemini API key')).toBeVisible()
 await expect(panel.getByRole('button',{name:'Generate Sinhala AI captions'})).toBeDisabled()
 await panel.getByLabel('Gemini API key').fill(MOCK_KEY)
 await panel.getByRole('button',{name:'Save Gemini API key'}).click()
 await expect(panel.getByLabel('Saved Gemini API key')).toBeVisible()
 await expect(panel.getByLabel('Gemini API key')).toHaveCount(0)
 const raw=await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
   const r=indexedDB.open('storymix-gemini-settings-v1')
   r.onsuccess=()=>resolve(r.result)
   r.onerror=()=>reject(r.error)
  })
  const saved=await new Promise<any>((resolve,reject)=>{
   const r=db.transaction('vault','readonly').objectStore('vault').get('gemini-key')
   r.onsuccess=()=>resolve(r.result)
   r.onerror=()=>reject(r.error)
  })
  db.close()
  return {record:JSON.stringify(saved),local:JSON.stringify({...localStorage}),
   session:JSON.stringify({...sessionStorage})}
 })
 expect(raw.record).not.toContain(MOCK_KEY)
 expect(raw.local).not.toContain(MOCK_KEY)
 expect(raw.session).not.toContain(MOCK_KEY)
 await page.reload()
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 await expect(panel.getByLabel('Saved Gemini API key')).toBeVisible()
 await expect(panel.getByRole('button',{name:'Generate Sinhala AI captions'})).toBeEnabled()
 await panel.getByRole('button',{name:'Edit saved Gemini API key'}).click()
 await expect(panel.getByLabel('Gemini API key')).toHaveValue(MOCK_KEY)
 const newKey='AIza'+'z'.repeat(35)
 await panel.getByLabel('Gemini API key').fill(newKey)
 await panel.getByRole('button',{name:'Save Gemini API key'}).click()
 await expect(panel.getByLabel('Saved Gemini API key')).toContainText(newKey.slice(-4))
 await page.reload()
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 await expect(panel.getByLabel('Saved Gemini API key')).toContainText(newKey.slice(-4))
 await panel.getByRole('button',{name:'Remove saved Gemini API key'}).click()
 await expect(panel.getByLabel('Gemini API key')).toHaveValue('')
 await page.reload()
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 await expect(panel.getByLabel('Gemini API key')).toHaveValue('')
 await expect(panel.getByRole('button',{name:'Generate Sinhala AI captions'})).toBeDisabled()
 await panel.getByText('Advanced settings').click()
 await expect(panel.getByRole('combobox',{name:'Caption recognition engine'})).toHaveValue('gemini')
 await panel.getByRole('combobox',{name:'Caption recognition engine'}).selectOption('whisper')
 await expect(panel.getByRole('combobox',{name:'Sinhala transcription model'})).toBeVisible()
})

test('Gemini audio gateway: real 16 kHz WAV chunks, timed mixed-language captions, right-side editing and export',async({page})=>{
 let requests=0
 await page.route('**/api/transcribe',async route=>{
  requests++
  const request=route.request()
  expect(request.method()).toBe('POST')
  expect(request.headers()['content-type']).toContain('audio/wav')
  expect(request.headers()['x-storymix-gemini-key']).toBe(MOCK_KEY)
  const bytes=request.postDataBuffer()!
  expect(bytes.subarray(0,4).toString()).toBe('RIFF')
  expect(bytes.subarray(8,12).toString()).toBe('WAVE')
  expect(bytes.length).toBeGreaterThan(10000)
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   model:'gemini-2.5-flash',segments:[
    {start:.2,end:1.05,text:'ආයුබෝවන් සියලු දෙනාටම'},
    {start:1.12,end:1.75,text:'Welcome back'},
   ],
  })})
 })
 await importAudio(page)
 await page.getByLabel('Gemini API key').fill(MOCK_KEY)
 await page.getByRole('button',{name:'Save Gemini API key'}).click()
 await expect(page.getByLabel('Saved Gemini API key')).toBeVisible()
 await page.getByRole('button',{name:'Generate Sinhala AI captions'}).click()
 const inspector=page.getByRole('region',{name:'Caption editor inspector'})
 await expect(inspector.getByRole('textbox',{name:'Caption 1 text'})).toHaveValue('ආයුබෝවන් සියලු දෙනාටම',{timeout:40000})
 await expect(inspector.getByRole('textbox',{name:'Caption 2 text'})).toHaveValue('Welcome back')
 await expect(inspector.getByRole('button',{name:'Insert generated captions into timeline'})).toBeEnabled()
 await inspector.getByRole('button',{name:'Insert generated captions into timeline'}).click()
 const p=await save(page)
 const texts=(Object.values(p.clips).flat() as any[]).filter(c=>c.type==='text')
 expect(texts).toHaveLength(2)
 expect(texts.some(t=>t.content.includes('ආයුබෝවන්'))).toBeTruthy()
 expect(texts.some(t=>t.content.includes('Welcome back'))).toBeTruthy()
 expect(requests).toBeGreaterThanOrEqual(1)
})

test('Gemini 429/quota response shows a useful error and never adds fake captions',async({page})=>{
 await page.route('**/api/transcribe',async route=>route.fulfill({status:429,contentType:'application/json',
  body:JSON.stringify({error:'Gemini Free Tier rate limit reached. Retry later.'})}))
 await importAudio(page)
 await page.getByLabel('Gemini API key').fill(MOCK_KEY)
 await page.getByRole('button',{name:'Save Gemini API key'}).click()
 await expect(page.getByLabel('Saved Gemini API key')).toBeVisible()
 await page.getByRole('button',{name:'Generate Sinhala AI captions'}).click()
 await expect(page.getByRole('region',{name:'Sinhala AI Auto Captions'}).getByRole('alert'))
  .toContainText('Free Tier rate limit',{timeout:40000})
 const p=await save(page)
 expect((Object.values(p.clips).flat() as any[]).filter(c=>c.type==='text')).toHaveLength(0)
})

test('WAV packaging and overlap deduplication work without any Google request',async({page})=>{
 await page.goto('/')
 const out=await page.evaluate(async()=>{
  const t=await import('/src/geminiTranscription.ts')
  const wav=t.wavPcm16(new Float32Array([0,1,-1,.5]))
  const segments=t.mergeGeminiSegments([{start:0,end:1,text:'කොහොමද'}],[
    {start:.06,end:1.04,text:'කොහොමද'},{start:1.2,end:2.3,text:'Hello'},
  ])
  const l=await import('/src/captionLayout.ts')
  return {
   signature:Array.from(wav.subarray(0,4)),bytes:wav.byteLength,
   sampleRate:new DataView(wav.buffer).getUint32(24,true),
   segmentCount:segments.length,
   englishIssue:l.captionQualityIssue('Welcome back','original'),
   singlishLocal:l.captionQualityIssue('Ayubowan','sinhala'),
  }
 })
 expect(out.signature).toEqual([82,73,70,70])
 expect(out.bytes).toBe(52)
 expect(out.sampleRate).toBe(16000)
 expect(out.segmentCount).toBe(2)
 expect(out.englishIssue).toBeNull()
 expect(out.singlishLocal).toMatch(/Singlish/)
})
