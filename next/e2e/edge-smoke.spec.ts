import {test,expect} from '@playwright/test'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'

test.use({channel:'msedge'})
test('Microsoft Edge: import media, play, seek and export real MP4',async({page})=>{
 test.setTimeout(130000)
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-video.mp4'))
 await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
 await page.getByText('Video + Audio',{exact:true}).click()
 await expect(page.getByText(/Imported 1 files/)).toBeVisible()
 const transport=page.locator('button[title="Play / Pause (Space)"]')
 await transport.click()
 await expect(transport).toHaveText('⏸')
 await transport.click()
 await expect(transport).toHaveText('▶')
 await page.getByText('00:01',{exact:true}).last().click()
 await page.locator('.elah-export-btn').click()
 await page.getByRole('button',{name:/360p/}).click()
 const dl=page.waitForEvent('download',{timeout:105000})
 await page.getByRole('button',{name:'Export',exact:true}).last().click()
 const file=await(await dl).path()
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',file!],{encoding:'utf8'}))
 expect(probe.streams.some((s:any)=>s.codec_name==='h264')).toBeTruthy()
 expect(probe.streams.some((s:any)=>s.codec_name==='aac')).toBeTruthy()
})
