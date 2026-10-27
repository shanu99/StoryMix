/** Gemini assisted timed transcription. API key lives in input memory only. */
export async function transcribeAudio({file,apiKey,language='si',model='gemini-2.5-flash'}){
 if(!apiKey||!apiKey.trim())throw Error('Enter your own Gemini API key');
 if(!file||!file.type.startsWith('audio/'))throw Error('Choose an audio file for AI captions');
 if(file.size>14_000_000)throw Error('Audio file exceeds the 14 MB direct-request limit');
 const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const base64=btoa(binary);
 const prompt='Transcribe the spoken audio accurately. Primary language: '+(language==='si'?'Sinhala (සිංහල)':'English')+'. Preserve the words in their original language; do not translate. Return ONLY a JSON object with a "segments" array. Each segment has numeric "start" and "end" in seconds from the start of the audio and a "text" string. Each caption should be 1 to 2 short readable lines, approximately 2-5 seconds long. Do not invent speech. Do not include music or sound effects in transcript. Timestamps are approximate; align them to the audio.';
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),180000);
 try{
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
   method:'POST',signal:controller.signal,
   headers:{'Content-Type':'application/json','x-goog-api-key':apiKey.trim()},
   body:JSON.stringify({contents:[{parts:[{text:prompt},{inlineData:{mimeType:file.type||'audio/webm',data:base64}}]}],generationConfig:{responseMimeType:'application/json',temperature:0}})
  });
  let body=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(body?.error?.message||'Gemini request failed ('+response.status+')');
  let out=body?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  if(!out)throw Error('AI returned no transcript');
  let parsed=JSON.parse(out);
  if(!Array.isArray(parsed.segments))throw Error('AI response has no segments');
  const segments=parsed.segments.map(s=>({start:Number(s.start),end:Number(s.end),text:String(s.text||'').trim()}))
   .filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>s.start&&s.text)
   .sort((a,b)=>a.start-b.start);
  if(!segments.length)throw Error('No timed speech segments detected');
  return segments;
 }catch(err){if(err?.name==='AbortError')throw Error('Transcription timed out. Try a shorter audio clip');throw err}
 finally{clearTimeout(timeout)}
}
