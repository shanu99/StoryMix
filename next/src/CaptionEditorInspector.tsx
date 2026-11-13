import {useState,type CSSProperties} from 'react'
import {Check,Download,ChevronDown,Plus,Paintbrush,AlertCircle} from 'lucide-react'
import {useTimelineEngine,useTracksStore,useSelectionStore,usePlaybackStore,useMediaLibraryStore,type Clip} from '@elah/editor'
import {TextClipProperties} from './TextClipProperties'
import {captionPresentation,wrapCaption,splitCaptionForDisplay,captionQualityIssue} from './captionLayout'
import {sourceSecondsToTimelineFrame} from './sinhalaAsr'
import {useCaptionWorkspace} from './CaptionWorkspaceState'
import {writeSrt} from './subtitles'

const control:CSSProperties={padding:'9px 10px',border:'1px solid #38566c',borderRadius:8,background:'#112334',color:'#e8f6ff',width:'100%',fontFamily:'Noto Sans Sinhala, Inter, sans-serif',fontSize:12}
const button:CSSProperties={padding:'10px 11px',border:'1px solid #385c74',borderRadius:8,background:'#18364a',color:'#e8f7ff',cursor:'pointer',fontSize:12}
const secondary='#9eb8cc'
type Style='clean'|'bold'|'cinematic'|'creator'|'highlight'|'minimal'
const PRESETS:{id:Style;name:string;description:string;color:string;background:string;weight:'normal'|'bold'}[]=[
 {id:'clean',name:'Clean',description:'Simple & readable',color:'#ffffff',background:'#182c3b',weight:'normal'},
 {id:'bold',name:'Bold',description:'Social video',color:'#ffffff',background:'#182c3b',weight:'bold'},
 {id:'cinematic',name:'Cinema',description:'Warm film look',color:'#fff4df',background:'#1d2734',weight:'bold'},
 {id:'creator',name:'Creator',description:'Punchy yellow',color:'#ffe55b',background:'#142c36',weight:'bold'},
 {id:'highlight',name:'Pop',description:'Electric blue',color:'#79deff',background:'#0d2938',weight:'bold'},
 {id:'minimal',name:'Minimal',description:'Soft subtitles',color:'#ffffff',background:'#273139',weight:'normal'},
]

function downloadSrt(text:string){
 const blob=new Blob([text],{type:'text/plain;charset=utf-8'})
 const url=URL.createObjectURL(blob)
 const link=document.createElement('a')
 link.href=url;link.download='StoryMix-Sinhala-Auto-Captions.srt'
 document.body.appendChild(link);link.click();link.remove()
 setTimeout(()=>URL.revokeObjectURL(url),15000)
}
function ClipAppearance({style,setStyle}:{style:Style;setStyle:(style:Style)=>void}){
 return <div style={{display:'grid',gap:8}}>
  <strong style={{fontSize:11,color:secondary}}>Caption style presets</strong>
  <div role="group" aria-label="Caption style presets" style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:7}}>
   {PRESETS.map(p=><button key={p.id} type="button" aria-label={p.name+' caption preset'} aria-pressed={style===p.id} onClick={()=>setStyle(p.id)}
    style={{background:p.background,color:'#ecf7ff',border:'1px solid '+(style===p.id?'#16b9f5':'#385369'),borderRadius:9,padding:'10px 7px',display:'grid',gap:5,cursor:'pointer',textAlign:'center',boxShadow:style===p.id?'inset 0 0 0 1px #16b9f5':'none'}}>
    <span lang="si" style={{fontFamily:'Noto Sans Sinhala, sans-serif',fontSize:17,fontWeight:p.weight,color:p.color,textShadow:p.id==='minimal'?'none':'0 2px 3px #000000',lineHeight:1.5}}>ආයුබෝවන්</span>
    <strong style={{fontSize:11}}>{p.name}{style===p.id?' ✓':''}</strong><span style={{color:'#a9bac8',fontSize:9}}>{p.description}</span>
   </button>)}
  </div>
 </div>
}
function stylePatch(style:Style,stage:{width:number;height:number},sourceSize?:{width:number;height:number}|null):Partial<Clip>{
 const layout=captionPresentation(stage,sourceSize)
 const fontSize=Math.round(layout.fontSize*(style==='clean'?.88:style==='cinematic'?.96:style==='minimal'?.84:style==='creator'?1.05:1))
 const color=PRESETS.find(p=>p.id===style)?.color??'#ffffff'
 const outlineWidth=style==='minimal'?0:style==='bold'||style==='creator'||style==='highlight'?Math.max(3,Math.round(fontSize*.10)):Math.max(2,Math.round(fontSize*.06))
 return {
  fontFamily:'Noto Sans Sinhala',fontSize,fontWeight:style==='clean'||style==='minimal'?'normal':'bold',color,textAlign:'center',
  textOutline:{color:'#071320',width:outlineWidth},
  textShadow:{color:'#000000',blur:style==='minimal'?2:Math.max(5,Math.round(fontSize*.16)),offsetX:1,offsetY:style==='minimal'?1:3},
  transform:{x:layout.x,y:layout.y,scale:1,rotation:0,anchor:{x:.5,y:.5}},
 }
}

