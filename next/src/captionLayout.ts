/**
 * Consistent caption layout for any project aspect ratio.
 * Stage dimensions are the export canvas, not the left-side workspace size.
 */
export interface CanvasSize {width:number;height:number}
export interface CaptionPresentation {
 fontSize:number
 x:number
 y:number
 maxCharactersPerLine:number
}
export function videoStageFromMedia(width:number,height:number):CanvasSize|null{
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null
 const ratio=width/height
 if(Math.abs(ratio-16/9)<.045)return {width:1920,height:1080}
 if(Math.abs(ratio-9/16)<.035)return {width:1080,height:1920}
 if(Math.abs(ratio-1)<.035)return {width:1080,height:1080}
 if(Math.abs(ratio-4/5)<.035)return {width:1080,height:1350}
 if(ratio>=1)return {width:1920,height:Math.max(360,Math.round(1920/ratio))}
 return {width:1080,height:Math.max(540,Math.round(1080/ratio))}
}
/**
 * When a portrait video is inside a landscape project, fit the caption to
 * the ACTUAL rendered video rectangle, not the empty letterbox surrounding it.
 * Preserve the user's project aspect ratio rather than silently changing it.
 */
export function captionPresentation(canvas:CanvasSize,source?:CanvasSize|null):CaptionPresentation{
 const stageW=Math.max(240,canvas.width||1920)
 const stageH=Math.max(240,canvas.height||1080)
 const hasSource=source&&source.width>0&&source.height>0
 const ratio=hasSource?source.width/source.height:stageW/stageH
 const displayW=Math.min(stageW,stageH*ratio)
 const displayH=Math.min(stageH,stageW/ratio)
 const portrait=ratio<.85
 const fontSize=Math.round(Math.max(18,Math.min(displayW*(portrait?.050:.041),displayH*.065,72)))
 const chars=Math.max(10,Math.floor(displayW*.78/Math.max(1,fontSize*.75)))
 const yOffset=(stageH-displayH)/2
 const y=(yOffset+displayH*(portrait?.78:.82))/stageH
 return {fontSize,x:.5,y,maxCharactersPerLine:Math.min(44,chars)}
}
export function wrapCaption(text:string,maxCharacters:number):string{
 const normalized=text.normalize('NFC').replace(/\s+/gu,' ').trim()
 if(!normalized||normalized.length<=maxCharacters)return normalized
 const words=normalized.split(' ')
 if(words.length<2)return normalized
 const lines:string[]=['']
 for(const word of words){
  const index=lines.length-1
  if(!lines[index])lines[index]=word
  else if((lines[index].length+1+word.length)<=maxCharacters)lines[index]+=' '+word
  else lines.push(word)
 }
 // Never create an unbounded stack of lines across the entire video.
 if(lines.length<=2)return lines.join('\n')
 const cut=Math.ceil(words.length/2)
 return [words.slice(0,cut).join(' '),words.slice(cut).join(' ')].join('\n')
}
/** Reject model hallucinations, especially one repeated Sinhala glyph or syllable.
 * Valid Sinhala script alone does NOT make a transcript intelligible.
 */
export function captionScriptIssue(text:string):string|null{
 const value=text.normalize('NFC').trim()
 if(!value)return 'Caption text is empty.'
 // Sinhala language output should not be Singlish or Latin transliteration.
 // Do not silently transliterate or invent words: ask for a corrected Sinhala
 // transcript. Latin brand names should be spelled in Sinhala as well.
 if(/[A-Za-z]/u.test(value))return 'Singlish/English letters detected. Correct this line to Sinhala Unicode.'
 if(/[\u0900-\u0D7F\u0E00-\u0FFF]/u.test(value))return 'Another writing system detected. Sinhala Unicode is required.'
 if(!/[\u0D80-\u0DFF]/u.test(value))return 'Sinhala characters are missing from this line.'
 if(value.length>100)return 'Caption is too long. Split into short, readable Sinhala lines.'
 const compact=value.replace(/[\s.,!?।…‘’“”\-–—]/gu,'')
 if(/(.)\1{7,}/u.test(compact)||/(.{2,5})\1{5,}/u.test(compact))return 'Repeated letters detected. This looks like an AI transcription error; correct it in Sinhala.'
 if(compact.length>=18){
  const codepoints=Array.from(compact)
  const letters=codepoints.filter(c=>/[\u0D85-\u0DC6]/u.test(c))
  if(letters.length>=12){
   const counts=new Map<string,number>()
   for(const c of letters)counts.set(c,(counts.get(c)??0)+1)
   if(Math.max(...counts.values())/letters.length>.70)return 'Speech recognition appears to have repeated a single Sinhala letter. Please correct it.'
  }
 }
 if(value.split(/\s+/u).some(word=>Array.from(word).length>45))return 'An unusually long word was recognized. Review and split this caption.'
 return null
}
