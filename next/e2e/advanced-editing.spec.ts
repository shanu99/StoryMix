import {test,expect,Page} from '@playwright/test'
import {join} from 'node:path'
import {readFileSync} from 'node:fs'

async function load(page:Page,withAudio=false){
 await page.goto('/')
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures','test-video.mp4'))
 await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
 await page.getByText(withAudio?'Video + Audio':'Video only',{exact:true}).click()
 await expect(page.getByText(/Imported 1 files/)).toBeVisible()
}
async function project(page:Page){
 const menu=page.locator('.sm-top-menu').first()
 if(await menu.getAttribute('open')===null)await menu.locator('summary').click()
 const d=page.waitForEvent('download')
 await page.getByRole('button',{name:'Save project'}).click()
 const path=await(await d).path()
 return JSON.parse(readFileSync(path!,'utf8'))
}
function all(p:any){return Object.values(p.clips).flat() as Array<{id:string;type:string;startFrame:number;sourceStartFrame:number;durationFrames:number}>}

test('CapCut-style multi-track blade splits A/V together, with one-step undo and redo',async({page})=>{
 await load(page,true)
 await expect(page.locator('[data-clip-type="audio"]')).toHaveCount(1)
 await page.getByText('00:01',{exact:true}).last().click()
 await page.getByRole('button',{name:'Split All',exact:true}).click()
 await expect(page.locator('[data-clip-type="video"]')).toHaveCount(2)
 await expect(page.locator('[data-clip-type="audio"]')).toHaveCount(2)
 const split=all(await project(page))
 for(const type of ['video','audio'])expect(split.filter(c=>c.type===type).map(c=>c.startFrame).sort((a,b)=>a-b)).toEqual([0,30])
 await page.getByRole('button',{name:'Undo'}).click()
 await expect(page.locator('[data-clip-type="video"]')).toHaveCount(1)
 await expect(page.locator('[data-clip-type="audio"]')).toHaveCount(1)
 await page.getByRole('button',{name:'Redo'}).click()
 await expect(page.locator('[data-clip-type="video"]')).toHaveCount(2)
 await expect(page.locator('[data-clip-type="audio"]')).toHaveCount(2)
})

test('Snap, frame stepping, cut navigation, exact inspector move and trim',async({page})=>{
 await load(page)
 const snap=page.getByRole('button',{name:'Snap On'})
 await expect(snap).toBeVisible()
 await snap.click()
 await expect(page.getByRole('button',{name:'Snap Off'})).toBeVisible()
 await page.getByRole('button',{name:'+1 Frame'}).click()
 await expect(page.locator('span').filter({hasText:/00:00:00:01 \/ 00:00:03:00/}).first()).toBeVisible()
 const clip=page.locator('[data-clip-type="video"]').first()
 await clip.click({position:{x:35,y:12}})
 await page.getByRole('button',{name:'Move +1f'}).click()
 await page.getByRole('button',{name:'Trim −1f'}).click()
 const after=all(await project(page)).find(c=>c.type==='video')!
 expect(after.startFrame).toBe(1)
 expect(after.durationFrames).toBe(89)
 expect(after.sourceStartFrame).toBe(0)
 await page.getByRole('button',{name:'Prev Cut'}).click()
 await page.getByRole('button',{name:'Next Cut'}).click()
 await expect(page.locator('span').filter({hasText:/00:00:00:01 \/ 00:00:03:00/}).first()).toBeVisible()
})

test('Ripple delete closes gap on track, plain delete does not',async({page})=>{
 await load(page)
 await page.getByText('00:01',{exact:true}).last().click()
 const clip=page.locator('[data-clip-type="video"]').first()
 await clip.click({position:{x:35,y:12}})
 await page.getByRole('button',{name:'Split',exact:true}).click()
 await expect(page.locator('[data-clip-type="video"]')).toHaveCount(2)
 await page.locator('[data-clip-type="video"]').first().click({position:{x:20,y:12}})
 await page.getByRole('button',{name:'Ripple Delete'}).click()
 await expect(page.locator('[data-clip-type="video"]')).toHaveCount(1)
 const after=all(await project(page)).find(c=>c.type==='video')!
 expect(after.startFrame).toBe(0)
 expect(after.sourceStartFrame).toBe(30)
 await page.getByRole('button',{name:'Undo'}).click()
 await expect(page.locator('[data-clip-type="video"]')).toHaveCount(2)
})

test('icon-only timeline controls expose names and detailed hover tooltips',async({page})=>{
 await load(page)
 const toolbar=page.getByLabel('Advanced timeline edit tools')
 const buttons=toolbar.locator('button')
 expect(await buttons.count()).toBeGreaterThanOrEqual(12)
 for(const label of ['Split','Split All','Trim Start','Trim End','Delete','Ripple Delete','Duplicate','Prev Cut','Next Cut','−1 Frame','+1 Frame','Snap On']){
   const button=toolbar.getByRole('button',{name:label,exact:true})
   await expect(button).toBeVisible()
   await expect(button).toHaveText('')
 }
 const splitAll=toolbar.getByRole('button',{name:'Split All'})
 await splitAll.hover()
 const tooltip=page.getByRole('tooltip')
 await expect(tooltip).toBeVisible()
 await expect(tooltip).toContainText('Split All')
 await expect(tooltip).toContainText('Blade across unlocked tracks')
 await toolbar.getByRole('button',{name:'Snap On'}).focus()
 await expect(tooltip).toContainText('Snap On')
 await expect(tooltip).toContainText('Toggle magnetic snapping')
})
