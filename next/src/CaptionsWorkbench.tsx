import {useState} from 'react'
import {Captions,Plus,Paintbrush,FileText} from 'lucide-react'
import {useTimelineEngine,usePlaybackStore,useSelectionStore,useTracksStore,type Clip} from '@elah/editor'
const btn={border:'1px solid #38546a',borderRadius:7,background:'#192d40',color:'#daedfa',padding:'9px 11px',cursor:'pointer'} as const
const input={width:'100%',border:'1px solid #36516a',borderRadius:7,background:'#142739',color:'#e7f5fc',padding:'9px'} as const
type Style='clean'|'bold'|'cinematic'
const looks:Record<Style,Partial<Clip>>={
 clean:{fontFamily:'Noto Sans Sinhala',fontSize:46,color:'#ffffff',textOutline:{color:'#101820',width:3},textShadow:{color:'#000000',blur:6,offsetX:1,offsetY:2}},
 bold:{fontFamily:'Noto Sans Sinhala',fontSize:57,color:'#ffffff',textOutline:{color:'#020b16',width:6},textShadow:{color:'#000000',blur:11,offsetX:1,offsetY:3}},
 cinematic:{fontFamily:'Noto Sans Sinhala',fontSize:47,color:'#fff4dc',textOutline:{color:'#000000',width:3},textShadow:{color:'#000000',blur:13,offsetX:2,offsetY:4}}
}
export function CaptionsWorkbench(){
 const engine=useTimelineEngine()
 const current=usePlaybackStore(s=>s.currentFrame)
 const tracks=useTracksStore(s=>s.tracks)
 const all=useTracksStore(s=>s.clips)
 const ids=useSelectionStore(s=>s.selectedClipIds)
 const [text,setText]=useState('')
 const [duration,setDuration]=useState(3)
 const [style,setStyle]=useState<Style>('bold')
 const [notice,setNotice]=useState('')
 const captionClips=tracks.filter(t=>t.kind==='elements'&&/caption/i.test(t.name)).flatMap(t=>all[t.id]??[]).filter(c=>c.type==='text')
 const selected=captionClips.find(c=>ids.has(c.id))
 const add=()=>{
  if(!text.trim()){setNotice('Write caption text first.');return}
  const start=Math.max(0,Math.round(current)),frames=Math.max(1,Math.round(duration*30))
  let target=tracks.find(t=>t.kind==='elements'&&/caption/i.test(t.name)&&!t.locked&&(all[t.id]??[]).every(c=>c.startFrame+c.durationFrames<=start||c.startFrame>=start+frames))
  if(!target)target=engine.addTrack('elements',{name:'Captions'})
  try{
   engine.addClip({type:'text',trackId:target.id,name:'Caption',startFrame:start,durationFrames:frames,content:text.trim(),fontFamily:looks[style].fontFamily,fontSize:looks[style].fontSize,color:looks[style].color,textOutline:looks[style].textOutline,textShadow:looks[style].textShadow})
   setNotice('Caption added at playhead. Select it to edit timing, text and animation in Inspector.')
   setText('')
  }catch(e){setNotice('Caption could not be inserted: '+String(e))}
 }
 const apply=(allCaptions:boolean)=>{
  const targets=allCaptions?captionClips:selected?[selected]:[]
  if(!targets.length){setNotice('Select a caption or import SRT first.');return}
  engine.batch(()=>{targets.forEach(c=>{if(!engine.isTrackLocked(c.trackId))engine.updateClip(c.id,c.trackId,looks[style])})},'Apply caption style')
  setNotice('Updated '+targets.length+' captions.')
 }
 return <div style={{padding:13,display:'grid',gap:11,color:'#ddecfa',fontSize:12}}>
  <strong style={{color:'#8addff',letterSpacing:'.09em',fontSize:11}}>SINHALA / ENGLISH CAPTIONS</strong>
  <p style={{color:'#91b2c8',fontSize:11,margin:0,lineHeight:1.6}}>Import existing SRT using the top Captions menu, or create captions at the playhead below. All text renders into the exported video.</p>
  <label style={{display:'grid',gap:5}}>Caption text
   <textarea aria-label="New caption text" rows={3} value={text} onChange={e=>setText(e.target.value)} style={{...input,resize:'vertical',fontFamily:'Noto Sans Sinhala, sans-serif'}} placeholder="සිංහල හෝ English caption…"/>
  </label>
  <label style={{display:'grid',gap:5}}>Duration (seconds)
   <input aria-label="New caption duration" type="number" min={.1} max={60} step={.1} value={duration} onChange={e=>setDuration(Math.max(.1,Math.min(60,Number(e.target.value)||3)))} style={input}/>
  </label>
  <button type="button" onClick={add} style={{...btn,display:'flex',gap:7,alignItems:'center'}}><Plus size={16}/> Add caption at playhead</button>
  <span style={{fontSize:11,color:'#7ad5fa',letterSpacing:'.08em',marginTop:4}}>CAPTION STYLE PRESETS</span>
  <select aria-label="Caption style preset" value={style} style={input} onChange={e=>setStyle(e.target.value as Style)}>
   <option value="clean">Clean — white</option><option value="bold">Bold — mobile</option><option value="cinematic">Cinematic — warm white</option>
  </select>
  <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
   <button type="button" style={btn} onClick={()=>apply(false)}><Paintbrush size={14} style={{verticalAlign:'middle'}}/> Selected</button>
   <button type="button" style={btn} onClick={()=>apply(true)}><Paintbrush size={14} style={{verticalAlign:'middle'}}/> All captions ({captionClips.length})</button>
  </div>
  <div style={{fontSize:11,color:'#9dbacc',lineHeight:1.6,display:'flex',gap:6}}><FileText size={16}/> Sinhala auto-speech transcription requires a supported speech-recognition backend and is not enabled yet. SRT import, manual captions and styling work locally.</div>
  {notice&&<output role="status" style={{color:'#a3dcf1',fontSize:11}}>{notice}</output>}
 </div>
}
