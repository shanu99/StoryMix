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
 await page.getByRole('slider',{name:'Audio volume'}).fill('45')
 await page.getByRole('slider',{name:'Fade in duration'}).fill('0.5')
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
