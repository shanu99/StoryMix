import {test,expect} from '@playwright/test'
import {join} from 'node:path'

for(const file of [{name:'test-audio.wav',kind:'audio'},{name:'test-image.png',kind:'image'}]){
 test('media import: '+file.kind+' is inserted as a real timeline clip',async({page})=>{
  await page.goto('/')
  const errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(join(process.cwd(),'e2e','fixtures',file.name))
  await expect(page.getByText(/Imported 1 files, placed 1 clips/)).toBeVisible({timeout:25000})
  await expect(page.locator('[data-clip-type="'+file.kind+'"]').first()).toBeVisible()
  expect(errors).toEqual([])
 })
}
