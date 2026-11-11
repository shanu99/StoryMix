import {test,expect,Page} from '@playwright/test'
import {join} from 'node:path'
import {readFileSync} from 'node:fs'

async function addVideo(page:Page) {
  await page.goto('/')
  await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-video.mp4'))
  await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
  await page.getByText('Video only',{exact:true}).click()
  await expect(page.locator('[data-clip-type="video"]')).toHaveCount(1)
  await page.locator('[data-clip-type="video"]').first().click({position:{x:40,y:12}})
}
async function snapshot(page:Page) {
  const menu=page.locator('.sm-top-menu').first()
  if((await menu.getAttribute('open'))===null)await menu.locator('summary').click()
  const download=page.waitForEvent('download')
  await page.getByRole('button',{name:'Save project'}).click()
  const file=await(await download).path()
  const project=JSON.parse(readFileSync(file!,'utf8'))
  return Object.values(project.clips).flat().filter((c:any)=>c.type==='video') as Array<{id:string;type:string;startFrame:number;durationFrames:number;sourceStartFrame:number}>
}

test('CapCut-style trim to playhead preserves original media and supports undo',async({page})=>{
  await addVideo(page)
  await page.getByText('00:01',{exact:true}).last().click()
  await page.getByRole('button',{name:'Trim Start'}).click()
  let clips=await snapshot(page)
  expect(clips).toHaveLength(1)
  expect(clips[0].startFrame).toBeGreaterThanOrEqual(29)
  expect(clips[0].startFrame).toBeLessThanOrEqual(31)
  expect(clips[0].sourceStartFrame).toBeGreaterThan(0)
  expect(clips[0].durationFrames).toBeLessThan(90)
  await page.getByText('00:02',{exact:true}).last().click()
  await page.getByRole('button',{name:'Trim End'}).click()
  clips=await snapshot(page)
  expect(clips[0].durationFrames).toBeGreaterThanOrEqual(29)
  expect(clips[0].durationFrames).toBeLessThanOrEqual(31)
  await page.getByRole('button',{name:'Undo'}).click()
  clips=await snapshot(page)
  expect(clips[0].durationFrames).toBeGreaterThan(31)
})

test('Duplicate insert, ripple delete and one-step undo keep timeline contiguous',async({page})=>{
  await addVideo(page)
  await page.getByRole('button',{name:'Duplicate'}).click()
  await expect(page.locator('[data-clip-type="video"]')).toHaveCount(2)
  let clips=(await snapshot(page)).sort((a,b)=>a.startFrame-b.startFrame)
  expect(clips[0].startFrame).toBe(0)
  expect(clips[1].startFrame).toBe(clips[0].durationFrames)
  await page.locator('[data-clip-type="video"]').first().click({position:{x:40,y:12}})
  await page.getByRole('button',{name:'Ripple Delete'}).click()
  await expect(page.locator('[data-clip-type="video"]')).toHaveCount(1)
  clips=await snapshot(page)
  expect(clips[0].startFrame).toBe(0)
  await page.getByRole('button',{name:'Undo'}).click()
  clips=(await snapshot(page)).sort((a,b)=>a.startFrame-b.startFrame)
  expect(clips).toHaveLength(2)
  expect(clips[1].startFrame).toBe(clips[0].durationFrames)
  await page.getByRole('button',{name:'Redo'}).click()
  clips=await snapshot(page)
  expect(clips).toHaveLength(1)
  expect(clips[0].startFrame).toBe(0)
})

test('Keyboard shortcuts ignore text input and trigger editor actions on selected clip',async({page})=>{
  await addVideo(page)
  await page.getByText('00:01',{exact:true}).last().click()
  await page.keyboard.press('q')
  let clips=await snapshot(page)
  expect(clips[0].startFrame).toBeGreaterThan(0)
  await page.keyboard.press('Control+d')
  await expect(page.locator('[data-clip-type="video"]')).toHaveCount(2)
  await page.locator('[data-clip-type="video"]').first().click({position:{x:25,y:12}})
  await page.keyboard.press('Shift+Delete')
  await expect(page.locator('[data-clip-type="video"]')).toHaveCount(1)
})