export function CaptionEditorInspector(){
 const engine=useTimelineEngine()
 const tracks=useTracksStore(s=>s.tracks)
 const clips=useTracksStore(s=>s.clips)
 const stage=useTracksStore(s=>s.stage)
 const assets=useMediaLibraryStore(s=>s.assets)
 const selectedIds=useSelectionStore(s=>s.selectedClipIds)
 const currentFrame=usePlaybackStore(s=>s.currentFrame)
 const {draft,setDraft,reviewReady,setReviewReady,sourceClipId,feedback,setFeedback,languageMode}=useCaptionWorkspace()
 const [timings,setTimings]=useState(false)
 const [manual,setManual]=useState(false)
 const [text,setText]=useState('')
 const [seconds,setSeconds]=useState(3)
 const [style,setStyle]=useState<Style>('bold')
 const [error,setError]=useState('')
 const selectedText=Object.values(clips).flat().find(c=>selectedIds.has(c.id)&&c.type==='text')
 const captionClips=tracks.filter(t=>t.kind==='elements'&&/caption/i.test(t.name)).flatMap(t=>clips[t.id]??[]).filter(c=>c.type==='text')
 const edit=(index:number,patch:{text?:string;start?:number;end?:number})=>setDraft(rows=>rows.map((r,i)=>i===index?{...r,...patch}:r))
 const issues=draft.map(r=>captionQualityIssue(r.text,languageMode))
 const valid=draft.length>0&&issues.every(issue=>!issue)&&draft.every(r=>r.end>r.start)
 const source=engine.findClip(sourceClipId)?.clip
 const primaryVideo=Object.values(clips).flat().find(c=>c.type==='video')
 const layoutVideo=source?.type==='video'?source:primaryVideo
 const sourceAsset=layoutVideo?.assetId?assets[layoutVideo.assetId]:undefined
 const contentSize=sourceAsset?.width&&sourceAsset?.height
  ? {width:sourceAsset.width,height:sourceAsset.height}:null
 const captionLayout=captionPresentation(stage,contentSize)
 const toTimeline=(start:number,end:number)=>{
  if(!source)throw Error('Source clip was removed. Please regenerate the captions.')
  const timelineStart=sourceSecondsToTimelineFrame(start,source.startFrame,source.speed??1)
  const timelineEnd=Math.min(source.startFrame+source.durationFrames,sourceSecondsToTimelineFrame(end,source.startFrame,source.speed??1))
  return {start:timelineStart,end:timelineEnd}
 }
 const insert=()=>{
  if(!source||!valid){setError('Please correct all Sinhala captions and timing values first.');return}
  try{
   const layout=captionLayout
   const sorted=[...draft].sort((a,b)=>a.start-b.start)
   let inserted=0
   engine.batch(()=>{
    const target=engine.addTrack('elements',{name:'AI Captions — Sinhala'})
    let last=source.startFrame
    for(const row of sorted){
     const t=toTimeline(row.start,row.end)
     const start=Math.max(last,t.start),end=Math.min(source.startFrame+source.durationFrames,t.end)
     if(end<=start)continue
     const cards=splitCaptionForDisplay(row.text.normalize('NFC').trim(),layout.maxCharactersPerLine)
     const span=end-start
     for(let index=0;index<cards.length;index++){
      const cardStart=start+Math.round(span*index/cards.length)
      const cardEnd=start+Math.round(span*(index+1)/cards.length)
      if(cardEnd<=cardStart)continue
      const patch=stylePatch(style,stage,contentSize)
      const created=engine.addClip({type:'text',trackId:target.id,name:'AI Caption',startFrame:cardStart,durationFrames:cardEnd-cardStart,
       text:{content:cards[index],fontFamily:'Noto Sans Sinhala',fontSize:patch.fontSize,color:patch.color,textAlign:'center'}})
      engine.updateClip(created.id,target.id,patch)
      inserted++
     }
     last=end
    }
   },'Insert generated Sinhala captions')
   setFeedback(inserted+' editable Sinhala captions added. Select a caption on the timeline to edit it here.')
   setReviewReady(false);setDraft([]);setError('')
  }catch(e){setError('Could not add captions: '+String(e))}
 }
 const exportSrt=()=>{
  if(!valid||!source)return
  const rows=draft.map(r=>{
   const t=toTimeline(r.start,r.end)
   return {start:t.start/30,end:t.end/30,text:r.text.trim().normalize('NFC')}
  })
  downloadSrt(writeSrt(rows))
 }
 const addManual=()=>{
  if(!text.trim()){setError('Enter caption text first.');return}
  const start=Math.max(0,currentFrame),frames=Math.max(1,Math.round(seconds*30))
  if(Array.from(text.trim()).length>captionLayout.maxCharactersPerLine*2){setError('Manual caption is too long for this video. Split it into shorter lines first.');return}
  let target=tracks.find(t=>t.kind==='elements'&&/caption/i.test(t.name)&&!t.locked&&(clips[t.id]??[]).every(c=>c.startFrame+c.durationFrames<=start||c.startFrame>=start+frames))
  if(!target)target=engine.addTrack('elements',{name:'Captions'})
  try{
   const layout=captionLayout,patch=stylePatch(style,stage,contentSize)
   const created=engine.addClip({type:'text',trackId:target.id,name:'Caption',startFrame:start,durationFrames:frames,
    text:{content:wrapCaption(text.trim(),layout.maxCharactersPerLine),fontFamily:'Noto Sans Sinhala',fontSize:patch.fontSize,color:patch.color,textAlign:'center'}})
   engine.updateClip(created.id,target.id,patch)
   setText('');setError('');setFeedback('Caption added. Select it on the timeline for precise adjustments.')
  }catch(e){setError('Could not add caption: '+String(e))}
 }
 const applyAll=()=>{
  const targets=captionClips.filter(c=>!engine.isTrackLocked(c.trackId))
  engine.batch(()=>targets.forEach(c=>engine.updateClip(c.id,c.trackId,stylePatch(style,stage,contentSize))),'Style all captions')
  setFeedback('Updated '+targets.length+' caption styles.')
 }
 if(!reviewReady&&selectedText)return <TextClipProperties/>
 return <section aria-label="Caption editor inspector" style={{display:'grid',gap:13,padding:14,color:'#e7f5ff',fontSize:12,overflowY:'auto'}}>
  <div style={{display:'grid',gap:4}}>
   <strong style={{fontSize:14}}>{reviewReady?'Review Sinhala captions':'Caption editor'}</strong>
   <span style={{fontSize:11,color:secondary}}>{stage.width} × {stage.height} · Captions fit the visible video, not black bars</span>
  </div>
  <ClipAppearance style={style} setStyle={setStyle}/>
  {!reviewReady&&captionClips.length>0&&<button type="button" aria-label="Apply selected preset to all captions" style={{...button,background:'#105f82',fontWeight:700}} onClick={applyAll}><Paintbrush size={14} style={{verticalAlign:'middle'}}/> Apply to all captions ({captionClips.length})</button>}
  {reviewReady&&<>
   <div style={{fontSize:11,color:secondary}}>Correct recognized words here. The timeline and text styling stay separate from caption generation.</div>
   {issues.some(Boolean)&&<div role="alert" style={{fontSize:11,color:'#ffb7a2'}}>Some generated lines look incorrect, repeated, or too long. Please correct the highlighted lines before adding captions.</div>}
   <div style={{display:'grid',gap:9,maxHeight:'min(45vh,420px)',overflowY:'auto'}}>
   {draft.map((r,i)=><div key={i} style={{padding:9,background:'#13283b',border:'1px solid '+(issues[i]?'#b66b55':'#355269'),borderRadius:9,display:'grid',gap:6}}>
    <textarea aria-label={'Caption '+(i+1)+' text'} rows={2} style={{...control,resize:'vertical'}} value={r.text} onChange={e=>edit(i,{text:e.target.value})}/>
    {issues[i]&&<span role="alert" style={{fontSize:10,color:'#ffb7a2'}}>{issues[i]}</span>}
    <span style={{fontSize:10,color:secondary}}>{r.start.toFixed(1)}s – {r.end.toFixed(1)}s</span>
    {timings&&<div style={{display:'flex',gap:6}}>
     <input aria-label={'Caption '+(i+1)+' start time'} type="number" step=".1" min={0} style={control} value={Number(r.start.toFixed(2))} onChange={e=>edit(i,{start:Math.max(0,Number(e.target.value)||0)})}/>
     <input aria-label={'Caption '+(i+1)+' end time'} type="number" step=".1" min={0} style={control} value={Number(r.end.toFixed(2))} onChange={e=>edit(i,{end:Math.max(0,Number(e.target.value)||0)})}/>
    </div>}
   </div>)}
   </div>
   <button type="button" aria-label="Edit caption timings" style={button} onClick={()=>setTimings(v=>!v)}>{timings?'Hide timings':'Edit timings (optional)'}</button>
   <button type="button" aria-label="Insert generated captions into timeline" style={{...button,background:'#0b6285',opacity:valid?1:.45}} disabled={!valid} onClick={insert}><Check size={15} style={{verticalAlign:'middle'}}/> Add {draft.length} captions to timeline</button>
   <button type="button" aria-label="Download generated Sinhala SRT" disabled={!valid} onClick={exportSrt} style={{...button,opacity:valid?1:.45}}><Download size={15} style={{verticalAlign:'middle'}}/> Export SRT</button>
  </>}
  {!reviewReady&&<>
   <div style={{display:'grid',gap:4,padding:10,background:'#112739',borderRadius:9}}>
    <strong>How to edit captions</strong>
    <span style={{fontSize:11,color:secondary}}>Generate on the left. Review the resulting text here, or select an existing caption clip on the timeline to edit its text, position, style and animation.</span>
   </div>
   <details open={manual} onToggle={e=>setManual(e.currentTarget.open)} style={{border:'1px solid #344e62',borderRadius:9,padding:11}}>
    <summary style={{cursor:'pointer',fontWeight:600}} aria-label="Manual captions and styling">Manual captions & styling <ChevronDown size={13} style={{verticalAlign:'middle'}}/></summary>
    {manual&&<div style={{display:'grid',gap:10,marginTop:12}}>
     <label style={{display:'grid',gap:5,fontSize:11}}>Caption text
      <textarea aria-label="New caption text" rows={3} style={{...control,resize:'vertical'}} placeholder="සිංහල හෝ English caption…" value={text} onChange={e=>setText(e.target.value)}/>
     </label>
     <label style={{display:'grid',gap:5,fontSize:11}}>Duration (seconds)
      <input aria-label="New caption duration" type="number" min=".1" max="60" step=".1" style={control} value={seconds} onChange={e=>setSeconds(Math.max(.1,Math.min(60,Number(e.target.value)||3)))}/>
     </label>
     <button type="button" style={button} onClick={addManual}><Plus size={14} style={{verticalAlign:'middle'}}/> Add caption at playhead</button>
    </div>}
   </details>
  </>}
  {error&&<div role="alert" style={{color:'#ffb7aa',fontSize:11,display:'flex',gap:5}}><AlertCircle size={15}/>{error}</div>}
  {feedback&&<output role="status" style={{fontSize:11,color:'#a0e6ff'}}>{feedback}</output>}
 </section>
}
