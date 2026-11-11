import {test,expect} from '@playwright/test'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
test('12-second real timeline exports playable H.264 and non-silent AAC at 480p',async({page})=>{
 test.setTimeout(180000)
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-long.mp4'))
 await expect(page.getByText('This video has audio')).toBeVisible({timeout:25000})
 await page.getByText('Video + Audio',{exact:true}).click()
 await expect(page.getByText(/Imported 1 files/)).toBeVisible({timeout:25000})
 await page.locator('.elah-export-btn').click()
 await page.getByRole('button',{name:/480p/}).click()
 const download=page.waitForEvent('download',{timeout:150000})
 await page.getByRole('button',{name:'Export',exact:true}).last().click()
 const result=await download
 const file=await result.path()
 expect(file).toBeTruthy()
 const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file!],{encoding:'utf8'}))
 expect(info.streams.find((s:any)=>s.codec_type==='video')?.codec_name).toBe('h264')
 const audio=info.streams.find((s:any)=>s.codec_type==='audio')
 expect(audio?.codec_name).toBe('aac')
 expect(Number(info.format.duration)).toBeGreaterThan(11.5)
 expect(Number(info.format.duration)).toBeLessThan(12.5)
 expect(Math.abs(Number(audio.start_time))).toBeLessThan(.2)
 const pcm=execFileSync('ffmpeg',['-v','error','-i',file!,'-map','0:a:0','-t','1','-f','s16le','-ac','1','-ar','8000','pipe:1'])
 let sum=0
 for(let i=0;i<pcm.length-1;i+=2)sum+=(pcm.readInt16LE(i)/32768)**2
 expect(Math.sqrt(sum/(pcm.length/2))).toBeGreaterThan(.003)
})
