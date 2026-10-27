// StoryMix timeline/project model. No dependencies. Video processing lives in render adapters.
export const VERSION = 1;
export const TYPES = Object.freeze(['video','audio','text','caption','effect']);
export function createProject({name='Untitled Project',fps=30,width=1920,height=1080}={}){
 return {version:VERSION,name,settings:{fps,width,height},tracks:[
  {id:'video-1',type:'video',name:'Video 1',muted:false,locked:false,clips:[]},
  {id:'text-1',type:'text',name:'Text',muted:false,locked:false,clips:[]},
  {id:'caption-1',type:'caption',name:'Captions',muted:false,locked:false,clips:[]},
  {id:'audio-1',type:'audio',name:'Voice',muted:false,locked:false,clips:[]},
  {id:'audio-2',type:'audio',name:'Music',muted:false,locked:false,clips:[]}
 ],media:[],updatedAt:new Date().toISOString()};
}
const copy=p=>structuredClone(p);
const locate=(p,id)=>{for(const t of p.tracks){const i=t.clips.findIndex(c=>c.id===id);if(i!==-1)return {track:t,index:i,clip:t.clips[i]}}throw Error('Clip not found: '+id)};
const track=(p,id)=>{const t=p.tracks.find(x=>x.id===id);if(!t)throw Error('Track not found: '+id);if(t.locked)throw Error('Track is locked');return t};
const check=n=>{if(!Number.isFinite(n)||n<0)throw Error('Invalid time');return n};
export function duration(p){return Math.max(0,...p.tracks.flatMap(t=>t.clips.map(c=>c.start+c.duration)))}
export function addTrack(p,{id=crypto.randomUUID(),name='Track',type='video'}={}){if(!TYPES.includes(type))throw Error('Invalid type');const q=copy(p);if(q.tracks.some(t=>t.id===id))throw Error('Duplicate track');q.tracks.push({id,name,type,muted:false,locked:false,clips:[]});return q}
export function addMedia(p,{id=crypto.randomUUID(),name,type,duration:seconds,metadata={}}){const q=copy(p);check(seconds);if(!name||!['video','audio','image'].includes(type))throw Error('Invalid media');if(q.media.some(m=>m.id===id))throw Error('Duplicate media');q.media.push({id,name,type,duration:seconds,metadata});return q}
export function addClip(p,{id=crypto.randomUUID(),trackId,mediaId=null,start=0,inPoint=0,length,text='',style={}}){
 const q=copy(p),t=track(q,trackId);check(start);check(inPoint);if(!Number.isFinite(length)||length<=0)throw Error('Invalid duration');
 if(t.type==='video'||t.type==='audio'){let m=q.media.find(x=>x.id===mediaId);if(!m)throw Error('Media not found');if(inPoint+length>m.duration+0.00001)throw Error('Clip exceeds source duration')}
 if(t.clips.some(c=>Math.max(c.start,start)<Math.min(c.start+c.duration,start+length)-0.00001))throw Error('Clips overlap on track');
 if(q.tracks.some(x=>x.clips.some(c=>c.id===id)))throw Error('Duplicate clip');
 t.clips.push({id,mediaId,start,inPoint,duration:length,text,style:{...style},speed:1,volume:1,enabled:true});t.clips.sort((a,b)=>a.start-b.start);return q
}
export function moveClip(p,id,{trackId,start}){let q=copy(p),from=locate(q,id),dest=track(q,trackId??from.track.id);if(dest.type!==from.track.type)throw Error('Track type mismatch');check(start);if(from.track.locked)throw Error('Track is locked');let c=from.track.clips.splice(from.index,1)[0];if(dest.clips.some(other=>Math.max(start,other.start)<Math.min(start+c.duration,other.start+other.duration)-0.00001))throw Error('Clips overlap');c.start=start;dest.clips.push(c);dest.clips.sort((a,b)=>a.start-b.start);return q}
export function trimClip(p,id,{edge,time}){const q=copy(p),r=locate(q,id);if(r.track.locked)throw Error('Track is locked');check(time);let c=r.clip,finish=c.start+c.duration;if(edge==='left'){let delta=time-c.start;if(time>=finish||c.inPoint+delta<0)throw Error('Invalid left trim');c.start=time;c.inPoint+=delta;c.duration-=delta}else if(edge==='right'){let d=time-c.start;if(d<=0)throw Error('Invalid right trim');let m=q.media.find(x=>x.id===c.mediaId);if(m&&c.inPoint+d>m.duration+0.00001)throw Error('Trim exceeds media');c.duration=d}else throw Error('Invalid edge');if(r.track.clips.some(x=>x!==c&&Math.max(c.start,x.start)<Math.min(c.start+c.duration,x.start+x.duration)-0.00001))throw Error('Clips overlap');return q}
export function splitClip(p,id,time){let q=copy(p),r=locate(q,id),c=r.clip;if(r.track.locked)throw Error('Track is locked');if(time<=c.start||time>=c.start+c.duration)throw Error('Split outside clip');let second={...c,id:crypto.randomUUID(),start:time,inPoint:c.inPoint+(time-c.start)*c.speed,duration:c.duration-(time-c.start),style:{...c.style}};c.duration=time-c.start;r.track.clips.splice(r.index+1,0,second);return {project:q,newId:second.id}}
export function removeClip(p,id){let q=copy(p),r=locate(q,id);if(r.track.locked)throw Error('Track is locked');r.track.clips.splice(r.index,1);return q}
export function setTrack(p,id,patch){let q=copy(p),t=q.tracks.find(x=>x.id===id);if(!t)throw Error('Track not found');for(const key of ['name','locked','muted'])if(Object.hasOwn(patch,key))t[key]=patch[key];return q}
export function patchClip(p,id,patch){let q=copy(p),r=locate(q,id);if(r.track.locked)throw Error('Track is locked');const allowed=['text','style','volume','enabled','speed','fadeIn','fadeOut','filter','transform'];for(const k of allowed)if(Object.hasOwn(patch,k))r.clip[k]=patch[k];if(r.clip.volume<0||r.clip.volume>2)throw Error('Invalid volume');if(r.clip.speed!==undefined&&(!Number.isFinite(r.clip.speed)||r.clip.speed<.25||r.clip.speed>4))throw Error('Invalid clip speed');return q}
export function activeClips(p,time){return p.tracks.filter(t=>!t.muted).flatMap(t=>t.clips.filter(c=>c.enabled&&time>=c.start&&time<c.start+c.duration).map(c=>({trackId:t.id,trackType:t.type,...c,sourceTime:c.inPoint+(time-c.start)*c.speed})))}
export function serialize(p){return JSON.stringify(p)}
export function deserialize(s){let p=JSON.parse(s);if(p.version!==VERSION||!Array.isArray(p.tracks)||!Array.isArray(p.media))throw Error('Unsupported project');return p}
export class History {constructor(project=createProject(),limit=100){this.states=[copy(project)];this.index=0;this.limit=limit}get current(){return copy(this.states[this.index])}apply(fn){let next=fn(this.current);this.states=this.states.slice(0,this.index+1);this.states.push(copy(next));if(this.states.length>this.limit)this.states.shift();this.index=this.states.length-1;return this.current}undo(){this.index=Math.max(0,this.index-1);return this.current}redo(){this.index=Math.min(this.states.length-1,this.index+1);return this.current}}

/** Ripple-remove one clip and shift following clips on that track left. */
export function rippleDelete(p,id){
 let q=copy(p),r=locate(q,id);if(r.track.locked)throw Error('Track is locked');
 const {start,duration:removed}=r.clip;r.track.clips.splice(r.index,1);
 for(const c of r.track.clips)if(c.start>=start+removed-0.00001)c.start=Math.max(0,c.start-removed);
 return q;
}
/** Insert a clip into an occupied track by pushing all later clips. */
export function insertClip(p,details){
 const q=copy(p),t=track(q,details.trackId),start=check(details.start??0),length=details.length;
 if(!Number.isFinite(length)||length<=0)throw Error('Invalid duration');
 const overlapping=t.clips.some(c=>c.start<start&&c.start+c.duration>start+0.00001);
 if(overlapping)throw Error('Split the existing clip before inserting here');
 for(const c of t.clips)if(c.start>=start)c.start+=length;
 return addClip(q,details);
}
