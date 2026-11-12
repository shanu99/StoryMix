import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react'
import {AudioLines,Square,AlertTriangle,ChevronDown,CheckCircle2,Pencil,Trash2,Save,ArrowRight,KeyRound,Video,LoaderCircle} from 'lucide-react'
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
   const verified=await loadGeminiApiKey()
   if(verified!==geminiKey.trim())throw Error('Could not confirm saved key. Please try saving again.')
   setGeminiKey(verified)
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
  if(!geminiKey.trim()||keyStatus!=='saved'){
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
 const keyReady=keyStatus==='saved'&&validGeminiApiKey(geminiKey)
 const ready=!!clip&&(engineMode==='whisper'||keyReady)
 const disabledReason=!clip?'Import a video or audio file to begin.':
  engineMode==='gemini'&&!keyReady?(keyStatus==='loading'?'Checking saved API key…':'Save your Gemini API key to continue.'):''
 const stepLabel:CSSProperties={fontSize:11,fontWeight:700,color:'#b3d5e8',letterSpacing:'.025em'}
 const setupCard:CSSProperties={border:'1px solid #344f66',borderRadius:11,background:'#13283a',padding:12,display:'grid',gap:9}
 return <section aria-label="Sinhala AI Auto Captions" style={{display:'grid',gap:12}}>
  <div style={{display:'grid',gap:5}}>
   <strong style={{fontSize:16,color:'#f0faff'}}>Auto Captions</strong>
   <span style={{...info,fontSize:11}}>Video එක තෝරන්න → Generate කරන්න → දකුණු පැත්තෙන් edit කරන්න.</span>
  </div>
  <div style={setupCard}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6}}>
    <span style={stepLabel}>1. VIDEO / AUDIO</span>
    {clip&&<span aria-label="Video ready" style={{display:'flex',gap:4,alignItems:'center',fontSize:10,color:'#98e7ce'}}><CheckCircle2 size={13}/> Ready</span>}
   </div>
   {!sources.length
    ?<div role="status" style={{...info,padding:'10px 8px',border:'1px dashed #54718a',borderRadius:8}}>
       <Video size={15} style={{verticalAlign:'middle',marginRight:8}}/>Import a video or audio file first.
     </div>
    :sources.length===1
     ?<div aria-label="Selected caption source" style={{...info,display:'flex',gap:9,alignItems:'center',minWidth:0}}>
       <Video size={16} color="#77cdea"/><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}} title={clip?.name}>{clip?.name}</span>
      </div>
     :<select aria-label="Auto captions media source" style={input} value={activeId} disabled={processing} onChange={e=>setSourceId(e.target.value)}>
       {sources.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
      </select>}
  </div>
  {engineMode==='gemini'&&<div style={setupCard}>
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:7}}>
    <span style={stepLabel}>2. GEMINI AI</span>
    {keyReady&&<span aria-label="API key saved status" role="status" style={{fontSize:10,fontWeight:700,color:'#99f0cc',display:'flex',alignItems:'center',gap:5}}>
      <CheckCircle2 size={15}/> KEY SAVED
     </span>}
   </div>
   {keyStatus==='loading'&&<div role="status" style={{...info,display:'flex',gap:6,alignItems:'center'}}><LoaderCircle size={15}/> Checking saved key…</div>}
   {keyStatus==='saved'&&
    <div aria-label="Saved Gemini API key" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6,padding:'9px 10px',borderRadius:9,background:'#0c302d',border:'1px solid #2d7162'}}>
     <div style={{minWidth:0,display:'grid',gap:2}}>
      <strong style={{fontSize:12,color:'#b4f7db'}}>Gemini is ready</strong>
      <span style={{fontSize:10,color:'#9bc8bb'}}>Saved on this device · •••• {geminiKey.slice(-4)}</span>
     </div>
     <button type="button" aria-label="Edit saved Gemini API key" disabled={processing} onClick={()=>{setKeyError('');setKeyStatus('editing')}}
      style={{...btn,padding:'7px 9px',display:'flex',gap:5,alignItems:'center',background:'#174940',fontSize:11}}><Pencil size={13}/> Edit</button>
    </div>}
   {keyStatus!=='saved'&&keyStatus!=='loading'&&
    <div style={{display:'grid',gap:9}}>
     <span style={{...info,fontSize:11}}>{keyStatus==='editing'?'Change your saved key below.':'Paste your Google AI Studio key once. StoryMix will remember it.'}</span>
     <input type="password" autoComplete="off" spellCheck={false} aria-label="Gemini API key" placeholder="Paste your Gemini API key"
      value={geminiKey} disabled={processing||savingKey} onChange={e=>{setGeminiKey(e.target.value);setKeyError('')}} style={input}/>
     <button type="button" aria-label="Save Gemini API key" onClick={()=>void saveKey()}
      disabled={processing||savingKey||!validGeminiApiKey(geminiKey)}
      style={{...btn,display:'flex',alignItems:'center',justifyContent:'center',gap:8,background:'#14698e',opacity:validGeminiApiKey(geminiKey)?1:.6}}>
      <Save size={15}/>{savingKey?'Saving…':'Save API Key'}
     </button>
     {keyStatus==='editing'&&<button type="button" aria-label="Cancel editing Gemini API key"
      onClick={()=>{void loadGeminiApiKey().then(value=>{if(value){setGeminiKey(value);setKeyStatus('saved')}else{setGeminiKey('');setKeyStatus('empty')}}).catch(e=>{setKeyError(String(e));setKeyStatus('error')})}}
      style={{...btn,padding:6,fontSize:11}}>Cancel changes</button>}
     {keyStatus==='error'&&<button type="button" aria-label="Clear unusable Gemini key" style={btn} onClick={()=>void forgetKey()}>Clear unusable key</button>}
     <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'#8cdbff'}}>Get a free-tier Gemini API key</a>
    </div>}
   {keyStatus==='saved'&&<details style={{fontSize:10,color:'#a4bdc9'}}>
    <summary style={{cursor:'pointer'}} aria-label="API key management">Manage API key</summary>
    <div style={{display:'grid',gap:6,paddingTop:8}}>
     <span>Stored in encrypted browser storage. Removing it won't affect the saved project.</span>
     <button type="button" aria-label="Remove saved Gemini API key" onClick={()=>void forgetKey()} disabled={processing||savingKey}
      style={{...btn,padding:7,fontSize:11,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
      <Trash2 size={13}/> Remove saved key</button>
    </div>
   </details>}
   {keyError&&<div role="alert" style={{...info,color:'#ffb7ae'}}>{keyError}</div>}
   <span style={{...info,fontSize:10}}>Key saved ≠ Google quota verified. Audio is sent to Google when generating; free-tier limits apply. Don't save keys on a shared device.</span>
  </div>}
  <div style={{display:'grid',gap:8}}>
   <span style={stepLabel}>{engineMode==='gemini'?'3. GENERATE CAPTIONS':'2. GENERATE CAPTIONS'}</span>
   <button type="button" aria-label="Generate Sinhala AI captions" onClick={run} disabled={processing||!ready}
    style={{...btn,padding:'14px 10px',fontSize:13,fontWeight:700,display:'flex',justifyContent:'center',gap:9,alignItems:'center',
     borderColor:ready?'#1992bb':'#37566c',background:ready?'#075d82':'#284354',opacity:processing?.65:1}}>
    <AudioLines size={18}/> Generate Captions <ArrowRight size={15}/>
   </button>
   {!processing&&disabledReason&&<span aria-label="Caption setup needed" style={{...info,fontSize:11,color:'#e1c58d'}}>{disabledReason}</span>}
   {ready&&!processing&&state!=='review'&&<span style={{...info,fontSize:10}}>One click · Original spoken language · Auto timing and video ratio</span>}
  </div>
  {processing&&<div role="status" style={{...setupCard,gap:8}}>
   <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#d8f2ff'}}>
    <strong>Generating captions…</strong><span>{progress!==null?progress+'%':'Preparing'}</span>
   </div>
   <div style={{height:6,background:'#254054',borderRadius:9,overflow:'hidden'}}><div style={{height:'100%',width:(progress??5)+'%',background:'#16b9f5',transition:'width .3s'}}/></div>
   <span style={info}>{stage}</span>
   <button type="button" aria-label="Cancel Sinhala transcription" onClick={stop} style={{...btn,padding:8,display:'flex',justifyContent:'center',alignItems:'center',gap:6}}>
    <Square size={13}/> Cancel</button>
  </div>}
  {state==='error'&&<div role="alert" style={{...info,color:'#ffc4ba',padding:10,border:'1px solid #8b5757',borderRadius:8}}><AlertTriangle size={14} style={{verticalAlign:'middle',marginRight:5}}/>{error}</div>}
  {reviewReady&&results.length>0&&<div role="status" style={{...setupCard,background:'#11352e',borderColor:'#327a65',gap:6}}>
   <strong style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#b2f6d4'}}><CheckCircle2 size={17}/> {results.length} captions generated</strong>
   <span style={{...info,color:'#c4e8dd'}}>Next: Review and Add to Timeline in the right Inspector →</span>
  </div>}
  {state==='review'&&!results.length&&<div role="status" style={info}>{stage}</div>}
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
      <option value="sinhala">Sinhala-trained Whisper (experimental)</option>
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
