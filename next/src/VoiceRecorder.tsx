import {useEffect,useRef,useState} from 'react'
import {Mic,Square,Volume2} from 'lucide-react'
import {importFiles,insertMediaAsset,useTimelineEngine,usePlaybackStore} from '@elah/editor'

/** Records a locally-owned microphone track. Nothing is uploaded. */
export function VoiceRecorder(){
 const engine=useTimelineEngine()
 const currentFrame=usePlaybackStore(s=>s.currentFrame)
 const recorder=useRef<MediaRecorder|null>(null)
 const stream=useRef<MediaStream|null>(null)
 const parts=useRef<BlobPart[]>([])
 const startFrame=useRef(0)
 const [state,setState]=useState<'idle'|'recording'|'saving'>('idle')
 const [message,setMessage]=useState('')
 const stop=()=>{
  if(recorder.current&&recorder.current.state!=='inactive')recorder.current.stop()
  stream.current?.getTracks().forEach(t=>t.stop())
  stream.current=null
 }
 useEffect(()=>()=>stop(),[])
 const begin=async()=>{
  if(state!=='idle')return
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setMessage('Microphone recording is not supported in this browser.');return}
  try{
   const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false})
   stream.current=media
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(m=>MediaRecorder.isTypeSupported(m))||''
   const r=new MediaRecorder(media,mime?{mimeType:mime}:undefined)
   recorder.current=r
   parts.current=[]
   startFrame.current=currentFrame
   r.addEventListener('dataavailable',e=>{if(e.data.size)parts.current.push(e.data)})
   r.addEventListener('stop',async()=>{
    setState('saving')
    try{
     const type=r.mimeType||'audio/webm'
     const suffix=type.includes('mp4')?'m4a':'webm'
     const file=new File(parts.current,['StoryMix-voiceover-'+Date.now()+'.'+suffix].join(''),{type})
     // MediaRecorder may emit an empty file when stopped immediately.
     if(file.size===0)throw Error('No audio was recorded.')
     const result=await importFiles([file])
     if(result.imported.length!==1)throw Error('Recorded audio format could not be imported.')
     const inserted=await insertMediaAsset(engine,result.imported[0].id,{desiredStartFrame:startFrame.current})
     if(!inserted.ok)throw Error('Could not insert recording onto an audio track.')
     setMessage('Voiceover inserted at playhead. Save your project and retain your recording file if you need to relink later.')
    }catch(err){setMessage('Recording error: '+String(err))}
    finally{parts.current=[];recorder.current=null;setState('idle')}
   },{once:true})
   r.start(250)
   setState('recording')
   setMessage('Recording microphone locally. Click Stop when finished.')
  }catch(err){setState('idle');setMessage('Microphone unavailable: '+String(err))}
 }
 return <div style={{padding:14,color:'#dceefa',fontSize:12,display:'grid',gap:13}}>
  <strong style={{color:'#8cdbfa',fontSize:11,letterSpacing:'.08em'}}>VOICEOVER RECORDING</strong>
  <p style={{margin:0,color:'#a3bbcc',lineHeight:1.6}}>Record your narration directly from your microphone. Recording stays on your device and is inserted at the current playhead.</p>
  <button type="button" aria-label={state==='recording'?'Stop recording':'Start voiceover recording'} disabled={state==='saving'}
   onClick={state==='recording'?stop:begin} style={{border:'1px solid #355569',borderRadius:9,padding:12,background:state==='recording'?'#4d222b':'#173142',color:'#eaf7ff',display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
    {state==='recording'?<Square size={18}/>:<Mic size={18}/>}
    {state==='recording'?'Stop recording':state==='saving'?'Saving recording…':'Record microphone'}
  </button>
  <div style={{display:'flex',gap:8,color:'#a1b9c7'}}><Volume2 size={15}/> Microphone permissions are requested only when recording starts.</div>
  {message&&<output role="status" style={{color:'#b8dbeb',lineHeight:1.5}}>{message}</output>}
 </div>
}
