import test from 'node:test';import assert from 'node:assert/strict';import {createProject,addMedia,addClip,splitClip,moveClip,trimClip,removeClip,History,activeClips,serialize,deserialize,duration,rippleDelete,insertClip} from './editor-core.mjs';
const setup=()=>{let p=createProject();p=addMedia(p,{id:'media1',name:'clip.mp4',type:'video',duration:20});p=addClip(p,{id:'clip1',trackId:'video-1',mediaId:'media1',start:0,inPoint:2,length:10});return p};
test('project + media + clip + timeline duration',()=>{let p=setup();assert.equal(duration(p),10);assert.equal(activeClips(p,4)[0].sourceTime,6)});
test('split has correct source in point',()=>{let {project:p}=splitClip(setup(),'clip1',4);let [a,b]=p.tracks[0].clips;assert.equal(a.duration,4);assert.equal(b.start,4);assert.equal(b.inPoint,6);assert.equal(b.duration,6)});
test('move refuses overlaps',()=>{let p=setup();p=addClip(p,{id:'another',trackId:'video-1',mediaId:'media1',start:12,length:5});assert.throws(()=>moveClip(p,'another',{start:8}),/overlap/);assert.equal(moveClip(p,'another',{start:15}).tracks[0].clips[1].start,15)});
test('trim ends and starts',()=>{let p=trimClip(setup(),'clip1',{edge:'left',time:3});assert.equal(p.tracks[0].clips[0].inPoint,5);assert.equal(p.tracks[0].clips[0].duration,7);p=trimClip(p,'clip1',{edge:'right',time:8});assert.equal(p.tracks[0].clips[0].duration,5)});
test('remove and undo redo',()=>{let h=new History(setup());h.apply(p=>removeClip(p,'clip1'));assert.equal(h.current.tracks[0].clips.length,0);assert.equal(h.undo().tracks[0].clips.length,1);assert.equal(h.redo().tracks[0].clips.length,0)});
test('round-trip project serialization',()=>{assert.deepEqual(deserialize(serialize(setup())),setup())});
test('reject invalid media range',()=>{assert.throws(()=>addClip(setup(),{trackId:'video-1',mediaId:'media1',start:11,inPoint:19,length:2}),/exceeds/)});

test('ripple delete shifts later clips',()=>{let p=setup();p=addClip(p,{id:'second',trackId:'video-1',mediaId:'media1',start:12,length:4});let q=rippleDelete(p,'clip1');assert.equal(q.tracks[0].clips[0].start,2)});
test('insert pushes later clips',()=>{let p=setup();let q=insertClip(p,{id:'inserted',trackId:'video-1',mediaId:'media1',start:0,inPoint:0,length:2});assert.equal(q.tracks[0].clips.find(c=>c.id==='clip1').start,2)});
