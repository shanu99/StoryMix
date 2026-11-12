import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react'
import {createPortal} from 'react-dom'
import {AudioLines,Square,AlertTriangle,ChevronDown,CheckCircle2,Pencil,Trash2,Save,ArrowRight,KeyRound,Video,Eye,EyeOff,X,ExternalLink} from 'lucide-react'
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
 const [connectOpen,setConnectOpen]=useState(false)
 const [revealKey,setRevealKey]=useState(false)
 const [connectionNotice,setConnectionNotice]=useState('')
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
   setConnectOpen(false)
   setRevealKey(false)
   setConnectionNotice('API key saved on this browser. You can generate captions now.')
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
   setConnectionNotice('Saved key removed from this device.')
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
   setConnectOpen(true)
   setKeyError('')
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
 const hasSource=!!clip
 const active=state==='decoding'||state==='loading'||state==='transcribing'
 const connectionButton=()=>{
  setKeyError('')
  setConnectionNotice('')
  setConnectOpen(true)
 }
 const disconnect=async()=>{
  await forgetKey()
  setConnectOpen(false)
 }
 const buttonPrimary:CSSProperties={...btn,borderColor:'#1e9fd3',background:'#0c719c',padding:'13px 12px',fontSize:13,fontWeight:700,display:'flex',gap:9,justifyContent:'center',alignItems:'center',width:'100%'}
 const subtle:CSSProperties={fontSize:11,color:'#91b2c7',lineHeight:1.55}
 return <section aria-label="Sinhala AI Auto Captions" style={{display:'grid',gap:13}}>
  <div style={{display:'grid',gap:4}}>
   <strong style={{fontSize:15,color:'#f3faff'}}>Auto Captions</strong>
   <span style={subtle}>One click to generate. Edit captions in the right Inspector.</span>
  </div>
  {!sources.length
   ?<div role="status" style={{padding:12,border:'1px dashed #54748a',borderRadius:9,display:'flex',gap:8,alignItems:'center',fontSize:11,color:'#b8d0dc'}}>
     <Video size={16}/> Import a video or audio file first
    </div>
   :sources.length===1
    ?<div aria-label="Selected caption source" style={{padding:'11px 12px',background:'#162a3a',border:'1px solid #304a5d',borderRadius:9,display:'flex',alignItems:'center',gap:8,minWidth:0}}>
      <Video size={16} color="#6ed5fa"/><span style={{flex:1,minWidth:0,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',fontSize:11,color:'#dbf1fc'}} title={clip?.name}>{clip?.name}</span>
      <CheckCircle2 size={15} color="#83e8bb"/>
     </div>
    :<select aria-label="Auto captions media source" style={input} value={activeId} disabled={active} onChange={e=>setSourceId(e.target.value)}>
      {sources.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
     </select>}
  {engineMode==='gemini'&&
   <div aria-label="Google AI connection status" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:7,padding:'10px 11px',background:'#112737',border:'1px solid #365269',borderRadius:9}}>
    <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
     <span aria-hidden="true" style={{display:'flex',alignItems:'center'}}><KeyRound size={17} color={keyReady?'#86e5ba':'#8bb7d0'}/></span>
     <div style={{display:'grid',gap:2,minWidth:0}}>
      <strong style={{fontSize:11,color:'#e6f5ff'}}>Google AI</strong>
      {keyStatus==='loading'?<span style={{fontSize:10,color:'#b7c8d3'}}>Checking saved key…</span>:
       keyReady?<span aria-label="API key saved status" role="status" style={{fontSize:10,color:'#8af2c4'}}>✓ Saved · ••••{geminiKey.slice(-4)}</span>:
       <span style={{fontSize:10,color:'#e4bb8d'}}>{keyStatus==='error'?'Storage unavailable':'No key saved'}</span>}
     </div>
    </div>
    <button type="button" aria-label={keyReady?'Manage saved Gemini API key':'Connect Google AI'}
     onClick={connectionButton} disabled={active||savingKey||keyStatus==='loading'}
     style={{...btn,padding:'7px 9px',fontSize:11,whiteSpace:'nowrap',background:keyReady?'#1a3548':'#175d7f'}}>
     {keyReady?'Manage':'Connect'}
    </button>
   </div>}
  {connectionNotice&&<output role="status" style={{...subtle,color:'#a0efd0'}}>{connectionNotice}</output>}
  <button type="button" aria-label="Generate Sinhala AI captions" onClick={keyReady||engineMode==='whisper'?run:connectionButton}
   disabled={active||!hasSource||keyStatus==='loading'}
   style={{...buttonPrimary,opacity:active||!hasSource?.55:1}}>
   <AudioLines size={18}/> Generate Captions <ArrowRight size={15}/>
  </button>
  {engineMode==='gemini'&&!keyReady&&keyStatus!=='loading'&&<span style={{...subtle,color:'#dec5a0',textAlign:'center'}}>Save your API key once. Then generate captions.</span>}
  {active&&<div role="status" style={{padding:11,background:'#162c3e',border:'1px solid #345168',borderRadius:9,display:'grid',gap:9}}>
    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#d8eefa'}}><strong>Generating captions</strong><span>{progress===null?'Preparing…':progress+'%'}</span></div>
    <div style={{height:5,background:'#2a4559',borderRadius:8,overflow:'hidden'}}><div style={{width:(progress??5)+'%',height:'100%',background:'#16b9f5',transition:'width .2s'}}/></div>
    <span style={subtle}>{stage}</span>
    <button type="button" aria-label="Cancel Sinhala transcription" style={{...btn,padding:8}} onClick={stop}><Square size={12} style={{verticalAlign:'middle'}}/> Cancel</button>
   </div>}
  {state==='error'&&<div role="alert" style={{...subtle,color:'#ffb4aa',border:'1px solid #a35b55',padding:10,borderRadius:8}}><AlertTriangle size={14} style={{verticalAlign:'middle'}}/> {error}</div>}
  {reviewReady&&results.length>0&&<div role="status" style={{padding:11,background:'#14352e',border:'1px solid #377a65',borderRadius:9,display:'grid',gap:5}}>
    <strong style={{fontSize:12,color:'#aff1cf'}}><CheckCircle2 size={15} style={{verticalAlign:'middle'}}/> {results.length} captions ready</strong>
    <span style={{...subtle,color:'#bde6d6'}}>Review and add them from the Inspector on the right →</span>
   </div>}
  {state==='review'&&!results.length&&<span role="status" style={subtle}>{stage}</span>}
  {engineMode==='gemini'&&connectOpen&&createPortal(
   <div role="presentation" style={{position:'fixed',inset:0,background:'rgba(4,10,19,.78)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:9999,padding:18}}>
    <div role="dialog" aria-modal="true" aria-label="Connect Google AI" style={{width:'100%',maxWidth:475,maxHeight:'calc(100vh - 36px)',overflowY:'auto',border:'1px solid #3f586c',borderRadius:18,background:'#142230',boxShadow:'0 20px 70px rgba(0,0,0,.5)',padding:24,display:'grid',gap:16,color:'#f0f7ff'}}>
     <div style={{display:'flex',justifyContent:'flex-end'}}>
      <button type="button" aria-label="Close Google AI setup" onClick={()=>{setConnectOpen(false);setRevealKey(false);setKeyError('');if(keyStatus==='editing'){void loadGeminiApiKey().then(v=>{if(v){setGeminiKey(v);setKeyStatus('saved')}else{setGeminiKey('');setKeyStatus('empty')}})}}} style={{...btn,border:'none',background:'transparent',padding:4}}><X size={19}/></button>
     </div>
     <div style={{display:'grid',gap:5}}>
      <strong style={{fontSize:19,fontWeight:750}}>{keyReady?'Google AI key saved':'Connect Google AI'}</strong>
      <span style={{fontSize:12,color:'#a6c0d0'}}>Paste your API key once. StoryMix will remember it in this browser.</span>
     </div>
     {keyReady
      ?<div aria-label="Saved Gemini API key" style={{padding:'14px 15px',background:'#113d35',border:'1px solid #367b64',borderRadius:10,display:'grid',gap:8}}>
        <strong style={{display:'flex',gap:8,alignItems:'center',color:'#b6f5d5',fontSize:13}}><CheckCircle2 size={18}/> Saved on this browser</strong>
        <span style={{fontSize:12,color:'#c1d2dc'}}>••••••••{geminiKey.slice(-4)}</span>
        <div style={{display:'flex',gap:8}}>
         <button type="button" aria-label="Edit saved Gemini API key" style={{...btn,flex:1}} onClick={()=>{setKeyStatus('editing');setKeyError('')}}><Pencil size={13} style={{verticalAlign:'middle'}}/> Change key</button>
         <button type="button" aria-label="Remove saved Gemini API key" style={btn} onClick={()=>void disconnect()} disabled={savingKey}><Trash2 size={13} style={{verticalAlign:'middle'}}/> Remove</button>
        </div>
       </div>
      :<div style={{display:'grid',gap:11}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
         <input type={revealKey?'text':'password'} autoComplete="off" spellCheck={false} aria-label="Gemini API key"
          placeholder="Paste your Google AI key" style={{...input,flex:1,padding:12,fontSize:12}}
          value={geminiKey} disabled={savingKey} onChange={e=>{setGeminiKey(e.target.value);setKeyError('')}}/>
         <button type="button" aria-label={revealKey?'Hide API key':'Show API key'} onClick={()=>setRevealKey(v=>!v)}
          style={{...btn,padding:10}}>{revealKey?<EyeOff size={17}/>:<Eye size={17}/>}</button>
        </div>
        {keyError&&<div role="alert" style={{...subtle,color:'#ffb4aa'}}>{keyError}</div>}
        {!keyError&&geminiKey.trim()&&!validGeminiApiKey(geminiKey)&&<span style={{...subtle,color:'#e9bda6'}}>Paste the complete Google AI Studio key (AQ. or AIza).</span>}
        {keyStatus==='error'&&<button type="button" style={btn} onClick={()=>void forgetKey()} disabled={savingKey}>Reset saved key</button>}
        <button type="button" aria-label="Save Gemini API key" onClick={()=>void saveKey()} disabled={savingKey}
         style={{...buttonPrimary,opacity:savingKey?.55:1}}><Save size={16}/> {savingKey?'Saving…':'Save API key'}</button>
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
         style={{display:'inline-flex',gap:6,alignItems:'center',fontSize:11,color:'#7dd8fa',textDecoration:'none',padding:'5px 0'}}>
         Don't have a key? Get one from Google AI Studio <ExternalLink size={13}/>
        </a>
       </div>}
     <div style={{...subtle,fontSize:10}}>Encrypted on this browser. The key is checked by Google when you generate captions. Avoid saving on shared devices.</div>
    </div>
   </div>,document.body)}
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
