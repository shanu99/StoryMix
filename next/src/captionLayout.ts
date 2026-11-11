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
export function captionPresentation(canvas:CanvasSize):CaptionPresentation{
 const width=Math.max(240,canvas.width||1920)
 const height=Math.max(240,canvas.height||1080)
 // Keep text within the visual safe area; vertical phone video has a narrower
 // line width, while landscape can display wider lines without reducing size.
 const portrait=height>width*1.15
 const fontSize=Math.round(Math.max(20,Math.min(width*(portrait?.052:.043),height*.065,74)))
 const maxCharactersPerLine=Math.max(12,Math.floor(width*.80/(fontSize*.70)))
 return {fontSize,x:.5,y:portrait?.79:.84,maxCharactersPerLine}
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
 const compact=value.replace(/[\\s.,!?।…‘’“”\\-–—]/gu,'')
 if(/(.)\\1{7,}/u.test(compact)||/(.{2,5})\\1{5,}/u.test(compact))return 'Repeated letters detected. This looks like an AI transcription error; correct it in Sinhala.'
 if(compact.length>=18){
  const codepoints=Array.from(compact)
  const letters=codepoints.filter(c=>/[\\u0D85-\\u0DC6]/u.test(c))
  if(letters.length>=12){
   const counts=new Map<string,number>()
   for(const c of letters)counts.set(c,(counts.get(c)??0)+1)
   if(Math.max(...counts.values())/letters.length>.70)return 'Speech recognition appears to have repeated a single Sinhala letter. Please correct it.'
  }
 }
 if(value.split(/\\s+/u).some(word=>Array.from(word).length>45))return 'An unusually long word was recognized. Review and split this caption.'
 return null
}
