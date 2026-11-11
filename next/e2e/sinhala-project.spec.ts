import {test,expect} from '@playwright/test'
import {join} from 'node:path'
import {readFileSync} from 'node:fs'

test('Sinhala caption project persists across reload, and relink restores original clips',async({page})=>{
 const errors:string[]=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto('/')
 const loaded=await page.evaluate(async()=>{await document.fonts.load('400 24px "Noto Sans Sinhala"','සිංහල');return document.fonts.check('400 24px "Noto Sans Sinhala"','සිංහල')})
 expect(loaded,'Sinhala font must be available locally').toBeTruthy()
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-video.mp4'))
 await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
 await page.getByText('Video + Audio',{exact:true}).click()
 await expect(page.getByText(/placed 1 clips/)).toBeVisible()
 const srt='1\n00:00:00,200 --> 00:00:02,300\nසිංහල දෙපේළි\nStoryMix පරීක්ෂණය\n'
 await page.locator('input[accept=".srt,text/plain"]').setInputFiles({name:'caption.srt',mimeType:'text/plain',buffer:Buffer.from(srt)})
 await expect(page.getByText(/Imported 1 captions/)).toBeVisible()
 await page.locator('.sm-top-menu').first().locator('summary').click()
 const downloadPromise=page.waitForEvent('download')
 await page.getByRole('button',{name:'Save project'}).click()
 const d=await downloadPromise
 const saved=d.path()
 const file=await saved
 expect(file).toBeTruthy()
 const data=JSON.parse(readFileSync(file!,'utf8'))
 const allClips=Object.values(data.clips).flat() as Array<{type:string;content?:string;fontFamily?:string}>
 expect(allClips.some(c=>c.type==='text'&&c.content?.includes('සිංහල දෙපේළි')),'Sinhala text preserved in JSON').toBeTruthy()
 expect(allClips.some(c=>c.type==='text'&&c.fontFamily==='Noto Sans Sinhala'),'Self-hosted Sinhala font selected').toBeTruthy()
 await page.reload()
 await page.locator('input[accept=".json"]').setInputFiles(file!)
 await expect(page.getByText(/Project loaded. Relink 1 local media files/)).toBeVisible()
 await page.locator('input[aria-label="Relink original media files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-video.mp4'))
 if(await page.getByText('This video has audio').isVisible({timeout:2000}).catch(()=>false))await page.getByText('Video only',{exact:true}).click()
 await expect(page.getByText(/Relinked [1-9]\\d* clips/)).toBeVisible({timeout:20000})
 expect(errors).toEqual([])
})
