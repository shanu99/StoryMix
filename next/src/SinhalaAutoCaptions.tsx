import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react'
import {AudioLines,Square,Download,Check,AlertTriangle,ChevronDown} from 'lucide-react'
import {useSelectionStore,useTimelineEngine,useTracksStore,type Clip} from '@elah/editor'
import {decodeClipForAsr} from './audioForSinhalaAsr'
import {captionPresentation,captionScriptIssue,wrapCaption} from './captionLayout'
import {sourceSecondsToTimelineFrame,type CaptionSegment} from './sinhalaAsr'
import {writeSrt} from './subtitles'

interface EventData {
 type:'progress'|'caption'|'complete'|'error'
 stage?:string
 percent?:number
 finished?:number
 total?:number
 chunk?:CaptionSegment
 message?:string
 model?:string
}
type State='idle'|'decoding'|'loading'|'transcribing'|'review'|'error'
const btn:CSSProperties={border:'1px solid #365b73',borderRadius:8,padding:'10px 12px',background:'#183448',color:'#e9f6ff',cursor:'pointer',fontSize:12,fontWeight:600}
const input:CSSProperties={width:'100%',background:'#0e2131',color:'#e9f7ff',border:'1px solid #375368',borderRadius:7,padding:8,fontSize:11,fontFamily:'Noto Sans Sinhala, Inter, sans-serif'}
const info:CSSProperties={fontSize:11,lineHeight:1.5,color:'#9cb8ca'}
const FPS=30

function downloadSrt(filename:string,content:string){
 const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}))
 const a=document.createElement('a');a.href=url;a.download=filename
 document.body.appendChild(a);a.click();a.remove()
 setTimeout(()=>URL.revokeObjectURL(url),15000)
}

