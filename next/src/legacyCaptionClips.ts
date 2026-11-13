import type {Clip} from '@elah/editor'
import {encodeCaptionForFont,type LegacyEncoding} from './legacyCaptionEncoding'

// This is presentation-only encoding: source Unicode is serialized into each
// generated clip's name so project save/load and switching fonts remain reversible.
const MARK='StoryMix Caption |'
const enc=(s:string)=>btoa(Array.from(new TextEncoder().encode(s),n=>String.fromCharCode(n)).join(''))
const dec=(s:string)=>new TextDecoder().decode(Uint8Array.from(atob(s),c=>c.charCodeAt(0)))
export type CaptionGroup={id:string;index:number;source:string}
export function captionGroup(clip:Clip):CaptionGroup|null{
 if(!clip.name?.startsWith(MARK))return null
 const parts=clip.name.slice(MARK.length).split('|')
 if(parts.length!==3)return null
 try{
  const index=Number(parts[1]),source=dec(parts[2])
  if(!Number.isInteger(index)||index<0||source.length>15000)return null
  return {id:parts[0],index,source}
 }catch{return null}
}
export function captionUnicode(clip:Clip):string{return captionGroup(clip)?.source??clip.content??''}
export function mainCaptionClips(clips:Clip[]):Clip[]{
 const seen=new Set<string>()
 return clips.filter(c=>{
  const group=captionGroup(c)
  if(!group)return true
  if(seen.has(group.id)||group.index!==0)return false
  seen.add(group.id);return true
 })
}
type Engine={
 batch:(fn:()=>void,label:string)=>void
 updateClip:(id:string,trackId:string,patch:Partial<Clip>)=>void
 removeClip:(id:string,trackId:string)=>void
 addTrack:(kind:'elements',opts:{name:string})=>{id:string}
 addClip:(opts:any)=>Clip
}
type Track={id:string;name:string;kind:string;locked?:boolean}
function isExtra(c:Clip,groupId:string){const g=captionGroup(c);return !!g&&g.id===groupId&&g.index!==0}
function fontWidth(context:CanvasRenderingContext2D,text:string,fontFamily:string,fontSize:number,weight:string):number{
 context.font=weight+' '+fontSize+'px "'+fontFamily+'"'
 return context.measureText(text).width
}
export function applyCaptionFont({
 engine,clip,allClips,tracks,font,encoding,stageWidth,stageHeight,sourceOverride
}:{
 engine:Engine;clip:Clip;allClips:Clip[];tracks:Track[];
 font:string;encoding:LegacyEncoding|null;stageWidth:number;stageHeight:number;sourceOverride?:string
}):{changed:boolean;unmapped:string[]}{
 const group=captionGroup(clip)
 const id=group?.id??crypto.randomUUID()
 const original=sourceOverride??captionUnicode(clip)
 const allGroup=group?allClips.filter(c=>captionGroup(c)?.id===id):[]
 const primary=allGroup.find(c=>captionGroup(c)?.index===0)??clip
 const siblings=allGroup.filter(c=>isExtra(c,id))
 if(!encoding){
  engine.batch(()=>{
   for(const extra of siblings)engine.removeClip(extra.id,extra.trackId)
   engine.updateClip(primary.id,primary.trackId,{name:'AI Caption',content:original,fontFamily:font})
  },'Restore Unicode caption')
  return {changed:true,unmapped:[]}
 }
 const {runs,unmapped}=encodeCaptionForFont(original,encoding)
 // One layer per Sinhala / English run. English never goes through FM/Isi glyphs.
 const surface=document.createElement('canvas')
 const ctx=surface.getContext('2d')
 if(!ctx)throw new Error('Canvas font measuring is unavailable.')
 const size=primary.fontSize??48,weight=primary.fontWeight??'bold'
 const lines:{kind:'unicode'|'legacy';text:string;row:number}[]=[]
 let row=0
 for(const run of runs){
  const bits=run.text.split('\n')
  for(let i=0;i<bits.length;i++){
   if(i>0)row++
   if(bits[i])lines.push({kind:run.kind,text:bits[i],row})
  }
 }
 if(!lines.length)throw new Error('Caption contains no text.')
 const maxRow=row
 const segments=lines.map(entry=>({
  ...entry,
  fontFamily:entry.kind==='legacy'?font:'Noto Sans Sinhala',
  width:fontWidth(ctx,entry.text,entry.kind==='legacy'?font:'Noto Sans Sinhala',size,weight)
 }))
 const byRow=new Map<number,typeof segments>()
 for(const segment of segments)byRow.set(segment.row,[...(byRow.get(segment.row)??[]),segment])
 const baseX=.5,baseY=.81
 const lineStep=(size*1.55)/stageHeight
 const patches:{content:string;fontFamily:string;x:number;y:number}[]=[]
 for(const [rowId,parts] of byRow){
  const total=parts.reduce((n,p)=>n+p.width,0)
  let left=baseX*stageWidth-total/2
  for(const part of parts){
   const x=(left+part.width/2)/stageWidth
   patches.push({content:part.text,fontFamily:part.fontFamily,x,y:baseY+(rowId-maxRow/2)*lineStep})
   left+=part.width
  }
 }
 // Restore first, then rebuild sibling layers. Overlay tracks are shared across
 // nonoverlapping captions, avoiding dozens of new tracks for each segment.
 engine.batch(()=>{
  for(const extra of siblings)engine.removeClip(extra.id,extra.trackId)
  const label=enc(original)
  const first=patches[0]
  engine.updateClip(primary.id,primary.trackId,{
   name:MARK+id+'|0|'+label,
   content:first.content,fontFamily:first.fontFamily,
   transform:{...primary.transform,x:first.x,y:first.y,scale:primary.transform?.scale??1,rotation:primary.transform?.rotation??0,anchor:{x:.5,y:.5}}
  })
  for(let i=1;i<patches.length;i++){
   const patch=patches[i]
   const existing=tracks.find(t=>t.kind==='elements'&&t.name==='Caption font layer '+i
    &&!t.locked&&!allClips.some(other=>other.trackId===t.id
     &&other.startFrame<primary.startFrame+primary.durationFrames
     &&other.startFrame+other.durationFrames>primary.startFrame
     &&!siblings.some(s=>s.id===other.id)))
   const track=existing??engine.addTrack('elements',{name:'Caption font layer '+i})
   engine.addClip({
    type:'text',trackId:track.id,startFrame:primary.startFrame,
    durationFrames:primary.durationFrames,name:MARK+id+'|'+i+'|'+label,
    text:{content:patch.content,fontFamily:patch.fontFamily,fontSize:size,color:primary.color??'#ffffff',fontWeight:weight,textAlign:'center'},
    transform:{...primary.transform,x:patch.x,y:patch.y,scale:primary.transform?.scale??1,rotation:primary.transform?.rotation??0,anchor:{x:.5,y:.5}}
   })
  }
 },'Apply '+encoding+' Sinhala caption font')
 return {changed:true,unmapped}
}
