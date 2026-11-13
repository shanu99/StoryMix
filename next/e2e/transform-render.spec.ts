import {test,expect} from '@playwright/test'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'

test('crop, scale, position and rotate actually change rendered MP4 frames',async({page})=>{
 test.setTimeout(160000)
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-video.mp4'))
 await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
 await page.getByText('Video only',{exact:true}).click()
 await expect(page.getByText(/placed 1 clips/)).toBeVisible()
 const exportVideo=async()=>{
  await page.locator('.elah-export-btn').click()
  await page.getByRole('button',{name:/360p/}).click()
  const downloaded=page.waitForEvent('download',{timeout:100000})
  await page.getByRole('button',{name:'Export',exact:true}).last().click()
  const file=await (await downloaded).path()
  expect(file).toBeTruthy()
  const gray=execFileSync('ffmpeg',['-v','error','-ss','1','-i',file!,'-frames:v','1','-pix_fmt','gray','-f','rawvideo','pipe:1'])
  return gray
 }
 const original=await exportVideo()
 const clip=page.locator('[data-clip-type="video"]').first()
 await clip.click({position:{x:45,y:12}})
 await page.getByRole('spinbutton',{name:'Scale'}).fill('0.65')
 await page.getByRole('spinbutton',{name:'X (%)'}).fill('65')
 await page.getByRole('spinbutton',{name:'Rotate (°)'}).fill('12')
 await page.getByRole('spinbutton',{name:'Left (%)'}).fill('12')
 const altered=await exportVideo()
 expect(altered.length).toBe(original.length)
 let different=0
 for(let i=0;i<original.length;i++)if(Math.abs(original[i]-altered[i])>10)different++
 console.log('CHANGED PIXELS:',different,'/',original.length)
 expect(different).toBeGreaterThan(original.length*.01)
})
