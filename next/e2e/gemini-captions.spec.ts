import {test,expect,Page} from '@playwright/test'
import {join} from 'node:path'
import {readFileSync} from 'node:fs'
const fixture=(name:string)=>join(process.cwd(),'e2e','fixtures',name)
const MOCK_KEY='AIza'+'x'.repeat(35)
const AUTH_KEY='AQ.'+'A'.repeat(50)
test('new AQ authentication key saves, survives reload and can be removed',async({page})=>{
 await page.goto('/')
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 const panel=page.getByRole('region',{name:'Sinhala AI Auto Captions'})
 await panel.getByRole('button',{name:'Connect Google AI'}).click()
 const dialog=page.getByRole('dialog',{name:'Connect Google AI'})
 await dialog.locator('input[aria-label="Gemini API key"]').fill(AUTH_KEY)
 await dialog.getByRole('button',{name:'Save Gemini API key'}).click()
 await expect(dialog).toHaveCount(0)
 await expect(panel.getByLabel('API key saved status')).toContainText('Saved')
 await page.reload()
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 await expect(panel.getByLabel('API key saved status')).toContainText(AUTH_KEY.slice(-4))
 await panel.getByRole('button',{name:'Manage saved Gemini API key'}).click()
 await dialog.getByRole('button',{name:'Remove saved Gemini API key'}).click()
 await expect(panel.getByRole('button',{name:'Connect Google AI'})).toBeVisible()
})
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
test('one-time Google AI connection is saved securely, edited, restored and removed',async({page})=>{
 await importAudio(page)
 const panel=page.getByRole('region',{name:'Sinhala AI Auto Captions'})
 const dialog=page.getByRole('dialog',{name:'Connect Google AI'})
 await expect(panel.getByRole('button',{name:'Generate Sinhala AI captions'})).toBeEnabled()
 await expect(panel.getByRole('button',{name:'Connect Google AI'})).toBeVisible()
 await panel.getByRole('button',{name:'Generate Sinhala AI captions'}).click()
 await expect(dialog).toBeVisible()
 await expect(dialog.locator('input[aria-label="Gemini API key"]')).toBeVisible()
 await dialog.locator('input[aria-label="Gemini API key"]').fill(MOCK_KEY)
 await dialog.getByRole('button',{name:'Save Gemini API key'}).click()
 await expect(dialog).toHaveCount(0)
 await expect(panel.getByLabel('API key saved status')).toContainText('Saved')
 const raw=await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
   const r=indexedDB.open('storymix-gemini-settings-v1')
   r.onsuccess=()=>resolve(r.result)
   r.onerror=()=>reject(r.error)
  })
  const record=await new Promise<any>((resolve,reject)=>{
   const r=db.transaction('vault','readonly').objectStore('vault').get('gemini-key')
   r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)
  })
  db.close()
  return {record:JSON.stringify(record),local:JSON.stringify({...localStorage}),session:JSON.stringify({...sessionStorage})}
 })
 expect(raw.record).not.toContain(MOCK_KEY)
 expect(raw.local).not.toContain(MOCK_KEY)
 expect(raw.session).not.toContain(MOCK_KEY)
 await page.reload()
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 await expect(panel.getByLabel('API key saved status')).toContainText(MOCK_KEY.slice(-4))
 // Media URLs are ephemeral and must be reimported after a full reload.
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(fixture('test-audio.wav'))
 await expect(page.getByText(/placed 1 clips/)).toBeVisible({timeout:25000})
 await expect(panel.getByRole('button',{name:'Generate Sinhala AI captions'})).toBeEnabled()
 await panel.getByRole('button',{name:'Manage saved Gemini API key'}).click()
 await expect(dialog.locator('[aria-label="Saved Gemini API key"]')).toBeVisible()
 await dialog.getByRole('button',{name:'Edit saved Gemini API key'}).click()
 await expect(dialog.locator('input[aria-label="Gemini API key"]')).toHaveValue(MOCK_KEY)
 const nextKey='AIza'+'z'.repeat(35)
 await dialog.locator('input[aria-label="Gemini API key"]').fill(nextKey)
 await dialog.getByRole('button',{name:'Save Gemini API key'}).click()
 await expect(dialog).toHaveCount(0)
 await expect(panel.getByLabel('API key saved status')).toContainText(nextKey.slice(-4))
 await page.reload()
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 await expect(panel.getByLabel('API key saved status')).toContainText(nextKey.slice(-4))
 await panel.getByRole('button',{name:'Manage saved Gemini API key'}).click()
 await dialog.getByRole('button',{name:'Remove saved Gemini API key'}).click()
 await expect(dialog).toHaveCount(0)
 await expect(panel.getByRole('button',{name:'Connect Google AI'})).toBeVisible()
 await page.reload()
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 await expect(panel.getByRole('button',{name:'Connect Google AI'})).toBeVisible()
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
  expect(request.headers()['x-storymix-gemini-key']).toBe(AUTH_KEY)
  const bytes=request.postDataBuffer()!
  expect(bytes.subarray(0,4).toString()).toBe('RIFF')
  expect(bytes.subarray(8,12).toString()).toBe('WAVE')
  expect(bytes.length).toBeGreaterThan(10000)
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   model:'gemini-3.5-flash-lite',segments:[
    {start:.2,end:1.05,text:'මම video එක edit කරනවා'},
    {start:1.12,end:1.75,text:'Welcome back'},
   ],
  })})
 })
 await importAudio(page)
 await page.getByRole('button',{name:'Connect Google AI'}).click()
 const setup=page.getByRole('dialog',{name:'Connect Google AI'})
 await setup.locator('input[aria-label="Gemini API key"]').fill(AUTH_KEY)
 await setup.getByRole('button',{name:'Save Gemini API key'}).click()
 await expect(setup).toHaveCount(0)
 await expect(page.getByLabel('API key saved status')).toContainText('Saved')
 await page.getByRole('button',{name:'Generate Sinhala AI captions'}).click()
 const inspector=page.getByRole('region',{name:'Caption editor inspector'})
 await expect(inspector.getByRole('textbox',{name:'Caption 1 text'})).toHaveValue('මම video එක edit කරනවා',{timeout:40000})
 await expect(inspector.getByRole('textbox',{name:'Caption 2 text'})).toHaveValue('Welcome back')
 await expect(inspector.getByRole('button',{name:'Insert generated captions into timeline'})).toBeEnabled()
 await inspector.getByRole('button',{name:'Insert generated captions into timeline'}).click()
 const p=await save(page)
 const texts=(Object.values(p.clips).flat() as any[]).filter(c=>c.type==='text')
 expect(texts).toHaveLength(2)
 expect(texts.some(t=>t.content.includes('මම video එක edit කරනවා'))).toBeTruthy()
 expect(texts.some(t=>t.content.includes('Welcome back'))).toBeTruthy()
 expect(requests).toBeGreaterThanOrEqual(1)
})

