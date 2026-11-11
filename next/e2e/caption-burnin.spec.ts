import {test,expect} from '@playwright/test'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'

test('Sinhala caption is actually burned into video, not merely saved as SRT',async({page})=>{
  test.setTimeout(120000)
  await page.goto('/')
  await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-black.mp4'))
  await expect(page.getByText(/placed 1 clips/)).toBeVisible({timeout:20000})
  const srt='1\\n00:00:00,300 --> 00:00:01,700\\nසිංහල StoryMix\\n'
  await page.locator('input[accept=".srt,text/plain"]').setInputFiles({name:'sinhala.srt',mimeType:'text/plain',buffer:Buffer.from(srt.replaceAll('\\n','\n'))})
  await expect(page.getByText(/Imported 1 captions/)).toBeVisible()
  await page.locator('.elah-export-btn').click()
  await page.getByRole('button',{name:/360p/}).click()
  const download=page.waitForEvent('download',{timeout:90000})
  await page.getByRole('button',{name:'Export',exact:true}).last().click()
  const output=await download
  const file=await output.path()
  expect(file).toBeTruthy()
  const brightness=(at:number):number=>{
    const raw=execFileSync('ffmpeg',['-v','error','-ss',String(at),'-i',file!,'-frames:v','1','-vf','format=gray','-f','rawvideo','pipe:1'],{maxBuffer:2000000})
    let bright=0
    for(let i=0;i<raw.length;i++)if(raw[i]>70)bright++
    return bright
  }
  const during=brightness(1),after=brightness(2.5)
  console.log('CAPTION BURN-IN bright pixels:',during,'after caption:',after)
  expect(during,'White Sinhala glyph pixels must be visible in exported frame').toBeGreaterThan(50)
  expect(during-after,'Caption should disappear after cue end').toBeGreaterThan(50)
})
