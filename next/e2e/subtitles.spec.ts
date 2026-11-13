import {test,expect} from '@playwright/test'
import {parseSrt,writeSrt} from '../src/subtitles'

test('Sinhala Unicode subtitles survive CRLF, BOM, multiline and SRT round trip',()=>{
  const input='\uFEFF1\r\n00:00:00,200 --> 00:00:02,300\r\nසිංහල StoryMix\r\nදෙවැනි පේළිය\r\n\r\n2\r\n00:00:02.400 --> 00:00:03.000\r\nහෙලෝ!\r\n'
  const parsed=parseSrt(input)
  expect(parsed).toHaveLength(2)
  expect(parsed[0]).toEqual({start:.2,end:2.3,text:'සිංහල StoryMix\nදෙවැනි පේළිය'})
  expect(parseSrt(writeSrt(parsed))).toEqual(parsed)
})
test('rejects invalid timing and caption abuse',()=>{
 expect(()=>parseSrt('1\n00:99:00,000 --> 00:99:01,000\ntext')).toThrow(/Invalid SRT timestamp/)
 expect(()=>parseSrt('1\n00:00:02,000 --> 00:00:01,000\ntext')).toThrow(/Invalid subtitle duration/)
 expect(()=>parseSrt('x'.repeat(5*1024*1024+1))).toThrow(/safety limit/)
})
