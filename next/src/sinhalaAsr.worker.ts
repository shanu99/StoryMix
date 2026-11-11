/// <reference lib="webworker" />
/**
 * Dedicated local Whisper worker. No media, transcription or API tokens are
 * uploaded to StoryMix servers. Browser fetches pretrained model assets from
 * Hugging Face on first use and caches them. Inference occurs on-device.
 *
 * Source: fine-tuned Sinhala model, with generic multilingual fallback when
 * its browser weights cannot load. A download or WebGPU failure is surfaced
 * clearly rather than returning fake captions.
 */
import {pipeline,env} from '@huggingface/transformers'
import {cleanRecognition,splitLongCaptions,type CaptionSegment} from './sinhalaAsr'

type Start={
 type:'start'
 buffer:ArrayBuffer
 length:number
 sampleRate:16000
 model:'sinhala'|'multilingual'
 preferGpu:boolean
}
type WorkerEvent={
 type:'progress'|'caption'|'complete'|'error'
 stage?:string
 percent?:number
 finished?:number
 total?:number
 chunk?:CaptionSegment
 message?:string
 model?:string
}
const emit=(event:WorkerEvent)=>self.postMessage(event)
let working=false
const MODELS={
 sinhala:'hhettiarachchi/whisper-small-sinhala-onnx',
 multilingual:'onnx-community/whisper-base',
} as const
const SAMPLE_RATE=16000
const WINDOW_SECONDS=24

self.addEventListener('message',(event:MessageEvent<Start>)=>{
 if(event.data?.type!=='start'||working)return
 working=true
 void recognize(event.data).catch(error=>{
  emit({type:'error',message:error instanceof Error?error.message:String(error)})
 }).finally(()=>{working=false})
})

async function recognize(req:Start){
 if(!(req.buffer instanceof ArrayBuffer)||req.sampleRate!==SAMPLE_RATE){
  throw Error('Invalid 16 kHz waveform.')
 }
 const waveform=new Float32Array(req.buffer)
 if(!waveform.length||waveform.length>16000*60*25){
  throw Error('Choose audio between 0 and 25 minutes.')
 }
 const choice=MODELS[req.model]??MODELS.sinhala
 const progress=(event:{status?:string;file?:string;progress?:number})=>{
  if(event.status==='progress'&&Number.isFinite(event.progress)){
   emit({type:'progress',stage:'Downloading speech recognition model',percent:Math.round(event.progress!)})
  }else if(event.status==='initiate'){
   emit({type:'progress',stage:'Loading model assets…'})
  }else if(event.status==='done'){
   emit({type:'progress',stage:'Preparing speech recognizer…'})
  }
 }
 env.allowLocalModels=false
 const gpu=req.preferGpu&&typeof navigator!=='undefined'&&'gpu' in navigator
 type LocalPipeline=(audio:Float32Array,options:{language:string;task:string;return_timestamps:boolean})=>Promise<unknown>
 const loadAsr=pipeline as unknown as (task:'automatic-speech-recognition',model:string,options:{device:'wasm'|'webgpu';dtype:'q8'|'fp32';progress_callback:(event:{status?:string;file?:string;progress?:number})=>void})=>Promise<LocalPipeline>
 // The Sinhala-fine-tuned community export has produced "Unsupported model
 // type: whisper" on some browser/Transformers.js combinations. Instead of
 // breaking the button, retry with Hugging Face's maintained and widely-used
 // multilingual ONNX export, explicitly forcing Sinhala transcription.
 // Script checks in the Inspector reject romanized or non-Sinhala output.
 const candidates=req.model==='sinhala'
  ? [choice,'onnx-community/whisper-small']
  : [choice]
 let transcriber:LocalPipeline|undefined
 let chosen=choice
 const failures:string[]=[]
 for(const modelId of candidates){
  if(transcriber)break
  for(const device of gpu?['webgpu','wasm'] as const:['wasm'] as const){
   emit({type:'progress',stage:modelId===choice?'Loading Sinhala speech model…':'Using compatible Whisper model for Sinhala…'})
   try{
    transcriber=await loadAsr('automatic-speech-recognition',modelId,{
     device,dtype:device==='webgpu'?'fp32':'q8',progress_callback:progress,
    })
    chosen=modelId
    break
   }catch(error){
    const message=error instanceof Error?error.message:String(error)
    failures.push(modelId+' / '+device+': '+message)
    if(modelId===choice&&req.model==='sinhala'&&/unsupported model type|unsupported model|cannot load|not found|404|failed to fetch|model file/i.test(message)){
     break
    }
   }
  }
 }
 if(!transcriber)throw Error('Could not load an available Whisper model. '+failures.join(' | ').slice(0,600))
 const framesPerWindow=WINDOW_SECONDS*SAMPLE_RATE
 const total=Math.ceil(waveform.length/framesPerWindow)
 const normalized:CaptionSegment[]=[]
 for(let index=0;index<total;index++){
  const from=index*framesPerWindow
  const to=Math.min(waveform.length,from+framesPerWindow)
  const excerpt=waveform.slice(from,to)
  const chunkDuration=excerpt.length/SAMPLE_RATE
  const start=from/SAMPLE_RATE
  // Suppress clear digital silence before invoking Whisper; the model can
  // otherwise hallucinate lines on completely silent content.
  let energy=0
  for(let i=0;i<excerpt.length;i+=16)energy+=excerpt[i]*excerpt[i]
  const rms=Math.sqrt(energy/Math.max(1,Math.ceil(excerpt.length/16)))
  if(rms>=0.0006){
   const raw=await transcriber(excerpt,{
    language:'sinhala',task:'transcribe',return_timestamps:true,
   })
   const result=(Array.isArray(raw)?raw[0]:raw) as {text?:string;chunks?:Array<{text:string;timestamp:[number,number|null]}>}
   const chunks=(result.chunks?.length?result.chunks:[{
    text:result.text??'',timestamp:[0,chunkDuration],
   }]).map(item=>({
    text:item.text,timestamp:[item.timestamp?.[0]??0,item.timestamp?.[1]??chunkDuration],
   }))
   for(const caption of splitLongCaptions(cleanRecognition(chunks,chunkDuration))){
    const absolute={...caption,start:start+caption.start,end:start+caption.end}
    normalized.push(absolute)
    emit({type:'caption',chunk:absolute,finished:index+1,total})
   }
  }
  emit({type:'progress',stage:'Transcribing audio locally',finished:index+1,total,
   percent:Math.round((index+1)/total*100)})
 }
 emit({type:'complete',total,finished:total,model:chosen,message:normalized.length+' captions generated'})
}
