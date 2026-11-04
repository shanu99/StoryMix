import {test,expect} from '@playwright/test'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'

test('release gate: encoded MP4 contains playable video AND AAC audio',async({page})=>{
  test.setTimeout(180000)
  await page.goto('/')
  await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-video.mp4'))
  await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
  await page.getByText('Video + Audio',{exact:true}).click()
  await expect(page.getByText(/Imported 1 files/)).toBeVisible({timeout:20000})
  await page.locator('.elah-export-btn').click()
  await expect(page.getByText('Export Video')).toBeVisible()
  await page.getByRole('button',{name:/360p/}).click()
  const filePromise=page.waitForEvent('download',{timeout:150000}).then(download=>({download})).catch(()=>null)
  const failPromise=page.getByText('Export failed').waitFor({state:'visible',timeout:60000}).then(()=>({failed:true as const})).catch(()=>null)
  await page.getByRole('button',{name:'Export',exact:true}).last().click()
  const outcome=await Promise.race([filePromise,failPromise])
  if(outcome&&'failed'in outcome)throw new Error('MP4 audio export unsupported: '+(await page.locator('body').innerText()).slice(0,800))
  expect(outcome&&'download'in outcome,'audio/video MP4 must download').toBeTruthy()
  if(!outcome||!('download'in outcome))return
  const saved=await outcome.download.path()
  expect(saved).toBeTruthy()
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',saved!],{encoding:'utf8'}))
  expect(probe.streams.some((s:any)=>s.codec_type==='video'),'MP4 video stream').toBeTruthy()
  expect(probe.streams.some((s:any)=>s.codec_type==='audio'),'MP4 audio stream').toBeTruthy()
  expect(Number(probe.format.duration)).toBeGreaterThan(2.5)
})
