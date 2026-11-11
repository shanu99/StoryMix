import {useMemo,useState,type CSSProperties} from 'react'
import {useSelectionStore,useTracksStore,useTimelineEngine,usePlaybackStore,useMediaLibraryStore,type Clip} from '@elah/editor'
import {createEffect,getEffectDefinition,effectsFor,applyEffectPreset,setKeyframe,removeKeyframe,detachClipAudio,reattachClipAudio,canReattachAudio} from '@elah/core-next'

const base:CSSProperties={fontSize:12,color:'#e7f4ff'}
const control:CSSProperties={background:'#172a3b',color:'#e7f4ff',border:'1px solid #355065',borderRadius:7,padding:'8px 9px',maxWidth:'100%'}
const button:CSSProperties={...control,cursor:'pointer',textAlign:'left'}
const outer:CSSProperties={padding:'9px 10px',display:'flex',flexDirection:'column',gap:12,...base}
const heading:CSSProperties={color:'#85d6f8',letterSpacing:'.08em',fontSize:10,fontWeight:750}
const note:CSSProperties={fontSize:11,color:'#9cb6c7',lineHeight:1.55}
type Pane='Effects'|'Filters'|'Transitions'|'Audio'|'Keyframes'

function useClip(){
 const ids=useSelectionStore(s=>s.selectedClipIds)
 const clips=useTracksStore(s=>s.clips)
 const clip=ids.size===1?Object.values(clips).flat().find(c=>ids.has(c.id)):undefined
 return clip
}
const kinds=['fade','slide','wipe','zoom','spin','whip','glitchCut','warpDissolve','lumaWipe'] as const
const pretty=(s:string)=>s.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase())
const visual=(clip:Clip)=>['video','image','text','shape','freehand','adjustment','generator','sequence'].includes(clip.type)

