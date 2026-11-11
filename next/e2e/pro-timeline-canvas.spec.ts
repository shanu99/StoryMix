import {test,expect} from '@playwright/test'
import {join} from 'node:path'
import {readFileSync} from 'node:fs'

async function importVideo(page:any){
  await page.goto('/')
  await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-video.mp4'))
  await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
  await page.getByText('Video only',{exact:true}).click()
  await expect(page.getByText(/placed 1 clips/)).toBeVisible()
}
async function saveProject(page:any){
  const menu=page.locator('.sm-top-menu').first()
  if(await menu.getAttribute('open')===null)await menu.locator('summary').click()
  const download=page.waitForEvent('download')
  await page.getByRole('button',{name:'Save project'}).click()
  return JSON.parse(readFileSync((await (await download).path())!,'utf8'))
}

test('track arrangement moves tracks with native undo and retains clip lanes',async({page})=>{
  await importVideo(page)
  const original=await saveProject(page)
  const baseline=original.tracks.map((t:any)=>t.id)
  const clipId=(Object.values(original.clips).flat() as any[]).find(c=>c.type==='video').id
  await page.getByRole('button',{name:'Arrange tracks'}).click()
  const dialog=page.getByRole('dialog',{name:'Track arrangement'})
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button',{name:'Move Video Overlay up'}).click()
  const changed=await saveProject(page)
  expect(changed.tracks.map((t:any)=>t.id)).toEqual([baseline[1],baseline[0],...baseline.slice(2)])
  expect((Object.values(changed.clips).flat() as any[]).find(c=>c.id===clipId)).toBeTruthy()
  await page.getByRole('button',{name:'Undo'}).click()
  const restored=await saveProject(page)
  expect(restored.tracks.map((t:any)=>t.id)).toEqual(baseline)
  await dialog.getByRole('button',{name:'Add audio track'}).click()
  const added=await saveProject(page)
  expect(added.tracks.filter((t:any)=>t.kind==='audio')).toHaveLength(3)
})

test('canvas rotation uses live drag, persists and undoes without altering media trim',async({page})=>{
  await importVideo(page)
  await page.locator('[data-clip-type="video"]').first().click({position:{x:30,y:15}})
  const toolbar=page.getByTestId('visual-canvas-tools')
  await expect(toolbar).toBeVisible()
  const start=await saveProject(page)
  const initial=(Object.values(start.clips).flat() as any[]).find(c=>c.type==='video')
  const rotator=toolbar.getByRole('button',{name:'Rotate on canvas'})
  const box=await rotator.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2)
  await page.mouse.down()
  await page.mouse.move(box!.x+box!.width/2+110,box!.y+box!.height/2,{steps:7})
  await page.mouse.up()
  const transformed=await saveProject(page)
  const rotated=(Object.values(transformed.clips).flat() as any[]).find(c=>c.id===initial.id)
  expect(Math.abs(rotated.transform.rotation)).toBeGreaterThan(.5)
  expect(rotated.durationFrames).toBe(initial.durationFrames)
  expect(rotated.sourceStartFrame).toBe(initial.sourceStartFrame)
  await page.getByRole('button',{name:'Undo'}).click()
  const undone=await saveProject(page)
  const original=(Object.values(undone.clips).flat() as any[]).find(c=>c.id===initial.id)
  expect(Math.abs(original.transform?.rotation??0)).toBeLessThan(.05)
  await toolbar.getByRole('button',{name:'Canvas editing help'}).click()
  await expect(toolbar.getByRole('status')).toContainText('Choose Crop')
})

test('timeline zoom buttons change zoom without modifying project clips',async({page})=>{
  await importVideo(page)
  const before=await saveProject(page)
  const zoom=page.getByLabel('Timeline zoom controls')
  await expect(zoom).toBeVisible()
  await zoom.getByRole('button',{name:'Zoom in'}).click()
  await zoom.getByRole('button',{name:'Zoom out'}).click()
  const after=await saveProject(page)
  expect(after.clips).toEqual(before.clips)
})

test('dragging media near timeline edge auto-pans its scroll viewport',async({page})=>{
 await importVideo(page)
 const zoom=page.getByLabel('Timeline zoom controls')
 for(let i=0;i<8;i++)await zoom.getByRole('button',{name:'Zoom in'}).click()
 const positions=await page.evaluate(()=>{
  const root=document.querySelector('[data-elah-timeline-root]')!
  const viewport=Array.from(root.querySelectorAll<HTMLElement>('div')).find(el=>getComputedStyle(el).overflowX==='auto'&&el.clientWidth>0)!
  if(!viewport||viewport.scrollWidth<=viewport.clientWidth)throw Error('Timeline not horizontally scrollable')
  viewport.scrollLeft=0
  const rect=viewport.getBoundingClientRect()
  const lane=viewport.querySelector('[data-elah-lane]')??viewport
  const before=viewport.scrollLeft
  for(let i=0;i<5;i++)lane.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,
    clientX:rect.right-12,clientY:Math.min(rect.bottom-12,rect.top+40),dataTransfer:new DataTransfer()}))
  return {before,after:viewport.scrollLeft}
 })
 expect(positions.after).toBeGreaterThan(positions.before)
})

test('Ctrl multi-selection spans video and audio tracks and deletes as a single undo step',async({page})=>{
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-video.mp4'))
 await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
 await page.getByText('Video + Audio',{exact:true}).click()
 await expect(page.getByText(/Imported 1 files/)).toBeVisible()
 const video=page.locator('[data-clip-type="video"]').first()
 const audio=page.locator('[data-clip-type="audio"]').first()
 await video.click({position:{x:25,y:12}})
 await audio.click({modifiers:['Control'],position:{x:25,y:12}})
 await expect(video).toHaveAttribute('data-selected','true')
 await expect(audio).toHaveAttribute('data-selected','true')
 await page.getByRole('button',{name:'Delete',exact:true}).click()
 await expect(page.locator('[data-clip-type="video"]')).toHaveCount(0)
 await expect(page.locator('[data-clip-type="audio"]')).toHaveCount(0)
 await page.getByRole('button',{name:'Undo'}).click()
 await expect(page.locator('[data-clip-type="video"]')).toHaveCount(1)
 await expect(page.locator('[data-clip-type="audio"]')).toHaveCount(1)
})
