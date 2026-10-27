import test from 'node:test';import assert from 'node:assert/strict';import {parseSrt,toSrt} from './subtitles.mjs';
test('Unicode Sinhala subtitles roundtrip',()=>{const text='1\n00:00:01,000 --> 00:00:02,400\nආයුබෝවන්!\n\n2\n00:00:03,000 --> 00:00:04,500\nHello!\n';let parsed=parseSrt(text);assert.equal(parsed.length,2);assert.equal(parsed[0].text,'ආයුබෝවන්!');assert.equal(parsed[0].end,2.4);assert.deepEqual(parseSrt(toSrt(parsed)),parsed)});
test('reject reversed subtitle timestamps',()=>{assert.throws(()=>parseSrt('1\n00:00:04,000 --> 00:00:01,000\nError'),/Invalid subtitle range/)});