function MiniField({label,value,onChange,min,max,step=.01}:{label:string;value:number;onChange:(v:number)=>void;min?:number;max?:number;step?:number}){
 return <label style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,fontSize:11,color:'#bad4e7'}}>
  <span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={step} value={Number(value.toFixed(3))}
   onChange={e=>{const v=Number(e.target.value);if(Number.isFinite(v))onChange(Math.max(min??-Infinity,Math.min(max??Infinity,v)))}} style={{...control,width:89,padding:'5px 7px',fontSize:11}}/>
 </label>
}
function FxEditors({clip}:{clip:Clip}){
 const engine=useTimelineEngine()
 const active=clip.effects??[]
 const add=(kind:string,preset?:string)=>engine.updateClip(clip.id,clip.trackId,{effects:[...active,createEffect(kind,preset)]})
 const change=(id:string,patch:Partial<(typeof active)[number]>)=>engine.updateClip(clip.id,clip.trackId,{effects:active.map(f=>f.id===id?{...f,...patch}:f)})
 const remove=(id:string)=>engine.updateClip(clip.id,clip.trackId,{effects:active.filter(f=>f.id!==id)})
 const presets=effectsFor(clip.type)
 return <div style={outer}>
  <span style={heading}>LIVE RENDERED EFFECT STACK</span>
  <p style={note}>Effects apply to both preview and final export. Select a clip on the timeline, then add or adjust a layer.</p>
  {active.map(f=>{
   const definition=getEffectDefinition(f.kind)
   return <div key={f.id} style={{padding:10,border:'1px solid #344f63',borderRadius:9,display:'grid',gap:9}}>
    <div style={{display:'flex',gap:6,alignItems:'center'}}>
     <label style={{flex:1,fontWeight:650}}><input aria-label={'Enable '+f.kind} type="checkbox" checked={f.enabled!==false} onChange={e=>change(f.id,{enabled:e.target.checked})}/> {definition?.label??f.kind}</label>
     <button type="button" aria-label={'Remove '+f.kind} style={button} onClick={()=>remove(f.id)}>×</button>
    </div>
    {definition?.presets?.length?<select aria-label={'Preset for '+f.kind} value={f.preset??''} style={control} onChange={e=>{if(e.target.value)change(f.id,applyEffectPreset(f,e.target.value))}}>
      <option value="">Custom parameters</option>{definition.presets.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
    </select>:null}
    {Object.entries(definition?.params??{}).map(([key,def])=>{
      const value=f.params[key]??def.default
      const set=(v:number|string|boolean)=>change(f.id,{params:{...f.params,[key]:v},preset:undefined})
      if(def.type==='boolean')return <label key={key} style={note}><input type="checkbox" checked={Boolean(value)} onChange={e=>set(e.target.checked)}/> {def.label}</label>
      if(def.type==='color')return <label key={key} style={{...note,display:'flex',justifyContent:'space-between'}}>{def.label}<input aria-label={def.label} type="color" value={String(value)} onChange={e=>set(e.target.value)}/></label>
      if(def.type==='enum')return <label key={key} style={{...note,display:'grid',gap:5}}>{def.label}<select style={control} value={String(value)} onChange={e=>set(e.target.value)}>{def.options?.map(o=><option key={o}>{o}</option>)}</select></label>
      if(def.type==='number')return <MiniField key={key} label={def.label} min={def.min} max={def.max} step={def.step??.01} value={Number(value)} onChange={set}/>
      return null
    })}
   </div>
  })}
  <span style={heading}>ADD EFFECT</span>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
   {presets.filter(f=>!['text','generator','audio'].includes(f.category)).map(f=><button type="button" key={f.kind} onClick={()=>add(f.kind)} style={{...button,fontSize:11}} title={'Apply '+f.label}>{f.label}</button>)}
  </div>
 </div>
}
function FilterPicker({clip}:{clip:Clip}){
 const engine=useTimelineEngine()
 const color=clip.effects?.find(f=>f.kind==='colorGrade')
 const apply=(preset:string)=> {
  const effect=color?applyEffectPreset(color,preset):createEffect('colorGrade',preset)
  engine.updateClip(clip.id,clip.trackId,{effects:color?(clip.effects??[]).map(f=>f.id===color.id?effect:f):[...(clip.effects??[]),effect]})
 }
 const presets=getEffectDefinition('colorGrade')?.presets??[]
 return <div style={outer}><span style={heading}>COLOR & LOOKS</span>
  <p style={note}>One-click cinematic looks with adjustable exposure, contrast, saturation, white balance and gamma. Modify them further in Effects.</p>
  {presets.map(p=><button key={p.id} type="button" onClick={()=>apply(p.id)} style={{...button,borderColor:color?.preset===p.id?'#16B9F5':'#355065'}}>{p.label}</button>)}
  <button type="button" onClick={()=>engine.updateClip(clip.id,clip.trackId,{effects:(clip.effects??[]).filter(f=>f.kind!=='colorGrade')})} style={button}>Reset color grade</button>
 </div>
}
function TransitionsPanel({clip}:{clip:Clip}){
 const engine=useTimelineEngine()
 const project=useTracksStore(s=>({tracks:s.tracks,clips:s.clips}))
 const [duration,setDuration]=useState(.6)
 const [kind,setKind]=useState<(typeof kinds)[number]>('fade')
 const [direction,setDirection]=useState<'left'|'right'|'up'|'down'>('left')
 const [notice,setNotice]=useState('')
 const lane=[...(project.clips[clip.trackId]??[])].sort((a,b)=>a.startFrame-b.startFrame)
 const index=lane.findIndex(c=>c.id===clip.id)
 const next=lane[index+1]
 const gap=next?next.startFrame-(clip.startFrame+clip.durationFrames):Infinity
 const existing=engine.getProject().transitions.find(t=>t.fromClipId===clip.id&&t.toClipId===next?.id)
 const add=()=>{
  if(!next||gap>2||gap<0){setNotice('Place two visual clips together on the same track first.');return}
  if(engine.isTrackLocked(clip.trackId)){setNotice('Unlock the track to edit transitions.');return}
  const length=Math.max(2,Math.min(120,Math.round(duration*30)))
  const result=existing?(engine.updateTransition(existing.id,{kind,durationFrames:length,direction}),existing):engine.addTransition({fromClipId:clip.id,toClipId:next.id,trackId:clip.trackId,kind,durationFrames:length,direction})
  setNotice(result?'Transition saved to the timeline.':'Transition unavailable for these clips.')
 }
 return <div style={outer}><span style={heading}>TRANSITIONS BETWEEN CLIPS</span>
  <p style={note}>Select the first visual clip in an adjacent pair. Transitions render in preview and MP4; their duration can be changed later.</p>
  <div style={note}>Next clip: {next?.name??'None'} {next&&gap>2?'(move clips together to enable)':''}</div>
  <select aria-label="Transition type" style={control} value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>{kinds.map(k=><option key={k} value={k}>{pretty(k)}</option>)}</select>
  <MiniField label="Duration (seconds)" min={.07} max={4} step={.1} value={duration} onChange={setDuration}/>
  <label style={{...note,display:'grid',gap:5}}>Direction<select aria-label="Transition direction" style={control} value={direction} onChange={e=>setDirection(e.target.value as typeof direction)}>
    {['left','right','up','down'].map(x=><option key={x}>{x}</option>)}</select></label>
  <button type="button" style={button} disabled={!next||gap>2||gap<0} onClick={add}>{existing?'Update transition':'Apply transition'}</button>
  {existing&&<button type="button" style={button} onClick={()=>engine.removeTransition(existing.id)}>Remove transition</button>}
  {notice&&<output style={note}>{notice}</output>}
 </div>
}
function KeyframePane({clip}:{clip:Clip}){
 const engine=useTimelineEngine()
 const stage=useTracksStore(s=>s.stage)
 const assets=useMediaLibraryStore(s=>s.assets)
 const current=usePlaybackStore(s=>s.currentFrame)
 const [channel,setChannel]=useState<'opacity'|'scale'|'x'|'y'|'rotation'|'volume'>('opacity')
 const local=Math.max(0,Math.min(clip.durationFrames-1,current-clip.startFrame))
 const asset=clip.assetId?assets[clip.assetId]:undefined
 const keys=clip.keyframes?.channels?.[channel]?.keys??[]
 const base=clip.transform??{x:.5,y:.5,scale:1,rotation:0,anchor:{x:.5,y:.5}}
 const value=channel==='opacity'?clip.opacity??1:channel==='volume'?clip.volume??1:channel==='scale'?base.scale:channel==='rotation'?base.rotation:channel==='x'?base.x:base.y
 const [numeric,setNumeric]=useState<number|null>(null)
 const write=()=>{
  const patch=setKeyframe(clip,channel,local,{stage,content:asset?.width&&asset?.height?{width:asset.width,height:asset.height}:undefined},numeric??value,{easing:'ease-in-out'})
  engine.updateClip(clip.id,clip.trackId,patch)
 }
 return <div style={outer}>
  <span style={heading}>KEYFRAME ANIMATION</span><p style={note}>Set playhead inside the selected clip, choose a property and add an animation key. Animate scale, movement, rotation, opacity or audio level.</p>
  <select aria-label="Keyframe channel" style={control} value={channel} onChange={e=>{setChannel(e.target.value as typeof channel);setNumeric(null)}}>
   {['opacity','scale','x','y','rotation','volume'].map(k=><option key={k} value={k}>{pretty(k)}</option>)}</select>
  <MiniField label={'Value at '+(local/30).toFixed(2)+'s'} value={numeric??value} onChange={setNumeric} step={.05}/>
  <button type="button" style={button} onClick={write}>Add / replace keyframe</button>
  <span style={heading}>KEYFRAMES ({keys.length})</span>
  {keys.map(k=><div key={k.id} style={{display:'flex',alignItems:'center',gap:5,justifyContent:'space-between'}}>
   <span>{(k.frame/30).toFixed(2)}s · {k.value.toFixed(2)}</span><button type="button" style={button} aria-label={'Remove keyframe '+k.frame} onClick={()=>engine.updateClip(clip.id,clip.trackId,removeKeyframe(clip,channel,k.id))}>Remove</button>
  </div>)}
 </div>
}
function AudioPane({clip}:{clip:Clip}){
 const engine=useTimelineEngine()
 const [notice,setNotice]=useState('')
 const detach=()=>{
  const result=detachClipAudio(engine,clip.id)
  setNotice(result.ok?'Detached audio to its own linked timeline track.':String(result.reason??'Audio could not be detached.'))
 }
 const reattach=()=>{const result=reattachClipAudio(engine,clip.id);setNotice(result.ok?'Audio reattached.':String(result.reason??'Audio cannot be reattached.'))}
 return <div style={outer}><span style={heading}>AUDIO WORKSPACE</span>
   <p style={note}>Select an audio clip to adjust its volume and fades in the Properties Inspector. Import music or narration through the Media button.</p>
   {clip.type==='video'&&clip.embeddedAudio===true&&<button type="button" style={button} onClick={detach}>Detach audio</button>}
   {clip.type==='video'&&canReattachAudio(engine.getProject(),clip.id)&&<button type="button" style={button} onClick={reattach}>Reattach original audio</button>}
   {clip.type==='audio'&&<div style={note}>Volume: {Math.round((clip.volume??1)*100)}% · Fade in: {clip.audio?.fadeInSec??0}s · Fade out: {clip.audio?.fadeOutSec??0}s</div>}
   {notice&&<output style={note}>{notice}</output>}
 </div>
}
export function CreativePanel({type}:{type:Pane}){
 const clip=useClip()
 if(!clip)return <div style={{...outer,...note}}>Select a clip on the timeline to edit {type.toLowerCase()}.</div>
 if(type==='Transitions')return visual(clip)?<TransitionsPanel key={clip.id} clip={clip}/>:<div style={outer}>Select a video or image clip to add a transition.</div>
 if(type==='Audio')return <AudioPane clip={clip}/>
 if(type==='Keyframes')return <KeyframePane key={clip.id} clip={clip}/>
 if(!visual(clip))return <div style={outer}>Select a visual clip to apply effects.</div>
 return type==='Filters'?<FilterPicker clip={clip}/>:<FxEditors clip={clip}/>
}
