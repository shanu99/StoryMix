import {useState} from 'react'
import {Plus,Paintbrush,ChevronDown} from 'lucide-react'
import {useTimelineEngine,usePlaybackStore,useSelectionStore,useTracksStore,type Clip} from '@elah/editor'
import {captionPresentation,wrapCaption} from './captionLayout'
import {SinhalaAutoCaptions} from './SinhalaAutoCaptions'

const btn={border:'1px solid #36536a',borderRadius:8,background:'#183044',color:'#e4f4ff',padding:'9px 11px',cursor:'pointer'} as const
const input={width:'100%',border:'1px solid #36516a',borderRadius:8,background:'#101f2e',color:'#e8f7ff',padding:'10px',fontFamily:'Noto Sans Sinhala, sans-serif'} as const
type Style='clean'|'bold'|'cinematic'

export function CaptionsWorkbench(){
 const engine=useTimelineEngine()
 const current=usePlaybackStore(s=>s.currentFrame)
 const tracks=useTracksStore(s=>s.tracks)
 const all=useTracksStore(s=>s.clips)
 const stage=useTracksStore(s=>s.stage)
 const ids=useSelectionStore(s=>s.selectedClipIds)
 const [text,setText]=useState('')
 const [duration,setDuration]=useState(3)
 const [style,setStyle]=useState<Style>('bold')
 const [notice,setNotice]=useState('')
 const captionClips=tracks.filter(t=>t.kind==='elements'&&/caption/i.test(t.name)).flatMap(t=>all[t.id]??[]).filter(c=>c.type==='text')
 const selected=captionClips.find(c=>ids.has(c.id))
 const layout=captionPresentation(stage)
 const look=(chosen:Style):Partial<Clip>=>{
  const fontSize=Math.round(layout.fontSize*(chosen==='clean'?.88:chosen==='cinematic'?.96:1))
  return {
   fontFamily:'Noto Sans Sinhala',fontSize,color:chosen==='cinematic'?'#fff4df':'#ffffff',
   textOutline:{color:'#071320',width:chosen==='bold'?Math.max(3,Math.round(fontSize*.1)):Math.max(2,Math.round(fontSize*.06))},
   textShadow:{color:'#000000',blur:Math.max(5,Math.round(fontSize*.16)),offsetX:1,offsetY:3},
   textAlign:'center',
   transform:{x:layout.x,y:layout.y,scale:1,rotation:0,anchor:{x:.5,y:.5}},
  }
 }
 const add=()=>{
  if(!text.trim()){setNotice('Enter caption text first.');return}
  const start=Math.max(0,Math.round(current)),frames=Math.max(1,Math.round(duration*30))
  let target=tracks.find(t=>t.kind==='elements'&&/caption/i.test(t.name)&&!t.locked&&(all[t.id]??[]).every(c=>c.startFrame+c.durationFrames<=start||c.startFrame>=start+frames))
  if(!target)target=engine.addTrack('elements',{name:'Captions'})
  try{
   const properties=look(style)
   const created=engine.addClip({type:'text',trackId:target.id,name:'Caption',startFrame:start,durationFrames:frames,
    text:{content:wrapCaption(text.trim(),layout.maxCharactersPerLine),fontFamily:'Noto Sans Sinhala',fontSize:properties.fontSize,color:properties.color,textAlign:'center'}})
   engine.updateClip(created.id,created.trackId,properties)
   setNotice('Caption added at the correct position for the video canvas.')
   setText('')
  }catch(e){setNotice('Could not add caption: '+String(e))}
 }
 const apply=(every:boolean)=>{
  const targets=every?captionClips:selected?[selected]:[]
  if(!targets.length){setNotice('Select a caption or import SRT first.');return}
  engine.batch(()=>{for(const c of targets)if(!engine.isTrackLocked(c.trackId))engine.updateClip(c.id,c.trackId,look(style))},'Apply caption style')
  setNotice('Styled '+targets.length+' captions for '+stage.width+'×'+stage.height+'.')
 }
 return <div style={{display:'grid',gap:12,padding:'12px 12px 20px',color:'#e9f6ff',fontSize:12}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
   <strong style={{fontSize:12,color:'#9be5ff'}}>SINHALA / ENGLISH CAPTIONS</strong>
   <span aria-label="Detected video aspect ratio" style={{color:'#7edaf5',fontSize:10,whiteSpace:'nowrap'}}>{stage.width}×{stage.height} · Auto fit</span>
  </div>
  <SinhalaAutoCaptions/>
  <details style={{border:'1px solid #34495d',borderRadius:9,background:'#112334'}}>
   <summary style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:12,cursor:'pointer',fontWeight:600,listStyle:'none'}} aria-label="Manual captions and styling">
    <span>Manual captions & styling</span><ChevronDown size={15}/>
   </summary>
   <div style={{display:'grid',gap:10,padding:'0 12px 12px'}}>
    <label style={{display:'grid',gap:6}}>Caption text
     <textarea aria-label="New caption text" rows={3} value={text} onChange={e=>setText(e.target.value)}
      style={{...input,resize:'vertical'}} placeholder="සිංහල හෝ English caption…"/>
    </label>
    <label style={{display:'grid',gap:6}}>Duration (seconds)
     <input aria-label="New caption duration" type="number" min={.1} max={60} step={.1} value={duration}
      onChange={e=>setDuration(Math.max(.1,Math.min(60,Number(e.target.value)||3)))} style={input}/>
    </label>
    <button type="button" onClick={add} style={{...btn,display:'flex',gap:7,alignItems:'center',justifyContent:'center'}}>
     <Plus size={15}/> Add caption at playhead
    </button>
    <label style={{display:'grid',gap:6}}>Caption appearance
     <select aria-label="Caption style preset" value={style} style={input} onChange={e=>setStyle(e.target.value as Style)}>
      <option value="clean">Clean white</option><option value="bold">Bold (mobile)</option><option value="cinematic">Cinematic</option>
     </select>
    </label>
    <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
     <button type="button" style={btn} onClick={()=>apply(false)}><Paintbrush size={13} style={{verticalAlign:'middle'}}/> Selected</button>
     <button type="button" style={btn} onClick={()=>apply(true)}><Paintbrush size={13} style={{verticalAlign:'middle'}}/> All captions ({captionClips.length})</button>
    </div>
   </div>
  </details>
  {notice&&<output role="status" style={{color:'#9fddf3',fontSize:11}}>{notice}</output>}
 </div>
}
