import { useSelectionStore,useTracksStore,useTimelineEngine,type Clip } from '@elah/editor'
import { TextClipProperties } from './TextClipProperties'
import { theme } from './theme'

const labelStyle:React.CSSProperties={display:'block',fontSize:11,color:'#9bb4c5',marginBottom:5}
const fieldStyle:React.CSSProperties={width:'100%',background:'#172434',color:'#e7f5ff',border:'1px solid #344759',borderRadius:7,padding:'7px 9px',fontSize:12}
function NumberField({label,value,min,max,step=1,onChange}:{label:string;value:number;min?:number;max?:number;step?:number;onChange:(n:number)=>void}) {
  return <label style={{display:'block',marginBottom:12,flex:1}}><span style={labelStyle}>{label}</span><input type="number" aria-label={label} style={fieldStyle} value={Number(value.toFixed(2))} min={min} max={max} step={step} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n))onChange(Math.max(min??-Infinity,Math.min(max??Infinity,n)))}}/></label>
}
export function ClipProperties(){
  const selected=useSelectionStore(s=>s.selectedClipIds)
  const clips=useTracksStore(s=>s.clips)
  const engine=useTimelineEngine()
  const clip:Clip|undefined=selected.size===1?Object.values(clips).flat().find(c=>selected.has(c.id)):undefined
  if(clip?.type==='text')return <TextClipProperties/>
  if(!clip)return <div style={{padding:22,fontSize:12,color:theme.textMuted,textAlign:'center',marginTop:50}}>Select a clip to edit its properties</div>
  const update=(properties:Partial<Clip>)=>engine.updateClip(clip.id,clip.trackId,properties)
  const transform={x:.5,y:.5,scale:1,rotation:0,anchor:{x:.5,y:.5},...clip.transform}
  const isVisual=clip.type==='video'||clip.type==='image'
  const hasAudio=clip.type==='audio'||clip.type==='video'
  const crop={x:0,y:0,width:1,height:1,...clip.crop}
  return <div className="sm-media-properties" style={{padding:'13px 14px',overflowY:'auto',color:'#e7f5ff'}}>
    <div style={{marginBottom:15,borderBottom:'1px solid #354457',paddingBottom:12}}><strong style={{fontSize:13,wordBreak:'break-word'}}>{clip.name}</strong><div style={{fontSize:10,color:theme.textMuted,marginTop:6}}>{clip.type.toUpperCase()} · {(clip.durationFrames/30).toFixed(2)}s</div></div>
    <section aria-label="Timing controls"><div className="sm-inspector-group-heading">TIMING · FRAME ACCURATE</div><div style={{display:'flex',gap:9}}>
      <NumberField label="Start (sec)" value={clip.startFrame/30} min={0} step={1/30} onChange={v=>engine.moveClip(clip.id,clip.trackId,clip.trackId,Math.round(v*30))}/>
      <NumberField label="Duration (sec)" value={clip.durationFrames/30} min={1/30} step={1/30} onChange={v=>engine.trimClip(clip.id,clip.trackId,clip.startFrame,Math.max(1,Math.round(v*30)))}/>
    </div>
    <div style={{fontSize:10,color:theme.textMuted,marginBottom:10}}>Source in: {(clip.sourceStartFrame/30).toFixed(2)}s · Out: {((clip.sourceStartFrame+clip.durationFrames*(clip.speed??1))/30).toFixed(2)}s</div>
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
      <button type="button" className="sm-top-action" title="Move one frame earlier (without trimming)" onClick={()=>engine.moveClip(clip.id,clip.trackId,clip.trackId,Math.max(0,clip.startFrame-1))}>Move −1f</button>
      <button type="button" className="sm-top-action" title="Move one frame later (without trimming)" onClick={()=>engine.moveClip(clip.id,clip.trackId,clip.trackId,clip.startFrame+1)}>Move +1f</button>
      <button type="button" className="sm-top-action" title="Trim end one frame earlier" onClick={()=>engine.trimClip(clip.id,clip.trackId,clip.startFrame,Math.max(1,clip.durationFrames-1))}>Trim −1f</button>
      <button type="button" className="sm-top-action" title="Extend end one frame (if original media permits)" onClick={()=>engine.trimClip(clip.id,clip.trackId,clip.startFrame,clip.durationFrames+1)}>Extend +1f</button>
    </div>
    {clip.type==='video'&&<>
      <NumberField label="Speed (×)" value={clip.speed??1} min={.25} max={4} step={.25} onChange={v=>engine.setClipSpeed(clip.id,clip.trackId,v)}/>
      <div style={{display:'flex',gap:6,marginBottom:12}}>
        {[.5,1,1.5,2].map(speed=><button type="button" key={speed} className="sm-top-action" title={`Set playback speed to ${speed}x`} onClick={()=>engine.setClipSpeed(clip.id,clip.trackId,speed)}
          style={{borderColor:Math.abs((clip.speed??1)-speed)<.001?'#16B9F5':undefined}}>{speed}×</button>)}
      </div>
    </>}
    </section>
    {isVisual&&<section aria-label="Transform controls"><div className="sm-inspector-group-heading">TRANSFORM</div>
      <div style={{display:'flex',gap:9}}><NumberField label="X (%)" value={transform.x*100} step={1} onChange={v=>update({transform:{...transform,x:v/100}})}/><NumberField label="Y (%)" value={transform.y*100} step={1} onChange={v=>update({transform:{...transform,y:v/100}})}/></div>
      <div style={{display:'flex',gap:9}}><NumberField label="Scale" value={transform.scale} min={.01} max={20} step={.1} onChange={v=>update({transform:{...transform,scale:v}})}/><NumberField label="Rotate (°)" value={transform.rotation*180/Math.PI} step={1} onChange={v=>update({transform:{...transform,rotation:v*Math.PI/180}})}/></div>
      <NumberField label="Opacity (%)" value={(clip.opacity??1)*100} min={0} max={100} onChange={v=>update({opacity:v/100})}/>
      <div className="sm-inspector-group-heading">CROP</div>
      <div style={{display:'flex',gap:9}}><NumberField label="Left (%)" value={crop.x*100} min={0} max={99} onChange={v=>update({crop:{...crop,x:v/100,width:Math.min(crop.width,1-v/100)}})}/><NumberField label="Top (%)" value={crop.y*100} min={0} max={99} onChange={v=>update({crop:{...crop,y:v/100,height:Math.min(crop.height,1-v/100)}})}/></div>
      <div style={{display:'flex',gap:9}}><NumberField label="Width (%)" value={crop.width*100} min={1} max={100} onChange={v=>update({crop:{...crop,width:Math.min(v/100,1-crop.x)}})}/><NumberField label="Height (%)" value={crop.height*100} min={1} max={100} onChange={v=>update({crop:{...crop,height:Math.min(v/100,1-crop.y)}})}/></div>
      <button className="sm-top-action" onClick={()=>update({crop:undefined,transform:undefined})}>Reset crop & transform</button>
    </section>}
    {hasAudio&&<section aria-label="Audio controls"><div className="sm-inspector-group-heading">AUDIO</div>
      <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,fontSize:12}}><input type="checkbox" checked={clip.audio?.muted??false} onChange={e=>update({audio:{...clip.audio,muted:e.target.checked}})}/>Mute</label>
      <NumberField label="Volume (%)" value={(clip.volume??1)*100} min={0} max={100} onChange={v=>update({volume:v/100})}/>
      <div className="sm-inspector-group-heading">AUDIO FADES</div>
      <div style={{display:'flex',gap:9}}>
        <NumberField label="Fade in (sec)" value={clip.audio?.fadeInSec??0} min={0} max={clip.durationFrames/30} step={.1} onChange={v=>update({audio:{...clip.audio,fadeInSec:Math.min(v,clip.durationFrames/30-(clip.audio?.fadeOutSec??0))}})}/>
        <NumberField label="Fade out (sec)" value={clip.audio?.fadeOutSec??0} min={0} max={clip.durationFrames/30} step={.1} onChange={v=>update({audio:{...clip.audio,fadeOutSec:Math.min(v,clip.durationFrames/30-(clip.audio?.fadeInSec??0))}})}/>
      </div>
      <div style={{fontSize:10,color:'#849bb0',lineHeight:1.5}}>Fades apply to timeline audio in preview and exported MP4.</div>
    </section>}
    <button style={{width:'100%',marginTop:8,color:'#ffb3ac',border:'1px solid #653f42',background:'#2b1c25',padding:9,borderRadius:7,cursor:'pointer'}} onClick={()=>engine.removeClip(clip.id,clip.trackId)}>Delete clip</button>
  </div>
}
