import {test,expect,Page} from '@playwright/test'
import {join} from 'node:path'
import {readFileSync} from 'node:fs'
const fixture=(name:string)=>join(process.cwd(),'e2e','fixtures',name)
async function savedProject(page:Page){
 const menu=page.locator('.sm-top-menu').first()
 if((await menu.getAttribute('open'))===null)await menu.locator('summary').click()
 const ev=page.waitForEvent('download')
 await page.getByRole('button',{name:'Save project'}).click()
 return JSON.parse(readFileSync((await(await ev).path())!,'utf8'))
}
async function fakeTranscriber(page:Page,neverFinish=false){
 await page.addInitScript((never:boolean)=>{
  const NativeWorker=window.Worker
  class SimulatedWhisperWorker{
   onmessage:((e:MessageEvent)=>void)|null=null
   onerror:((e:ErrorEvent)=>void)|null=null
   terminated=false
   postMessage(msg:{type:string;buffer?:ArrayBuffer}){
    if(msg.type!=='start')return
    if(never)return
    setTimeout(()=>{
      if(this.terminated)return
      this.onmessage?.({data:{type:'progress',stage:'Transcribing locally',percent:75,finished:1,total:1}} as MessageEvent)
      this.onmessage?.({data:{type:'caption',chunk:{start:.22,end:1.48,text:'ආයුබෝවන් ස්ටෝරිමික්ස්'},finished:1,total:1}} as MessageEvent)
      this.onmessage?.({data:{type:'complete',model:'test-mocked-whisper',message:'1 captions generated'}} as MessageEvent)
    },35)
   }
   terminate(){this.terminated=true}
  }
  window.Worker=class extends NativeWorker{
   constructor(url:string|URL,options?:WorkerOptions){
    if(String(url).includes('sinhalaAsr.worker'))return new SimulatedWhisperWorker() as unknown as Worker
    super(url,options)
   }
  }
 },neverFinish)
}
test('Sinhala ASR timestamps are sanitized and align correctly for trimmed fast playback',async({page})=>{
 await page.goto('/')
 const result=await page.evaluate(async()=>{
  const helper=await import('/src/sinhalaAsr.ts')
  const segments=helper.cleanRecognition([
   {text:'  සිංහල ',timestamp:[0,1.2]},
   {text:'  සිංහල ',timestamp:[1.19,1.4]},
   {text:'කථනය',timestamp:[1.6,10]},
   {text:'broken',timestamp:[5,3]},
  ],3)
  return {
   segments,
   frame:helper.sourceSecondsToTimelineFrame(2.4,90,1.5),
  }
 })
 expect(result.segments).toEqual([
  {start:0,end:1.4,text:'සිංහල'},
  {start:1.6,end:3,text:'කථනය'},
 ])
 expect(result.frame).toBe(138)
})

test('Sinhala AI captions decode real local audio and insert editable timed text after review',async({page})=>{
 await fakeTranscriber(page)
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(fixture('test-audio.wav'))
 await expect(page.getByText(/placed 1 clips/)).toBeVisible({timeout:25000})
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 await expect(page.getByRole('region',{name:'Sinhala AI Auto Captions'})).toBeVisible()
 await page.getByRole('button',{name:'Generate Sinhala AI captions'}).click()
 await expect(page.getByRole('textbox',{name:'Caption 1 text'})).toHaveValue('ආයුබෝවන් ස්ටෝරිමික්ස්',{timeout:30000})
 await page.getByRole('textbox',{name:'Caption 1 text'}).fill('ආයුබෝවන් ස්ටෝරිමික්ස්!')
 await page.getByRole('button',{name:'Insert generated captions into timeline'}).click()
 const p=await savedProject(page)
 const text=(Object.values(p.clips).flat() as any[]).find(c=>c.content==='ආයුබෝවන් ස්ටෝරිමික්ස්!')
 expect(text?.type).toBe('text')
 expect(text?.startFrame).toBe(7)
 expect(text?.durationFrames).toBeGreaterThan(30)
 expect(text?.textOutline?.width).toBeGreaterThanOrEqual(2)
 expect(p.tracks.some((t:any)=>t.name.includes('AI Captions'))).toBeTruthy()
})

test('Sinhala auto captions support downloading timestamped SRT before insertion',async({page})=>{
 await fakeTranscriber(page)
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(fixture('test-audio.wav'))
 await expect(page.getByText(/placed 1 clips/)).toBeVisible({timeout:25000})
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 await page.getByRole('button',{name:'Generate Sinhala AI captions'}).click()
 await expect(page.getByRole('button',{name:'Download generated Sinhala SRT'})).toBeVisible({timeout:25000})
 const ev=page.waitForEvent('download')
 await page.getByRole('button',{name:'Download generated Sinhala SRT'}).click()
 const dl=await ev
 expect(dl.suggestedFilename()).toBe('StoryMix-Sinhala-Auto-Captions.srt')
 const text=readFileSync((await dl.path())!,'utf8')
 expect(text).toContain('ආයුබෝවන් ස්ටෝරිමික්ස්')
 expect(text).toContain('00:00:00,')
})

