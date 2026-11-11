import {test,expect,Page} from '@playwright/test'
import {join} from 'node:path'
import {readFileSync} from 'node:fs'

const fixture=(name:string)=>join(process.cwd(),'e2e','fixtures',name)
async function addVideo(page:Page){
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(fixture('test-video.mp4'))
 await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
 await page.getByText('Video only',{exact:true}).click()
 await expect(page.getByText(/placed 1 clips/)).toBeVisible()
}
async function save(page:Page){
 const menu=page.locator('.sm-top-menu').first()
 if(await menu.getAttribute('open')===null)await menu.locator('summary').click()
 const download=page.waitForEvent('download')
 await page.getByRole('button',{name:'Save project'}).click()
 const file=await(await download).path()
 return JSON.parse(readFileSync(file!,'utf8'))
}
const all=(p:any)=>(Object.values(p.clips).flat() as any[])

test('effects, color looks and keyframes are persisted as renderable clip metadata',async({page})=>{
 await addVideo(page)
 await page.locator('[data-clip-type="video"]').first().click({position:{x:30,y:12}})
 await page.getByRole('button',{name:'Effects',exact:true}).click()
 await page.getByRole('button',{name:'Colour grade'}).click()
 await expect(page.getByLabel('Enable colorGrade')).toBeVisible()
 await page.getByRole('button',{name:'Filters',exact:true}).click()
 await page.getByRole('button',{name:'Film Fade'}).click()
 await page.getByRole('button',{name:'Keyframes',exact:true}).click()
 await page.getByRole('button',{name:'Add / replace keyframe'}).click()
 const p=await save(page)
 const c=all(p).find(c=>c.type==='video')!
 expect(c.effects.find((x:any)=>x.kind==='colorGrade')?.preset).toBe('film-fade')
 expect(c.keyframes.channels.opacity.keys.length).toBe(1)
})

test('manual Sinhala captions and style presets survive a project save',async({page})=>{
 await addVideo(page)
 await page.getByRole('button',{name:'Captions',exact:true}).click()
 const field=page.getByRole('textbox',{name:'New caption text'})
 await field.fill('ආයුබෝවන් StoryMix')
 await page.getByRole('button',{name:'Add caption at playhead'}).click()
 await page.getByRole('button',{name:/All captions/}).click()
 const p=await save(page)
 const c=all(p).find(c=>c.type==='text'&&c.content==='ආයුබෝවන් StoryMix')
 expect(c).toBeTruthy()
 expect(c.textOutline.width).toBeGreaterThan(0)
 expect(c.textShadow.blur).toBeGreaterThan(0)
})

test('decoded audio waveform and mixer change actual clip volume and fades',async({page})=>{
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(fixture('test-audio.wav'))
 await expect(page.getByText(/placed 1 clips/)).toBeVisible({timeout:25000})
 await page.locator('[data-clip-type="audio"]').first().click({position:{x:30,y:12}})
 await page.getByRole('button',{name:'Audio',exact:true}).click()
 await expect(page.getByRole('img',{name:'Decoded audio waveform'})).toBeVisible({timeout:30000})
 const setSlider=async(label:string,value:string)=>{
  await page.getByRole('slider',{name:label}).evaluate((el,value)=>{
   const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set
   setter?.call(el,value)
   el.dispatchEvent(new Event('input',{bubbles:true}))
   el.dispatchEvent(new Event('change',{bubbles:true}))
  },value)
 }
 await setSlider('Audio volume','45')
 await setSlider('Fade in duration','0.5')
 const p=await save(page)
 const c=all(p).find(c=>c.type==='audio')!
 expect(c.volume).toBeCloseTo(.45)
 expect(c.audio.fadeInSec).toBeCloseTo(.5)
})

test('local autosave presents explicit recovery after reload, without automatic overwrite',async({page})=>{
 await addVideo(page)
 await expect.poll(async()=>page.evaluate(()=>!!localStorage.getItem('storymix-autorecovery-v1')),{timeout:15000}).toBeTruthy()
 const saved=await save(page)
 await page.reload()
 await expect(page.getByRole('button',{name:'Recover previous project'})).toBeVisible()
 expect(await page.locator('[data-clip-type="video"]').count()).toBe(0)
 await page.getByRole('button',{name:'Recover previous project'}).click()
 await expect(page.locator('[data-clip-type="video"]')).toHaveCount(1)
 const restored=await save(page)
 expect(all(restored).length).toBe(all(saved).length)
})

test('draggable visual transition creates an actual timeline transition',async({page})=>{
 await addVideo(page)
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(fixture('test-black.mp4'))
 await expect(page.getByText(/Imported 1 files/)).toBeVisible({timeout:25000})
 await expect(page.locator('[data-clip-type="video"]')).toHaveCount(2)
 await page.locator('[data-clip-type="video"]').first().click({position:{x:30,y:12}})
 await page.getByRole('button',{name:'Transitions',exact:true}).click()
 await page.getByRole('button',{name:'Drag Fade transition'}).dragTo(page.locator('[data-clip-type="video"]').nth(1))
 await expect(page.getByText(/transition applied/)).toBeVisible({timeout:10000})
 const project=await save(page)
 expect(project.transitions).toHaveLength(1)
 expect(project.transitions[0].kind).toBe('fade')
 expect(project.transitions[0].durationFrames).toBeGreaterThan(0)
})

test('local microphone voiceover is recorded and inserted on an audio track',async({page})=>{
 test.setTimeout(85000)
 await page.addInitScript(()=>{
  if(!navigator.mediaDevices)return
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
   const context=new AudioContext()
   const output=context.createMediaStreamDestination()
   const osc=context.createOscillator()
   osc.frequency.value=440
   osc.connect(output);osc.start()
   return output.stream
  }})
 })
 await page.goto('/')
 await page.getByRole('button',{name:'Record',exact:true}).click()
 await page.getByRole('button',{name:'Start voiceover recording'}).click()
 await expect(page.getByRole('button',{name:'Stop recording'})).toBeVisible({timeout:25000})
 await page.waitForTimeout(1050)
 await page.getByRole('button',{name:'Stop recording'}).click()
 await expect(page.getByRole('region',{name:'Record tools'}).getByRole('status')).toContainText('Voiceover inserted at playhead',{timeout:35000})
 await expect(page.locator('[data-clip-type="audio"]')).toHaveCount(1)
 const p=await save(page)
 const clip=all(p).find(c=>c.type==='audio')
 expect(clip?.name).toMatch(/StoryMix-voiceover/)
 expect(clip.durationFrames).toBeGreaterThan(0)
})