export function SinhalaAutoCaptions(){
 const engine=useTimelineEngine()
 const clips=useTracksStore(s=>s.clips)
 const stageCanvas=useTracksStore(s=>s.stage)
 const selected=useSelectionStore(s=>s.selectedClipIds)
 const sources=useMemo(()=>Object.values(clips).flat().filter(c=>(c.type==='audio'||c.type==='video')&&typeof c.src==='string'&&!!c.src),[clips])
 const defaultId=sources.find(c=>selected.has(c.id))?.id??sources.find(c=>c.type==='video')?.id??sources[0]?.id??''
 const [sourceId,setSourceId]=useState('')
 const activeId=sourceId&&sources.some(c=>c.id===sourceId)?sourceId:defaultId
 const clip=sources.find(c=>c.id===activeId)
 const [model,setModel]=useState<'sinhala'|'multilingual'>('sinhala')
 const [preferGpu,setPreferGpu]=useState(false)
 const [state,setState]=useState<State>('idle')
 const [stage,setStage]=useState('Ready')
 const [progress,setProgress]=useState<number|null>(null)
 const [results,setResults]=useState<CaptionSegment[]>([])
 const [error,setError]=useState('')
 const [usedModel,setUsedModel]=useState('')
 const [editTiming,setEditTiming]=useState(false)
 const [inserted,setInserted]=useState('')
 const running=useRef<{worker:Worker|null;controller:AbortController}|null>(null)
 const currentSource=useRef<string|null>(null)
 useEffect(()=>()=>{running.current?.controller.abort();running.current?.worker?.terminate();running.current=null},[])
 const stop=()=>{
  const run=running.current
  running.current=null;run?.controller.abort();run?.worker?.terminate()
  setState('idle');setStage('Cancelled');setProgress(null)
 }
 const run=async()=>{
  if(!clip||running.current)return
  if(clip.type==='video'&&clip.embeddedAudio===false){
   setError('This video has detached audio. Choose its audio track instead.');setState('error');return
  }
  if(!clip.src){
   setError('Original media is missing. Relink your video or audio first.');setState('error');return
  }
  const duration=clip.durationFrames/FPS*(clip.speed??1)
  if(duration<=0||duration>1500){
   setError('Use a clip shorter than 25 minutes; split longer clips first.');setState('error');return
  }
  const controller=new AbortController()
  running.current={controller,worker:null}
  currentSource.current=clip.id
  setResults([]);setError('');setUsedModel('');setInserted('');setProgress(null)
  setState('decoding');setStage('Preparing audio…')
  try{
   const waveform=await decodeClipForAsr(clip.src,{
    sourceStartSeconds:clip.sourceStartFrame/FPS,sourceDurationSeconds:duration,
    signal:controller.signal,onProgress:message=>{if(!controller.signal.aborted)setStage(message)},
   })
   if(controller.signal.aborted)return
   setState('loading');setStage('Loading Sinhala speech model…')
   const worker=new Worker(new URL('./sinhalaAsr.worker.ts',import.meta.url),{type:'module'})
   if(!running.current||running.current.controller!==controller){worker.terminate();return}
   running.current.worker=worker
   const draft:CaptionSegment[]=[]
   worker.onmessage=(event:MessageEvent<EventData>)=>{
    if(controller.signal.aborted||!running.current||running.current.controller!==controller)return
    const data=event.data
    if(data.type==='progress'){
     if(data.stage)setStage(data.stage)
     if(data.percent!==undefined)setProgress(data.percent)
     if(data.finished!==undefined){
      setState('transcribing');setStage('Recognizing Sinhala speech… '+data.finished+'/'+data.total)
     }
    }else if(data.type==='caption'&&data.chunk){
     draft.push(data.chunk);setResults([...draft])
    }else if(data.type==='complete'){
     running.current=null;worker.terminate()
     setUsedModel(data.model??model);setState('review')
     setStage(draft.length?'Review and correct your captions.':'No speech found. Try another clip.')
     setProgress(100)
    }else if(data.type==='error'){
     running.current=null;worker.terminate()
     setError(data.message??'Sinhala recognition failed.');setState('error');setProgress(null)
    }
   }
   worker.onerror=(event)=>{
    if(controller.signal.aborted)return
    event.preventDefault();worker.terminate();running.current=null
    setError('Could not load the model. Check your internet connection or select CPU in Advanced.')
    setState('error')
   }
   worker.postMessage({type:'start',buffer:waveform.buffer,length:waveform.length,sampleRate:16000,model,preferGpu},[waveform.buffer])
  }catch(err){
   if(!controller.signal.aborted){setError(err instanceof Error?err.message:String(err));setState('error')}
   if(running.current?.controller===controller){running.current.worker?.terminate();running.current=null}
  }
 }
 const edit=(i:number,patch:Partial<CaptionSegment>)=>setResults(rows=>rows.map((row,j)=>i===j?{...row,...patch}:row))
 const timeline=(segment:CaptionSegment,source:Clip)=>{
  const start=sourceSecondsToTimelineFrame(segment.start,source.startFrame,source.speed??1)
  const end=Math.min(source.startFrame+source.durationFrames,sourceSecondsToTimelineFrame(segment.end,source.startFrame,source.speed??1))
  return {startFrame:start,durationFrames:Math.max(1,end-start)}
 }
 const badLines=results.map((r,i)=>({index:i,reason:captionScriptIssue(r.text)})).filter(x=>x.reason)
 const valid=results.length>0&&badLines.length===0
 const commit=()=>{
  const target=engine.findClip(currentSource.current??'')?.clip
  if(!target){setError('Source clip changed. Generate captions again.');setState('error');return}
  if(!valid){setError('Correct every highlighted line into Sinhala Unicode first.');return}
  const ordered=[...results].filter(s=>s.text.trim()&&s.end>s.start).sort((a,b)=>a.start-b.start)
  if(!ordered.length){setError('There are no valid captions.');return}
  const layout=captionPresentation(engine.getProject().stage)
  let count=0
  try{
   engine.batch(()=>{
    const track=engine.addTrack('elements',{name:'AI Captions — Sinhala'})
    let last=target.startFrame
    for(const segment of ordered){
     const times=timeline(segment,target)
     const start=Math.max(last,times.startFrame)
     const end=Math.min(target.startFrame+target.durationFrames,times.startFrame+times.durationFrames)
     if(end<=start)continue
     const added=engine.addClip({type:'text',trackId:track.id,name:'AI Caption',startFrame:start,durationFrames:end-start,
      text:{content:wrapCaption(segment.text.trim().normalize('NFC'),layout.maxCharactersPerLine),fontSize:layout.fontSize,
       color:'#ffffff',fontFamily:'Noto Sans Sinhala',textAlign:'center'}})
     engine.updateClip(added.id,track.id,{
      transform:{x:layout.x,y:layout.y,scale:1,rotation:0,anchor:{x:.5,y:.5}},
      textOutline:{color:'#08121d',width:Math.max(2,Math.round(layout.fontSize*.07))},
      textShadow:{color:'#000000',blur:Math.max(5,Math.round(layout.fontSize*.15)),offsetX:1,offsetY:3},
     })
     last=end;count++
    }
   },'Generate Sinhala AI captions')
   setInserted(count+' Sinhala captions added to the timeline.')
   setState('idle');setResults([])
  }catch(err){setError('Could not add captions: '+String(err));setState('error')}
 }
 const exportSrt=()=>{
  if(!clip||!valid)return
  const rows=results.map(r=>{
   const t=timeline(r,clip)
   return {start:t.startFrame/FPS,end:(t.startFrame+t.durationFrames)/FPS,text:r.text.trim().normalize('NFC')}
  })
  downloadSrt('StoryMix-Sinhala-Auto-Captions.srt',writeSrt(rows))
 }
 const processing=state==='decoding'||state==='loading'||state==='transcribing'
 return <section aria-label="Sinhala AI Auto Captions" style={{display:'grid',gap:11}}>
  <div style={{display:'grid',gap:5}}>
   <strong style={{fontSize:14,color:'#eaf8ff'}}>Auto captions</strong>
   <span style={info}>සිංහල කථනය → සිංහල අකුරු · Video ratio එකට auto-fit</span>
  </div>
  {!sources.length
   ?<div style={{padding:13,background:'#102638',border:'1px dashed #3b6578',borderRadius:9,color:'#a9c9d8',fontSize:12}}>
     Import a video or audio file first.
    </div>
   :sources.length===1
    ?<div aria-label="Selected caption source" style={{...info,padding:'9px 11px',borderRadius:8,background:'#172b3e',wordBreak:'break-word'}}>
      <AudioLines size={14} style={{verticalAlign:'middle',marginRight:7}}/>{clip?.name}
     </div>
    :<label style={{display:'grid',gap:5,color:'#b6d2e1',fontSize:11}}>Caption source
      <select aria-label="Auto captions media source" style={input} value={activeId} disabled={processing} onChange={e=>setSourceId(e.target.value)}>
       {sources.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
     </label>}
  <button type="button" aria-label="Generate Sinhala AI captions" onClick={()=>void run()} disabled={processing||!clip}
   style={{...btn,display:'flex',justifyContent:'center',alignItems:'center',gap:9,background:'#075b7e',borderColor:'#1499bd',padding:'12px',
    opacity:processing||!clip?.5:1}}>
   <AudioLines size={16}/> Generate Sinhala Captions
  </button>
  {processing&&<button type="button" aria-label="Cancel Sinhala transcription" onClick={stop}
   style={{...btn,display:'flex',gap:6,alignItems:'center',justifyContent:'center'}}><Square size={14}/> Cancel</button>}
  {processing&&<div role="status" style={{display:'grid',gap:6}}>
   <div style={{height:5,background:'#20384b',borderRadius:9,overflow:'hidden'}}>
    <div style={{width:(progress??2)+'%',height:'100%',background:'#16b9f5'}}/>
   </div>
   <span style={info}>{stage}</span>
  </div>}
  {state==='error'&&<div role="alert" style={{...info,color:'#ffb5b5',display:'flex',gap:6}}><AlertTriangle size={16}/>{error}</div>}
  {!!results.length&&<div style={{display:'grid',gap:8}}>
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
    <strong style={{fontSize:12,color:'#98e6ff'}}>Review captions · {results.length}</strong>
    <span style={{fontSize:10,color:'#a8d7e6'}}>සිංහල Unicode</span>
   </div>
   {badLines.length>0&&<p role="alert" style={{...info,color:'#ffc0a0',margin:0}}>
    {badLines.length} caption(s) contain Singlish/English or non-Sinhala text. Correct the highlighted lines before adding or exporting.
   </p>}
   <div style={{display:'grid',gap:7,maxHeight:300,overflowY:'auto'}}>
    {results.map((row,i)=>{
     const issue=captionScriptIssue(row.text)
     return <div key={i} style={{border:'1px solid '+(issue?'#b66b55':'#355269'),background:'#102638',
      borderRadius:8,padding:9,display:'grid',gap:6}}>
      <textarea aria-label={'Caption '+(i+1)+' text'} value={row.text} rows={2}
       onChange={e=>edit(i,{text:e.target.value})} style={{...input,resize:'vertical',lineHeight:1.55}}/>
      {issue&&<span role="alert" style={{...info,color:'#ffbea9'}}>{issue}</span>}
      <span style={{...info,fontSize:10}}>{row.start.toFixed(1)}s — {row.end.toFixed(1)}s</span>
      {editTiming&&<div style={{display:'flex',gap:6}}>
       <input aria-label={'Caption '+(i+1)+' start time'} type="number" step=".1" min={0}
        value={Number(row.start.toFixed(2))} onChange={e=>edit(i,{start:Math.max(0,Number(e.target.value)||0)})} style={{...input,width:'50%'}}/>
       <input aria-label={'Caption '+(i+1)+' end time'} type="number" step=".1" min={0}
        value={Number(row.end.toFixed(2))} onChange={e=>edit(i,{end:Math.max(0,Number(e.target.value)||0)})} style={{...input,width:'50%'}}/>
      </div>}
     </div>
    })}
   </div>
   <button type="button" aria-label="Edit caption timings" onClick={()=>setEditTiming(v=>!v)}
    style={{...btn,fontSize:11,padding:7}}>{editTiming?'Hide timing editor':'Edit timing (optional)'}</button>
   {state==='review'&&<>
    <button type="button" aria-label="Insert generated captions into timeline" disabled={!valid}
     onClick={commit} style={{...btn,display:'flex',justifyContent:'center',gap:6,background:'#075b7e',
      opacity:valid?1:.45}}><Check size={15}/> Add captions to timeline</button>
    <button type="button" aria-label="Download generated Sinhala SRT" disabled={!valid}
     onClick={exportSrt} style={{...btn,display:'flex',justifyContent:'center',gap:6,opacity:valid?1:.45}}>
     <Download size={15}/> Export SRT
    </button>
   </>}
  </div>}
  {state==='review'&&!results.length&&<span role="status" style={info}>{stage}</span>}
  {inserted&&<output role="status" style={{...info,color:'#91dff6'}}>{inserted}</output>}
  <details style={{borderTop:'1px solid #304758',paddingTop:9}}>
   <summary style={{fontSize:11,color:'#9fbfd1',cursor:'pointer',listStyle:'none'}}>
    <ChevronDown size={13} style={{verticalAlign:'middle'}}/> Advanced settings
   </summary>
   <div style={{display:'grid',gap:10,marginTop:10}}>
    <label style={{display:'grid',gap:5,fontSize:11}}>Speech model
     <select aria-label="Sinhala transcription model" value={model} style={input} disabled={processing} onChange={e=>setModel(e.target.value as typeof model)}>
      <option value="sinhala">Sinhala-trained Whisper (recommended)</option>
      <option value="multilingual">Multilingual Whisper (may require correction)</option>
     </select>
    </label>
    <label style={{display:'flex',gap:6,fontSize:11,color:'#b2cddc',alignItems:'center'}}>
     <input aria-label="Use GPU for Sinhala captions" type="checkbox" checked={preferGpu} disabled={processing} onChange={e=>setPreferGpu(e.target.checked)}/>
     Try GPU acceleration
    </label>
    <span style={info}>The model is downloaded on first use. Audio stays in your browser. AI words may need corrections; Singlish cannot be automatically assumed to be accurate Sinhala.</span>
    {usedModel&&<small style={info}>Recognition model: {usedModel}</small>}
    <span style={info}>Canvas: {stageCanvas.width}×{stageCanvas.height}; caption style is calculated automatically.</span>
   </div>
  </details>
 </section>
}
