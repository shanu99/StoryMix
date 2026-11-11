import {test,expect} from '@playwright/test'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'

for (const scenario of [{name:'native-capable browser',url:'/',force:false},{name:'forced FFmpeg WebAssembly fallback',url:'/?forceWasmExport=1',force:true}]) {
test(`release gate: ${scenario.name} produces playable H.264/AAC MP4`,async({page})=>{
  test.setTimeout(180000)
  const ffmpegAssets:string[]=[]
  page.on('response',response=>{if(response.url().includes('/ffmpeg/ffmpeg-core.'))ffmpegAssets.push(response.url())})
  await page.goto(scenario.url)
  await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-video.mp4'))
  await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
  await page.getByText('Video + Audio',{exact:true}).click()
  await expect(page.getByText(/Imported 1 files/)).toBeVisible({timeout:20000})
  const srt = `1\n00:00:00,200 --> 00:00:02,300\nසිංහල StoryMix\n`
  await page.locator('input[accept=".srt,text/plain"]').setInputFiles({name:'sinhala.srt',mimeType:'text/plain',buffer:Buffer.from(srt)})
  await expect(page.getByText(/Imported 1 captions/)).toBeVisible()
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
  const video=probe.streams.find((s:any)=>s.codec_type==='video')
  const audio=probe.streams.find((s:any)=>s.codec_type==='audio')
  expect(video?.codec_name,'H.264 output').toBe('h264')
  expect(audio?.codec_name,'AAC output').toBe('aac')
  expect(Number(probe.format.duration)).toBeGreaterThan(2.5)
  expect(Number(probe.format.duration)).toBeLessThan(3.2)
  expect(Math.abs(Number(audio.start_time)),'audio/video timeline sync').toBeLessThan(.15)
  const pcm=execFileSync('ffmpeg',['-v','error','-i',saved!,'-map','0:a:0','-f','s16le','-ac','1','-ar','8000','pipe:1'],{maxBuffer:1500000})
  let squared=0
  for(let i=0;i<pcm.length-1;i+=2){const n=pcm.readInt16LE(i)/32768;squared+=n*n}
  const rms=Math.sqrt(squared/Math.max(1,pcm.length/2))
  console.log('AUDIO/VIDEO MP4:',video.codec_name,audio.codec_name,'duration:',probe.format.duration,'audio RMS:',rms.toFixed(4))
  expect(rms,'actual audible sound, not an empty/silent track').toBeGreaterThan(.003)
  if(scenario.force){
    expect(ffmpegAssets.some(url=>url.endsWith('ffmpeg-core.js')),'WASM JS core loaded').toBeTruthy()
    expect(ffmpegAssets.some(url=>url.endsWith('ffmpeg-core.wasm')),'WASM binary loaded').toBeTruthy()
  }
})
}