test('Sinhala transcription can be cancelled without inserting incomplete captions',async({page})=>{
 await fakeTranscriber(page,true)
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(fixture('test-audio.wav'))
 await expect(page.getByText(/placed 1 clips/)).toBeVisible({timeout:25000})
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 await page.getByRole('button',{name:'Generate Sinhala AI captions'}).click()
 await expect(page.getByRole('button',{name:'Cancel Sinhala transcription'})).toBeVisible({timeout:20000})
 await page.getByRole('button',{name:'Cancel Sinhala transcription'}).click()
 await expect(page.getByRole('button',{name:'Generate Sinhala AI captions'})).toBeEnabled()
 const p=await savedProject(page)
 expect((Object.values(p.clips).flat() as any[]).filter(c=>c.type==='text')).toHaveLength(0)
})

test('Sinhala-only output blocks romanized captions until manually corrected in Unicode',async({page})=>{
 await fakeTranscriber(page)
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(fixture('test-audio.wav'))
 await expect(page.getByText(/placed 1 clips/)).toBeVisible({timeout:25000})
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 const panel=page.getByRole('region',{name:'Sinhala AI Auto Captions'})
 await expect(panel.getByRole('button',{name:'Generate Sinhala AI captions'})).toBeVisible()
 await expect(panel.getByLabel('Sinhala transcription model')).toBeHidden()
 await page.getByRole('button',{name:'Generate Sinhala AI captions'}).click()
 const edit=page.getByRole('textbox',{name:'Caption 1 text'})
 await expect(edit).toHaveValue('ආයුබෝවන් ස්ටෝරිමික්ස්',{timeout:30000})
 await edit.fill('Ayubowan meka singlish caption')
 await expect(panel.getByText(/Singlish\/English letters detected/)).toBeVisible()
 await expect(page.getByRole('button',{name:'Insert generated captions into timeline'})).toBeDisabled()
 await expect(page.getByRole('button',{name:'Download generated Sinhala SRT'})).toBeDisabled()
 await edit.fill('ආයුබෝවන් සිංහල උපසිරැසි')
 await expect(panel.getByText(/Singlish\/English letters detected/)).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Insert generated captions into timeline'})).toBeEnabled()
 await page.getByRole('button',{name:'Insert generated captions into timeline'}).click()
 const p=await savedProject(page)
 const caption=(Object.values(p.clips).flat() as any[]).find(c=>c.type==='text')
 expect(caption.content).toContain('සිංහල')
 expect(/[A-Za-z]/.test(caption.content)).toBeFalsy()
})

test('caption ratio helper auto-selects video formats and rejects non-Sinhala scripts',async({page})=>{
 await page.goto('/')
 const data=await page.evaluate(async()=>{
  const a=await import('/src/captionLayout.ts')
  return {
   portrait:a.videoStageFromMedia(480,854),
   landscape:a.videoStageFromMedia(1920,1080),
   square:a.videoStageFromMedia(640,640),
   portraitFont:a.captionPresentation({width:1080,height:1920}),
   landscapeFont:a.captionPresentation({width:1920,height:1080}),
   singlish:a.captionScriptIssue('kohomada'),
   sin:a.captionScriptIssue('කොහොමද'),
   mixed:a.captionScriptIssue('ආයුබෝවන් StoryMix'),
  }
 })
 expect(data.portrait).toEqual({width:1080,height:1920})
 expect(data.landscape).toEqual({width:1920,height:1080})
 expect(data.square).toEqual({width:1080,height:1080})
 expect(data.portraitFont.y).toBeLessThan(data.landscapeFont.y)
 expect(data.portraitFont.maxCharactersPerLine).toBeLessThan(data.landscapeFont.maxCharactersPerLine)
 expect(data.singlish).toMatch(/Singlish/)
 expect(data.sin).toBeNull()
 expect(data.mixed).toMatch(/Singlish/)
})

test('portrait video automatically establishes a portrait stage and fits Sinhala manual captions',async({page})=>{
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(fixture('test-portrait.mp4'))
 await expect(page.getByText(/placed 1 clips/)).toBeVisible({timeout:25000})
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 await expect(page.getByLabel('Detected video aspect ratio')).toContainText('1080×1920')
 await page.getByText('Manual captions & styling').click()
 await page.getByRole('textbox',{name:'New caption text'}).fill('මෙය නිවැරදි සිංහල උපසිරැසියකි')
 await page.getByRole('button',{name:'Add caption at playhead'}).click()
 const project=await savedProject(page)
 expect(project.stage).toMatchObject({width:1080,height:1920})
 const caption=(Object.values(project.clips).flat() as any[]).find(c=>c.type==='text')
 expect(caption.transform.x).toBeCloseTo(.5)
 expect(caption.transform.y).toBeLessThan(.84)
 expect(caption.fontSize).toBeLessThan(70)
 expect(caption.fontFamily).toBe('Noto Sans Sinhala')
})
