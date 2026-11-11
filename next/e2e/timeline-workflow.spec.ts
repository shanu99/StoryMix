import {test,expect,Page} from '@playwright/test'
import {join} from 'node:path'
import {readFileSync} from 'node:fs'

async function save(page:Page){
 const menu=page.locator('.sm-top-menu').first()
 if((await menu.getAttribute('open'))===null)await menu.locator('summary').click()
 const event=page.waitForEvent('download')
 await page.getByRole('button',{name:'Save project'}).click()
 const file=await (await event).path()
 return JSON.parse(readFileSync(file!,'utf8'))
}

test('video timeline supports drag to overlay track, trim, delete, undo and redo',async({page})=>{
 await page.goto('/')
 const fixture=join(process.cwd(),'e2e','fixtures','test-video.mp4')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(fixture)
 await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
 await page.getByText('Video only',{exact:true}).click()
 await expect(page.getByText(/placed 1 clips/)).toBeVisible()
 const clip=page.locator('[data-clip-type="video"]').first()
 await expect(clip).toBeVisible()
 const lanes=page.locator('[data-elah-lane][data-track-kind="video"]')
 await expect(lanes).toHaveCount(2)
 const dest=await lanes.nth(1).boundingBox(),box=await clip.boundingBox()
 expect(dest).toBeTruthy();expect(box).toBeTruthy()
 if(!dest||!box)return
 const startX=box.x+Math.min(45,box.width/2),startY=box.y+box.height/2
 await page.mouse.move(startX,startY)
 await page.mouse.down()
 await page.mouse.move(startX+145,dest.y+dest.height/2,{steps:12})
 await page.mouse.up()
 const afterMove=await save(page)
 const moved=Object.values(afterMove.clips).flat() as Array<{type:string;startFrame:number;trackId:string;durationFrames:number}>
 const movedVideo=moved.find(c=>c.type==='video')!
 expect(movedVideo.startFrame).toBeGreaterThan(0)
 expect(movedVideo.trackId).toBe(afterMove.tracks.filter((t:{kind:string})=>t.kind==='video')[1].id)
 const movedClip=page.locator('[data-clip-type="video"]').first()
 await movedClip.click({position:{x:Math.min(40,(await movedClip.boundingBox())!.width/2),y:12}})
 const before=await movedClip.boundingBox()
 expect(before).toBeTruthy()
 if(!before)return
 const handle=movedClip.locator('.elah-trim-handle-right')
 await expect(handle).toBeVisible()
 const hb=await handle.boundingBox()
 if(!hb)return
 await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2)
 await page.mouse.down()
 await page.mouse.move(hb.x+hb.width/2-50,hb.y+hb.height/2,{steps:8})
 await page.mouse.up()
 const afterTrim=await save(page)
 const trimmed=(Object.values(afterTrim.clips).flat() as Array<{type:string;durationFrames:number}>).find(c=>c.type==='video')!
 expect(trimmed.durationFrames).toBeLessThan(movedVideo.durationFrames)
 await page.getByRole('button',{name:'Delete clip'}).click()
 await expect(page.locator('[data-clip-type="video"]')).toHaveCount(0)
 await page.getByRole('button',{name:'Undo'}).click()
 await expect(page.locator('[data-clip-type="video"]')).toHaveCount(1)
 await page.getByRole('button',{name:'Redo'}).click()
 await expect(page.locator('[data-clip-type="video"]')).toHaveCount(0)
})

test('preview transport Play/Pause and timeline seek work on real media',async({page})=>{
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-video.mp4'))
 await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
 await page.getByText('Video only',{exact:true}).click()
 await expect(page.getByText(/placed 1 clips/)).toBeVisible()
 const play=page.getByRole('button',{name:'Play / Pause (Space)'})
 await expect(play).toBeVisible()
 await play.click()
 await expect(play).toHaveText('⏸')
 await page.waitForTimeout(400)
 await play.click()
 await expect(play).toHaveText('▶')
 await page.getByText('00:01',{exact:true}).last().click()
 const transport=page.locator('span').filter({hasText:/00:00:01:\d\d \/ 00:00:03:00/}).first()
 await expect(transport).toBeVisible({timeout:10000})
})
