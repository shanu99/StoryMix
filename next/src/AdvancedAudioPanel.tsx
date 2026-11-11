import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react'
import {Volume2,VolumeX} from 'lucide-react'
import {useSelectionStore,useTracksStore,useTimelineEngine,type Clip} from '@elah/editor'
import {detachClipAudio,reattachClipAudio,canReattachAudio} from '@elah/core-next'
const ink='#d9efff',muted='#93b3c7'
/** Actual decoded waveform peaks for the selected audio file (not decorative bars). */
function useWaveform(src:string|undefined){
 const [peaks,setPeaks]=useState<number[]>([])
 const [error,setError]=useState('')
 useEffect(()=>{
  setPeaks([]);setError('')
  if(!src)return
  let disposed=false
  const task=async()=>{
   let context:AudioContext|undefined
   try{
    const response=await fetch(src)
    if(!response.ok)throw Error('Audio URL unavailable')
    const bytes=await response.arrayBuffer()
    if(bytes.byteLength>90_000_000)throw Error('Audio file too large for waveform preview')
    context=new AudioContext()
    const buffer=await context.decodeAudioData(bytes)
    const count=110, channel=buffer.getChannelData(0),step=Math.max(1,Math.floor(channel.length/count))
    const values=Array.from({length:count},(_,i)=>{
      const start=i*step,end=Math.min(channel.length,start+step)
      let sum=0
      for(let j=start;j<end;j+=Math.max(1,Math.floor(step/90)))sum+=Math.abs(channel[j])
      return Math.min(1,sum/Math.max(1,Math.ceil((end-start)/Math.max(1,Math.floor(step/90))))*3)
    })
    if(!disposed)setPeaks(values)
   }catch(e){if(!disposed)setError('Waveform unavailable for this codec or missing media.')}
   finally{void context?.close().catch(()=>{})}
  }
  void task()
  return()=>{disposed=true}
 },[src])
 return {peaks,error}
}
const input={width:'100%',accentColor:'#16b9f5'} as const
const btn={padding:'8px 10px',borderRadius:7,border:'1px solid #36536a',background:'#183044',color:ink,cursor:'pointer'} as const
export function AdvancedAudioPanel(){
 const engine=useTimelineEngine()
 const selection=useSelectionStore(s=>s.selectedClipIds)
 const clips=useTracksStore(s=>s.clips)
 const clip:Clip|undefined=selection.size===1?Object.values(clips).flat().find(c=>selection.has(c.id)):undefined
 const src=clip?.src
 const wave=useWaveform(clip?.type==='audio'||clip?.embeddedAudio?src:undefined)
 const [notice,setNotice]=useState('')
 const waveBox=useRef<HTMLDivElement>(null)
 const fadeDrag=useRef<'in'|'out'|null>(null)
 const update=(patch:Partial<Clip>)=>{if(clip)engine.updateClip(clip.id,clip.trackId,patch)}
 const audio=clip?.audio??{}
 const duration=(clip?.durationFrames??30)/30
 const fades={in:audio.fadeInSec??0,out:audio.fadeOutSec??0}
 const fade=(kind:'in'|'out',v:number)=>{
  if(!clip)return
  const safe=Math.max(0,Math.min(duration-(kind==='in'?fades.out:fades.in),v))
  update({audio:{...audio,[kind==='in'?'fadeInSec':'fadeOutSec']:safe}})
 }
 const beginFadeDrag=(e:ReactPointerEvent<HTMLButtonElement>,kind:'in'|'out')=>{
  if(!clip||engine.isTrackLocked(clip.trackId))return
  e.preventDefault();e.stopPropagation();fadeDrag.current=kind
  e.currentTarget.setPointerCapture(e.pointerId)
 }
 const moveFadeDrag=(e:ReactPointerEvent<HTMLDivElement>)=>{
  if(!clip||!fadeDrag.current||!waveBox.current)return
  const rect=waveBox.current.getBoundingClientRect()
  const fraction=Math.max(0,Math.min(1,(e.clientX-rect.left)/Math.max(1,rect.width)))
  const kind=fadeDrag.current
  const current=engine.findClip(clip.id)?.clip
  if(!current)return
  const currentAudio=current.audio??{}
  const other=kind==='in'?(currentAudio.fadeOutSec??0):(currentAudio.fadeInSec??0)
  const desired=(kind==='in'?fraction:(1-fraction))*duration
  const safe=Math.max(0,Math.min(duration-other,desired))
  engine.previewClip(clip.id,clip.trackId,{audio:{...currentAudio,[kind==='in'?'fadeInSec':'fadeOutSec']:safe}})
 }
 const endFadeDrag=(cancel=false)=>{
  if(!fadeDrag.current)return
  fadeDrag.current=null
  if(cancel)engine.cancelInteraction()
  else engine.commitInteraction('Drag audio fade handle')
 }
 if(!clip||!['audio','video'].includes(clip.type))return <div style={{padding:14,fontSize:12,color:muted}}>Select an audio or video clip on the timeline to inspect and mix its sound.</div>
 return <div style={{padding:13,color:ink,display:'grid',gap:13,fontSize:12}}>
  <strong style={{fontSize:11,color:'#89d9f7'}}>AUDIO MIXER</strong>
  <div style={{fontWeight:650,overflow:'hidden',textOverflow:'ellipsis'}}>{clip.name}</div>
  <div ref={waveBox} title="Real waveform — drag blue handles to adjust fade in and fade out" onPointerMove={moveFadeDrag}
   onPointerUp={()=>endFadeDrag()} onPointerCancel={()=>endFadeDrag(true)}
   style={{position:'relative',height:80,borderRadius:9,background:'#0b1b2b',border:'1px solid #314d61',padding:7}}>
   {wave.peaks.length>0?<svg aria-label="Decoded audio waveform" role="img" viewBox="0 0 110 60" preserveAspectRatio="none" style={{width:'100%',height:'100%',pointerEvents:'none'}}>
    {wave.peaks.map((v,i)=><line key={i} x1={i+.5} x2={i+.5} y1={30-Math.max(1,v*28)} y2={30+Math.max(1,v*28)} stroke="#16b9f5" strokeWidth=".75"/>)}
   </svg>:<div style={{color:muted,fontSize:11,paddingTop:16,textAlign:'center'}}>{wave.error||'Decoding waveform…'}</div>}
   {(['in','out'] as const).map(kind=><button key={kind} type="button" aria-label={kind==='in'?'Drag fade in handle':'Drag fade out handle'}
      title={kind==='in'?'Fade in — drag horizontally':'Fade out — drag horizontally'}
      onPointerDown={e=>beginFadeDrag(e,kind)}
      onPointerUp={()=>endFadeDrag()} onPointerCancel={()=>endFadeDrag(true)}
      style={{position:'absolute',left:`calc(${kind==='in'?(fades.in/duration*100):(100-fades.out/duration*100)}% - 7px)`,
      top:4,bottom:4,width:14,border:'1px solid #78e7ff',borderRadius:6,
      background:'rgba(22,185,245,.35)',cursor:'ew-resize',touchAction:'none',padding:0}}/>)}
  </div>
  <label style={{display:'grid',gap:5}}>Clip volume: {Math.round((clip.volume??1)*100)}%
   <input aria-label="Audio volume" type="range" style={input} min={0} max={100} step={1} value={(clip.volume??1)*100} onChange={e=>update({volume:Number(e.target.value)/100})}/></label>
  <label style={{display:'flex',alignItems:'center',gap:8}}><input aria-label="Mute selected audio" type="checkbox" checked={audio.muted??false} onChange={e=>update({audio:{...audio,muted:e.target.checked}})}/>{audio.muted?<VolumeX size={15}/>:<Volume2 size={15}/>} Mute</label>
  <label style={{display:'grid',gap:6}}>Fade in: {fades.in.toFixed(1)}s
   <input aria-label="Fade in duration" type="range" min={0} max={duration.toFixed(1)} step={.1} value={fades.in} onChange={e=>fade('in',Number(e.target.value))} style={input}/></label>
  <label style={{display:'grid',gap:6}}>Fade out: {fades.out.toFixed(1)}s
   <input aria-label="Fade out duration" type="range" min={0} max={duration.toFixed(1)} step={.1} value={fades.out} onChange={e=>fade('out',Number(e.target.value))} style={input}/></label>
  <label style={{display:'grid',gap:6}}>Boost: {audio.boostDb??0} dB
   <input aria-label="Audio boost" type="range" min={0} max={12} step={1} value={audio.boostDb??0} onChange={e=>update({audio:{...audio,boostDb:Number(e.target.value)}})} style={input}/></label>
  {clip.type==='video'&&clip.embeddedAudio===true&&<button type="button" style={btn} onClick={()=>{const r=detachClipAudio(engine,clip.id);setNotice(r.ok?'Audio detached into its own linked track.':String(r.reason))}}>Detach audio</button>}
  {clip.type==='video'&&canReattachAudio(engine.getProject(),clip.id)&&<button type="button" style={btn} onClick={()=>{const r=reattachClipAudio(engine,clip.id);setNotice(r.ok?'Audio reattached.':String(r.reason))}}>Reattach original audio</button>}
  <p style={{margin:0,color:muted,lineHeight:1.6,fontSize:11}}>Audio waveform is decoded from the selected media file; fades and volume changes are included in exported MP4.</p>
  {notice&&<output role="status">{notice}</output>}
 </div>
}
