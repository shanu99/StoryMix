import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react'
import {AudioLines,Square,AlertTriangle,ChevronDown,CheckCircle2,Pencil,Trash2,Save} from 'lucide-react'
import {loadGeminiApiKey,saveGeminiApiKey,removeGeminiApiKey,validGeminiApiKey} from './geminiKeyVault'
import {useSelectionStore,useTracksStore} from '@elah/editor'
import {decodeClipForAsr} from './audioForSinhalaAsr'
import {transcribeGemini} from './geminiTranscription'

import type {CaptionSegment} from './sinhalaAsr'
import {useCaptionWorkspace} from './CaptionWorkspaceState'

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
 const clips=useTracksStore(s=>s.clips)

 const selected=useSelectionStore(s=>s.selectedClipIds)
 const sources=useMemo(()=>Object.values(clips).flat().filter(c=>(c.type==='audio'||c.type==='video')&&typeof c.src==='string'&&!!c.src),[clips])
 const defaultId=sources.find(c=>selected.has(c.id))?.id??sources.find(c=>c.type==='video')?.id??sources[0]?.id??''
 const [sourceId,setSourceId]=useState('')
 const activeId=sourceId&&sources.some(c=>c.id===sourceId)?sourceId:defaultId
 const clip=sources.find(c=>c.id===activeId)
 const [model,setModel]=useState<'sinhala'|'multilingual'>('sinhala')
 const [preferGpu,setPreferGpu]=useState(false)
 const [engineMode,setEngineMode]=useState<'gemini'|'whisper'>('gemini')
 const [state,setState]=useState<State>('idle')
 const [stage,setStage]=useState('Ready')
 const [progress,setProgress]=useState<number|null>(null)
 const {draft:results,setDraft:setResults,setSourceClipId,setReviewReady,reviewReady,setFeedback,geminiKey,setGeminiKey,setLanguageMode}=useCaptionWorkspace()
 const [error,setError]=useState('')
 const [usedModel,setUsedModel]=useState('')
 const [keyStatus,setKeyStatus]=useState<'loading'|'empty'|'saved'|'editing'|'error'>('loading')
 const [keyError,setKeyError]=useState('')
 const [savingKey,setSavingKey]=useState(false)
 useEffect(()=>{
  let active=true
  void loadGeminiApiKey().then(value=>{
   if(!active)return
   if(value){
    setGeminiKey(value)
    setKeyStatus('saved')
   }else setKeyStatus('empty')
  }).catch(e=>{
   if(!active)return
   setKeyError(e instanceof Error?e.message:'Unable to load saved API key.')
   setKeyStatus('error')
  })
  return()=>{active=false}
 },[setGeminiKey])
 const saveKey=async()=>{
  setSavingKey(true);setKeyError('')
  try{
   await saveGeminiApiKey(geminiKey)
   setGeminiKey(geminiKey.trim())
   setKeyStatus('saved')
  }catch(e){
   setKeyError(e instanceof Error?e.message:'Could not save API key.')
  }finally{setSavingKey(false)}
 }
 const forgetKey=async()=>{
  setSavingKey(true);setKeyError('')
  try{
   await removeGeminiApiKey()
   setGeminiKey('')
   setKeyStatus('empty')
  }catch(e){setKeyError(e instanceof Error?e.message:'Could not remove saved key.')}
  finally{setSavingKey(false)}
 }

 const running=useRef<{worker:Worker|null;controller:AbortController}|null>(null)
 const currentSource=useRef<string|null>(null)
 useEffect(()=>()=>{running.current?.controller.abort();running.current?.worker?.terminate();running.current=null},[])
 const stop=()=>{
  const run=running.current
  running.current=null;run?.controller.abort();run?.worker?.terminate()
  setState('idle');setStage('Cancelled');setProgress(null);setReviewReady(false)
 }
 const runWhisper=async()=>{
  setLanguageMode('sinhala')
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
  setSourceClipId(clip.id)
  setReviewReady(false)
  setFeedback('')
  setResults([]);setError('');setUsedModel('');setProgress(null)
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
     setReviewReady(true)
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
 const runGemini=async()=>{
  if(!clip||running.current)return
  if(!geminiKey.trim()||keyStatus==='loading'){
   setError('Enter your free Google AI Studio API key to use Gemini captions.')
   setState('error')
   return
  }
  if(clip.type==='video'&&clip.embeddedAudio===false){
   setError('This video has detached audio. Select its linked audio track instead.')
   setState('error');return
  }
  const controller=new AbortController()
  running.current={controller,worker:null}
  setSourceClipId(clip.id)
  setLanguageMode('original')
  setReviewReady(false)
  setFeedback('')
  setResults([]);setError('');setProgress(null);setUsedModel('')
  setState('decoding');setStage('Extracting audio from your clip…')
  try{
   const waveform=await decodeClipForAsr(clip.src!,{
    sourceStartSeconds:clip.sourceStartFrame/FPS,
    sourceDurationSeconds:clip.durationFrames/FPS*(clip.speed??1),
    signal:controller.signal,
    onProgress:msg=>{if(!controller.signal.aborted)setStage(msg)},
   })
   if(controller.signal.aborted)return
   setState('transcribing');setStage('Gemini is transcribing the audio…')
   const captions=await transcribeGemini(waveform,geminiKey,controller.signal,(done,total)=>{
    if(!controller.signal.aborted){
     setState('transcribing')
     setProgress(Math.round(done/total*100))
     setStage('Transcribing audio with Gemini: '+done+' / '+total+' sections')
    }
   })
   if(controller.signal.aborted)return
   setResults(captions)
   setUsedModel('Gemini 2.5 Flash')
   setReviewReady(true)
   setStage(captions.length?'Review the transcript in the right Inspector.':'Gemini found no speech in this clip.')
   setProgress(100)
   setState('review')
  }catch(caught){
   if(!controller.signal.aborted){
    setError(caught instanceof Error?caught.message:String(caught))
    setState('error');setProgress(null)
   }
  }finally{
   if(running.current?.controller===controller)running.current=null
  }
 }
 const run=()=>{void (engineMode==='gemini'?runGemini():runWhisper())}
 const processing=state==='decoding'||state==='loading'||state==='transcribing'
 return <section aria-label="Sinhala AI Auto Captions" style={{display:'grid',gap:11}}>
  <div style={{display:'grid',gap:5}}>
   <strong style={{fontSize:14,color:'#eaf8ff'}}>Auto captions</strong>
   <span style={info}>Gemini captions · Original spoken language · Auto-fit to video</span>
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
  {engineMode==='gemini'&&<div style={{display:'grid',gap:8}}>
   {keyStatus==='loading'&&<div role="status" style={info}>Checking saved Gemini API key…</div>}
   {keyStatus==='saved'
    ?<div aria-label="Saved Gemini API key" style={{display:'grid',gap:8,padding:11,background:'#142d36',border:'1px solid #316f68',borderRadius:9}}>
      <div style={{display:'flex',gap:7,alignItems:'center',color:'#b2e7d5',fontSize:11}}>
       <CheckCircle2 size={16}/> Gemini API key saved on this device
      </div>
      <div style={{fontSize:11,color:'#adc3d0'}}>••••••••{geminiKey.slice(-4)} · Automatically available when you return</div>
      <div style={{display:'flex',gap:7}}>
       <button type="button" aria-label="Edit saved Gemini API key" onClick={()=>{setKeyError('');setKeyStatus('editing')}} disabled={processing}
        style={{...btn,flex:1,padding:7,display:'flex',gap:6,justifyContent:'center',alignItems:'center'}}><Pencil size={13}/> Edit</button>
       <button type="button" aria-label="Remove saved Gemini API key" onClick={()=>void forgetKey()} disabled={processing||savingKey}
        style={{...btn,padding:7,display:'flex',gap:6,alignItems:'center'}}><Trash2 size={13}/> Remove</button>
      </div>
     </div>
    :keyStatus!=='loading'&&<div style={{display:'grid',gap:7}}>
     <label style={{display:'grid',gap:5,fontSize:11,color:'#b8d3e4'}}>Google AI Studio API key
      <input type="password" autoComplete="off" spellCheck={false}
       aria-label="Gemini API key" placeholder="Paste your Gemini API key once"
       value={geminiKey} disabled={processing||savingKey}
       onChange={e=>{setGeminiKey(e.target.value);setKeyError('')}}
       style={input}/>
     </label>
     <div style={{display:'flex',gap:7}}>
      <button type="button" aria-label="Save Gemini API key" onClick={()=>void saveKey()}
       disabled={processing||savingKey||!validGeminiApiKey(geminiKey)}
       style={{...btn,flex:1,display:'flex',gap:7,alignItems:'center',justifyContent:'center',background:'#155573'}}>
       <Save size={14}/> {savingKey?'Saving…':'Save key'}
      </button>
      {keyStatus==='editing'&&<button type="button" aria-label="Cancel editing Gemini API key"
       onClick={()=>{void loadGeminiApiKey().then(value=>{
        if(value){setGeminiKey(value);setKeyStatus('saved')}
        else{setGeminiKey('');setKeyStatus('empty')}
       }).catch(e=>{setKeyError(String(e));setKeyStatus('error')})}}
       style={btn}>Cancel</button>}
      {keyStatus==='error'&&<button type="button" aria-label="Clear unusable Gemini key" onClick={()=>void forgetKey()} style={btn}>Clear old key</button>}
     </div>
    </div>}
   {keyError&&<div role="alert" style={{...info,color:'#ffb7ae'}}>{keyError}</div>}
   <span style={info}>Saved only in this browser profile using encrypted device storage. No need to enter it every session. The key and audio are sent through our transcription gateway when you generate captions; never use this on a shared device.</span>
   <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'#7bd9ff'}}>Get a Gemini API key</a>
  </div>}
  <button type="button" aria-label="Generate Sinhala AI captions" onClick={run} disabled={processing||!clip||(engineMode==='gemini'&&(keyStatus==='loading'||!validGeminiApiKey(geminiKey)))}
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
  {reviewReady&&results.length>0&&<output role="status" style={{...info,color:'#91def6'}}>Generated {results.length} Sinhala captions. Review and edit them in the Inspector on the right.</output>}
  {state==='review'&&!results.length&&<span role="status" style={info}>{stage}</span>}
  <details style={{borderTop:'1px solid #304758',paddingTop:9}}>
   <summary style={{fontSize:11,color:'#9fbfd1',cursor:'pointer',listStyle:'none'}}>
    <ChevronDown size={13} style={{verticalAlign:'middle'}}/> Advanced settings
   </summary>
   <div style={{display:'grid',gap:10,marginTop:10}}>
    <label style={{display:'grid',gap:5,fontSize:11}}>Caption engine
     <select aria-label="Caption recognition engine" value={engineMode} disabled={processing}
      style={input} onChange={e=>setEngineMode(e.target.value as 'gemini'|'whisper')}>
      <option value="gemini">Gemini API (recommended)</option>
      <option value="whisper">Local Whisper (experimental, paused)</option>
     </select>
    </label>
    {engineMode==='whisper'&&<label style={{display:'grid',gap:5,fontSize:11}}>Speech model
     <select aria-label="Sinhala transcription model" value={model} style={input} disabled={processing} onChange={e=>setModel(e.target.value as typeof model)}>
      <option value="sinhala">Sinhala-trained Whisper (recommended)</option>
      <option value="multilingual">Multilingual Whisper (may require correction)</option>
     </select>
    </label>}
    {engineMode==='whisper'&&<label style={{display:'flex',gap:6,fontSize:11,color:'#b2cddc',alignItems:'center'}}>
     <input aria-label="Use GPU for Sinhala captions" type="checkbox" checked={preferGpu} disabled={processing} onChange={e=>setPreferGpu(e.target.checked)}/>
     Try GPU acceleration
    </label>}
    <span style={info}>{engineMode==='gemini'?'Gemini processes the selected audio in Google Cloud. Review generated timings before export.':'Experimental local Whisper is kept for comparison. Its model downloads to your browser and has known Sinhala accuracy issues.'}</span>
    {usedModel&&<small style={info}>Recognition model: {usedModel}</small>}
   </div>
  </details>
 </section>
}
