import test from 'node:test';import assert from 'node:assert/strict';import {extractPeaks,waveformSvg} from './waveform.mjs';
test('waveform captures amplitudes',()=>{let samples=Float32Array.from([0,.5,-1,.25,0,0,.4,-.8]);let b={length:samples.length,numberOfChannels:1,getChannelData:()=>samples};let p=extractPeaks(b,4);assert.equal(p.length,4);assert.equal(p[0],.5);assert.equal(p[1],1);assert.equal(p[2],0);assert.ok(Math.abs(p[3]-.8)<1e-5);});
test('waveform rejects empty audio buffer',()=>assert.throws(()=>extractPeaks({length:0,numberOfChannels:1}),/Invalid/));
test('waveform svg outputs bars',()=>{let svg=waveformSvg([0,.5,1],{width:90,height:20});assert.ok(svg.includes('<svg'));assert.equal((svg.match(/<rect /g)||[]).length,3)});
