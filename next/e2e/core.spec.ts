import {test,expect} from '@playwright/test';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
test('StoryMix core editor: loads media and offers timeline, editing, project, caption and export controls',async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await expect(page.getByText('StoryMix · Turn Moments Into Stories')).toBeVisible();
 await expect(page.getByRole('button',{name:'Import Media'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Open'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Save'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Import SRT'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Export SRT'})).toBeVisible();
 await expect(page.getByRole('button',{name:/Export/}).first()).toBeVisible();
 await expect(page.locator('canvas').first()).toBeVisible();
 const fixture=join(process.cwd(),'e2e','fixtures','test-video.mp4');
 await page.locator('input[aria-label="Choose video audio or image files"]').setInputFiles(fixture);
 await expect(page.getByText('This video has audio')).toBeVisible({timeout:20000});
 await page.getByText('Video + Audio',{exact:true}).click();
 await expect(page.getByText(/Imported 1 files/)).toBeVisible({timeout:20000});
 await expect(page.getByText(/placed 1 clips/)).toBeVisible({timeout:30000});
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save'}).click()]);
 expect(download.suggestedFilename()).toBe('StoryMix-project.json');
 const srt=`1
00:00:00,100 --> 00:00:01,200
හෙලෝ StoryMix!
`;
 await page.locator('input[accept=".srt,text/plain"]').setInputFiles({name:'captions.srt',mimeType:'text/plain',buffer:Buffer.from(srt)});
 await expect(page.getByText(/Imported 1 captions/)).toBeVisible();
 const [captionFile]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export SRT'}).click()]);
 expect(captionFile.suggestedFilename()).toBe('StoryMix-captions.srt');
 await page.locator('.elah-export-btn').click();
 await expect(page.getByText('Export Video')).toBeVisible();
 await page.getByRole('button',{name:/360p/}).click();
 const downloadPromise=page.waitForEvent('download',{timeout:150000});
 await page.getByRole('button',{name:'Export',exact:true}).click();
 await page.waitForTimeout(12000);
 console.log('EXPORT STATUS:',(await page.locator('body').innerText()).slice(0,2800));
 console.log('EXPORT PAGE ERRORS:',errors);
 const rendered=await downloadPromise;
 expect(rendered.suggestedFilename()).toMatch(/\\.mp4$/);
 const filepath=await rendered.path();
 expect(filepath).not.toBeNull();
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',filepath!],{encoding:'utf8'}));
 console.log('MP4 EXPORT:',probe.format?.duration,probe.streams?.map((x:any)=>x.codec_name));
 expect(probe.streams.some((stream:any)=>stream.codec_type==='video')).toBeTruthy();
 expect(Number(probe.format.duration)).toBeGreaterThan(2.5);
 expect(errors).toEqual([]);
});
