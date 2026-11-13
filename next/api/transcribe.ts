/**
 * StoryMix Gemini transcription gateway for Vercel Vite project.
 * The caller supplies their own Gemini API key for THIS request only.
 * No central API key, persistent storage, request logging or third-party proxy.
 *
 * API: POST /api/transcribe with a 16-kHz mono WAV body (<= 2 MB)
 * Headers: x-storymix-gemini-key: <user key>
 */
export const maxDuration=60

type GeminiSegment={start:number;end:number;text:string}
type GeminiReply={segments?:unknown}
const MODELS=['gemini-3.5-flash-lite','gemini-3.6-flash'] as const
const MAX_BYTES=2_000_000
const LIMIT_SECONDS=50
const headers={
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store, private',
 'X-Content-Type-Options':'nosniff',
}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers})}
function errorMessage(status:number,message:string){return json({error:message},status)}
function decodeSegments(raw:unknown,duration:number):GeminiSegment[]{
 if(!raw||typeof raw!=='object')return []
 const value=raw as GeminiReply
 if(!Array.isArray(value.segments))return []
 const normalized:GeminiSegment[]=[]
 for(const item of value.segments.slice(0,200)){
  if(!item||typeof item!=='object')continue
  const seg=item as Record<string,unknown>
  const text=typeof seg.text==='string'?seg.text.normalize('NFC').replace(/\s+/gu,' ').trim():''
  const start=Number(seg.start),end=Number(seg.end)
  if(!text||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue
  const a=Math.max(0,Math.min(duration,start)),b=Math.max(0,Math.min(duration,end))
  if(b-a>=.12)normalized.push({start:a,end:b,text:text.slice(0,500)})
 }
 return normalized.sort((a,b)=>a.start-b.start)
}
export default {
 async fetch(request:Request):Promise<Response>{
  if(request.method!=='POST')return errorMessage(405,'Only POST is supported.')
  if(request.headers.get('content-type')?.split(';')[0]!=='audio/wav')return errorMessage(415,'Expected a 16 kHz mono WAV file.')
  const key=request.headers.get('x-storymix-gemini-key')?.trim()??''
  if(!/^(?:AIza[A-Za-z0-9_-]{25,}|AQ\.[^\s]{20,})$/.test(key))return errorMessage(401,'Enter a valid Google AI Studio API key.')
  const size=Number(request.headers.get('content-length')||0)
  if(size>MAX_BYTES)return errorMessage(413,'Audio chunk is too large. Please retry with a shorter clip.')
  let data:ArrayBuffer
  try{data=await request.arrayBuffer()}catch{return errorMessage(400,'Could not read audio data.')}
  if(data.byteLength<48||data.byteLength>MAX_BYTES)return errorMessage(413,'A WAV audio chunk must be between 48 bytes and 2 MB.')
  const view=new DataView(data)
  if(view.getUint32(0,false)!==0x52494646||view.getUint32(8,false)!==0x57415645)return errorMessage(415,'Invalid WAV header.')
  // Client sends 16-bit 16000-Hz mono PCM, which is exactly 32000 bytes/s.
  // Actual RIFF data chunk can have additional metadata, so clamp conservatively.
  const duration=Math.min(LIMIT_SECONDS,Math.max(.1,(data.byteLength-44)/32000))
  // Code-mixed Sri Lankan speech needs explicit orthography rules: a Latin
  // transcript can be plausible acoustically but is not a usable Sinhala caption.
  const instructions=[
   'Task: faithfully transcribe the speech in this short Sri Lankan audio excerpt into timestamped captions.',
   'Speakers may switch freely between spoken Sinhala and spoken English, even inside one sentence.',
   'Detect the language of EACH spoken word from its pronunciation and grammatical context.',
   'Write EVERY SINHALA word in natural Sinhala Unicode script (U+0D80–U+0DFF). NEVER romanize Sinhala as Singlish.',
   'Write genuinely spoken ENGLISH words, technology terms, and English names in correct English Latin spelling.',
   'Do not translate Sinhala into English or English into Sinhala. Do not turn correctly spoken English into phonetic Sinhala.',
   'A single caption may legitimately mix both scripts: මෙතන video එක edit කරන්න.',
   'EXAMPLES OF SPELLING ONLY, NOT AUDIO CONTENT:',
   'Spoken Sinhala mama, oyata, karanna, kiyala, thiyenawa, kohomada, hari, balanna must be written මම, ඔයාට, කරන්න, කියලා, තියෙනවා, කොහොමද, හරි, බලන්න.',
   'For spoken Sinhala-English mix “mama video eka edit karanawa”, write “මම video එක edit කරනවා”, NOT “mama video eka edit karanawa”.',
   'For “oya English subtitle eka add karanna”, write “ඔයා English subtitle එක add කරන්න”.',
   'Do NOT blindly change the Latin word “API” to Sinhala: when the speaker says the English technical acronym, keep API.',
   'Preserve the exact audible words and meaning, including repetition or grammatical irregularities. Never invent speech.',
   'Ignore background music, silence and sound effects. If no speech is heard, return {"segments":[]}.',
   'Use start/end timestamps in SECONDS relative to this audio excerpt. Captions should usually cover 2–6 seconds.',
   'Review each caption before responding. If a Latin token is actually a Sinhala word written as Singlish, correct that token to Sinhala Unicode.',
   'If a token is actually spoken English, retain correct English spelling. Do not overwrite valid English with Sinhala.',
   'Return ONLY a valid JSON object with a segments array: {"segments":[{"start":0.3,"end":2.1,"text":"මම video එක edit කරනවා"}]}.',
  ].join(' ')
  const modelRequest={
   contents:[{role:'user',parts:[
    {text:instructions},
    {inlineData:{mimeType:'audio/wav',data:Buffer.from(data).toString('base64')}},
   ]}],
   generationConfig:{
    responseMimeType:'application/json',
    temperature:0,
   },
  }
  // One bounded retry on transient upstream errors. The second attempt uses a
  // different generally-available audio-capable model. Never retry quota/auth errors.
  // Keep the total time below the 60-second serverless execution limit.
  let response:Response|null=null
  let usedModel:string=MODELS[0]
  let lastFailure: 'timeout'|'network'|null=null
  for(const model of MODELS){
   usedModel=model
   const controller=new AbortController()
   const timeout=setTimeout(()=>controller.abort(),23_000)
   try{
    response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
     method:'POST',
     headers:{'Content-Type':'application/json','x-goog-api-key':key,'x-goog-api-client':'storymix/0.3'},
     body:JSON.stringify(modelRequest),
     signal:controller.signal,
    })
    lastFailure=null
    // Retry only service errors or missing access to a particular model.
    if(![404,500,502,503,504].includes(response.status))break
   }catch(e){
    response=null
    lastFailure=controller.signal.aborted?'timeout':'network'
   }finally{clearTimeout(timeout)}
  }
  if(!response){
   return errorMessage(504,lastFailure==='timeout'
    ?'Gemini did not respond in time after two attempts. Please retry with a shorter clip.'
    :'Could not reach Google after two attempts. Check the connection and retry.')
  }
  if(!response.ok){
   // Never expose raw Google responses, credentials, or upstream request payloads.
   const code=response.status
   if(code===400)return errorMessage(400,'Gemini could not process this audio chunk. Try a shorter clip or another source.')
   if(code===401||code===403)return errorMessage(403,'Google rejected access for this API key. Check its permissions in AI Studio.')
   if(code===429)return errorMessage(429,'Gemini quota or rate limit reached. Check your Google AI Studio usage.')
   if(code===404)return errorMessage(502,'Neither available Gemini model could be used with this key.')
   if([500,502,503,504].includes(code))
    return errorMessage(503,'Google returned HTTP '+code+' after two model attempts. Its service may be overloaded; retry later.')
   return errorMessage(502,'Gemini request failed (HTTP '+code+').')
  }
  let parsed:unknown
  try{
   const body=await response.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>}
   const answer=body.candidates?.[0]?.content?.parts?.map(p=>p.text??'').join('')??''
   parsed=JSON.parse(answer.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''))
  }catch{return errorMessage(502,'Gemini did not provide valid timed captions. Please retry.')}
  return json({segments:decodeSegments(parsed,duration),model:usedModel})
 }
}
