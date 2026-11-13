import {test,expect} from '@playwright/test'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'

test('audio fade-in/out survives project save and changes actual exported AAC waveform',async({page})=>{
 test.setTimeout(180000)
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-video.mp4'))
 await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
 await page.getByText('Video + Audio',{exact:true}).click()
 await expect(page.getByText(/Imported 1 files/)).toBeVisible({timeout:20000})
 const audio=page.locator('[data-clip-type="audio"]').first()
 await expect(audio).toBeVisible()
 await audio.click({position:{x:35,y:12}})
 await expect(page.getByRole('spinbutton',{name:'Fade in (sec)'})).toBeVisible()
 await page.getByRole('spinbutton',{name:'Fade in (sec)'}).fill('0.8')
 await page.getByRole('spinbutton',{name:'Fade out (sec)'}).fill('0.8')
 await page.locator('.sm-top-menu').first().locator('summary').click()
 const projectDownload=page.waitForEvent('download')
 await page.getByRole('button',{name:'Save project'}).click()
 const projectFile=await (await projectDownload).path()
 const document=JSON.parse(readFileSync(projectFile!,'utf8'))
 const clips=Object.values(document.clips).flat() as Array<{type:string;audio?:{fadeInSec?:number;fadeOutSec?:number}}>
 const sound=clips.find(c=>c.type==='audio')
 expect(sound?.audio?.fadeInSec).toBeCloseTo(.8)
 expect(sound?.audio?.fadeOutSec).toBeCloseTo(.8)
 await page.locator('.sm-top-menu').first().locator('summary').click()
 await page.locator('.elah-export-btn').click()
 await page.getByRole('button',{name:/360p/}).click()
 const download=page.waitForEvent('download',{timeout:120000})
 await page.getByRole('button',{name:'Export',exact:true}).last().click()
 const file=await (await download).path()
 const pcm=execFileSync('ffmpeg',['-v','error','-i',file!,'-map','0:a:0','-f','s16le','-ac','1','-ar','8000','pipe:1'],{maxBuffer:1000000})
 const rms=(at:number)=>{
  const start=Math.floor(at*8000)*2, end=Math.min(pcm.length,start+800*2)
  let sum=0;let count=0
  for(let p=start;p+1<end;p+=2){const v=pcm.readInt16LE(p)/32768;sum+=v*v;count++}
  return Math.sqrt(sum/Math.max(1,count))
 }
 const start=rms(.03),middle=rms(1.4),end=rms(2.88)
 console.log('FADE ENVELOPE:',{start,middle,end})
 expect(middle).toBeGreaterThan(.01)
 expect(start).toBeLessThan(middle*.45)
 expect(end).toBeLessThan(middle*.45)
})
