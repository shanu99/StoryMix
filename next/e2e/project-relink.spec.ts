import {test,expect} from '@playwright/test'
import {join} from 'node:path'

test('project JSON can be reopened after reload and original video relinked',async({page})=>{
  await page.goto('/')
  const video=join(process.cwd(),'e2e','fixtures','test-video.mp4')
  await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(video)
  await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000})
  await page.getByText('Video only',{exact:true}).click()
  await expect(page.getByText(/placed 1 clips/)).toBeVisible()
  await page.locator('.sm-top-menu').first().locator('summary').click()
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  const savedPromise=page.waitForEvent('download',{timeout:6000}).catch(()=>null)
  await page.getByRole('button',{name:'Save project'}).click()
  console.log('SAVE UI DIAG:',(await page.locator('body').innerText()).slice(0,1200),'PAGE ERRORS:',errors)
  const saved=await savedPromise
  expect(saved,'Save should trigger JSON download').not.toBeNull()
  if(!saved)return
  expect(saved.suggestedFilename()).toBe('StoryMix-project.json')
  const file=await saved.path()
  expect(file).toBeTruthy()
  await page.reload()
  await page.locator('input[accept=".json"]').setInputFiles(file!)
  await expect(page.getByText(/Project loaded. Relink 1 local media files/)).toBeVisible({timeout:15000})
  await expect(page.getByRole('button',{name:'Relink (1)'})).toBeVisible()
  await page.locator('input[aria-label="Relink original media files"]').setInputFiles(video)
  const audioChoice=page.getByText('This video has audio')
  if(await audioChoice.isVisible({timeout:5000}).catch(()=>false))await page.getByText('Video only',{exact:true}).click()
  await expect(page.getByText(/Relinked 1 clips/)).toBeVisible({timeout:20000})
  await expect(page.getByRole('button',{name:'Relink (1)'})).toHaveCount(0)
})