test('Gemini 429/quota response shows a useful error and never adds fake captions',async({page})=>{
 await page.route('**/api/transcribe',async route=>route.fulfill({status:429,contentType:'application/json',
  body:JSON.stringify({error:'Gemini Free Tier rate limit reached. Retry later.'})}))
 await importAudio(page)
 await page.getByRole('button',{name:'Connect Google AI'}).click()
 const setup=page.getByRole('dialog',{name:'Connect Google AI'})
 await setup.locator('input[aria-label="Gemini API key"]').fill(MOCK_KEY)
 await setup.getByRole('button',{name:'Save Gemini API key'}).click()
 await expect(setup).toHaveCount(0)
 await expect(page.getByLabel('API key saved status')).toContainText('Saved')
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

test('caption workspace has a clean connection prompt and one primary action',async({page})=>{
 await page.goto('/')
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 const panel=page.getByRole('region',{name:'Sinhala AI Auto Captions'})
 await expect(panel.getByText('Auto Captions',{exact:true})).toBeVisible()
 await expect(panel.getByRole('button',{name:'Connect Google AI'})).toBeVisible()
 await expect(panel.getByRole('button',{name:'Generate Sinhala AI captions'})).toBeDisabled()
 await expect(panel.getByText('Import a video or audio file first')).toBeVisible()
 await panel.getByRole('button',{name:'Connect Google AI'}).click()
 const dialog=page.getByRole('dialog',{name:'Connect Google AI'})
 await expect(dialog.getByText('Connect your Google AI key')).toBeVisible()
 await expect(dialog.getByRole('link',{name:/Open Google AI Studio/})).toBeVisible()
 await expect(dialog.getByRole('button',{name:'Save Gemini API key'})).toBeDisabled()
 await dialog.getByRole('button',{name:'Close Google AI setup'}).click()
 await expect(dialog).toHaveCount(0)
})

test('caption typography includes distinct Sinhala fonts and import controls',async({page})=>{
 await page.goto('/')
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 const panel=page.getByRole('region',{name:'Caption editor inspector'})
 await expect(panel.getByText('Sinhala Font Library')).toBeVisible()
 const font=panel.getByRole('combobox',{name:'Caption font family'})
 await expect(font.locator('option[value="Gemunu Libre"]')).toHaveCount(1)
 await expect(font.locator('option[value="Abhaya Libre"]')).toHaveCount(1)
 await expect(font.locator('option[value="Yaldevi"]')).toHaveCount(1)
 await expect(font.locator('option[value="Noto Serif Sinhala Variable"]')).toHaveCount(1)
 await font.selectOption('Gemunu Libre')
 await expect(font).toHaveValue('Gemunu Libre')
 await expect(panel.getByRole('button',{name:'Import caption font'})).toBeVisible()
 await panel.getByRole('combobox',{name:'Imported font encoding'}).selectOption('legacy')
 await expect(panel.getByText(/automatically use StoryPad Studio encoding rules/)).toBeVisible()
})

test('StoryPad converters preserve mixed Sinhala-English while encoding just Sinhala glyphs',async({page})=>{
 await page.goto('/')
 const actual=await page.evaluate(async()=>{
  const m=await import('/src/legacyCaptionEncoding.ts')
  const source='මම video එක edit කරනවා'
  const fm=m.encodeCaptionForFont(source,'fm')
  const isi=m.encodeCaptionForFont(source,'isiwara')
  return {
   fm,fmName:m.detectLegacyFamily('FM-Abhaya-x.ttf'),
   isi,isiName:m.detectLegacyFamily('IsiGurulugomi.ttf'),
   unknown:m.detectLegacyFamily('MyRandomFont.ttf'),
  }
 })
 expect(actual.fmName).toBe('fm')
 expect(actual.isiName).toBe('isiwara')
 expect(actual.unknown).toBeNull()
 expect(actual.fm.complete).toBeTruthy()
 expect(actual.fm.runs.map((r:{source:string})=>r.source).join('')).toBe('මම video එක edit කරනවා')
 expect(actual.fm.runs.some((r:{kind:string;text:string})=>r.kind==='legacy'&&r.text.includes('uu'))).toBeTruthy()
 expect(actual.fm.runs.some((r:{kind:string;text:string})=>r.kind==='unicode'&&r.text.includes('video'))).toBeTruthy()
 expect(actual.isi.runs.some((r:{kind:string;text:string})=>r.kind==='unicode'&&r.text.includes('edit'))).toBeTruthy()
 expect(actual.isi.runs.some((r:{kind:string;text:string})=>r.kind==='legacy'&&r.text.length>0)).toBeTruthy()
})
