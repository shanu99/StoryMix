/** Reused tables from StoryPad Studio (FM Abhaya main and Isiwara Font Lab).
 * Encode only for rendering; original caption text must remain Unicode.
 * No manual conversion controls are exposed to StoryMix users.
 */
import fmData from './vendor/storypad-fm-abhaya.json'
import isiData from './vendor/storypad-isiwara.json'
export type LegacyEncoding='fm'|'isiwara'
export type CaptionFontRun={kind:'legacy'|'unicode';text:string;source:string}
const fmPairs=Object.entries({...fmData.mappings.singles,...fmData.mappings.combos}) as [string,string][]
const fmRules=Object.entries(fmData.mappings.rules) as [string,string][]
function trie(entries:readonly [string,string][]){
 const root:Record<string,unknown>={}
 for(const [key,value] of entries){let node=root;for(const char of key)node=(node as Record<string,any>)[char]??={};(node as Record<string,any>).value=value}
 return root
}
function longest(root:Record<string,unknown>,text:string,start:number):{value:string;end:number}|null{
 let node:Record<string,unknown>|undefined=root,best:null|{value:string;end:number}=null
 for(let i=start;i<text.length;i++){
  node=node?.[text[i]] as Record<string,unknown>|undefined
  if(!node)break
  if(typeof node.value==='string')best={value:node.value,end:i+1}
 }
 return best
}
const fmDecode=trie(fmPairs),fmRuleTrie=trie(fmRules)
function replaceWithTrie(input:string,root:Record<string,unknown>):string{
 let output=''
 for(let i=0;i<input.length;){const m=longest(root,input,i);if(m){output+=m.value;i=m.end}else output+=input[i++]}
 return output
}
function decodeFM(input:string):string{return replaceWithTrie(replaceWithTrie(input,fmRuleTrie),fmDecode)}
const fmInverse=new Map<string,string>()
for(const [encoded,unicode] of fmPairs){
 if(!/[\u0d80-\u0dff]/u.test(unicode)||decodeFM(encoded)!==unicode)continue
 const previous=fmInverse.get(unicode)
 if(!previous||encoded.length<previous.length)fmInverse.set(unicode,encoded)
}
const fmEncodeTrie=trie([...fmInverse])
// Reuse the Isiwara lab's listed replacements in their original order,
// matching its split/join conversion logic.
const isiPairs=isiData as [string,string][]
const isiEncodeTrie=trie(isiPairs.filter(([key])=>/[\u0d80-\u0dff]/u.test(key)))
function encodeSinhalaWord(input:string,encoding:LegacyEncoding):CaptionFontRun[]{
 const root=encoding==='fm'?fmEncodeTrie:isiEncodeTrie
 // Same optimal-partition priority as StoryPad Studio's FM encoder:
 // minimize unmapped Sinhala code units before optimizing segment length.
 type Step={miss:number;steps:number;end:number;kind:'legacy'|'unicode';text:string}
 const best:Step[]=new Array(input.length+1)
 best[input.length]={miss:0,steps:0,end:input.length,kind:'unicode',text:''}
 for(let i=input.length-1;i>=0;i--){
  const fallback=best[i+1]
  best[i]={miss:fallback.miss+1,steps:fallback.steps+1,end:i+1,kind:'unicode',text:input[i]}
  let node:Record<string,unknown>|undefined=root
  for(let j=i;j<input.length;j++){
   node=node?.[input[j]] as Record<string,unknown>|undefined
   if(!node)break
   if(typeof node.value!=='string')continue
   const next=best[j+1],current=best[i]
   // The Isiwara laboratory table contains a few pass-through Unicode
   // placeholders for unsupported glyphs: render those with the Unicode font.
   const unmapped=/[\\u0d80-\\u0dff]/u.test(node.value)
   const miss=next.miss+(unmapped?j-i+1:0)
   if(miss<current.miss||(miss===current.miss&&next.steps+1<current.steps))
    best[i]={miss,steps:next.steps+1,end:j+1,kind:unmapped?'unicode':'legacy',text:node.value}
  }
 }
 const pieces:CaptionFontRun[]=[]
 for(let i=0;i<input.length;){
  const step=best[i],source=input.slice(i,step.end),prev=pieces.at(-1)
  if(prev?.kind===step.kind){prev.text+=step.text;prev.source+=source}
  else pieces.push({kind:step.kind,text:step.text,source})
  i=step.end
 }
 return pieces
}
export function encodeCaptionForFont(text:string,encoding:LegacyEncoding):{
 runs:CaptionFontRun[];complete:boolean;unmapped:string[]
}{
 // Do not transform English or numbers. They must be drawn with a Unicode font.
 const original=text.normalize('NFC')
 const runs:CaptionFontRun[]=[]
 const unmapped:string[]=[]
 const segments=original.split(/([\u0d80-\u0dff\u200c\u200d]+)/u)
 for(const segment of segments){
  if(!segment)continue
  const pieces=/[\u0d80-\u0dff]/u.test(segment)?encodeSinhalaWord(segment,encoding):[{kind:'unicode' as const,text:segment,source:segment}]
  for(const piece of pieces){
   if(piece.kind==='unicode'&&/[\u0d80-\u0dff]/u.test(piece.text))unmapped.push(piece.source)
   const prev=runs.at(-1)
   if(prev?.kind===piece.kind){prev.text+=piece.text;prev.source+=piece.source}
   else runs.push({...piece})
  }
 }
 return {runs,complete:unmapped.length===0,unmapped}
}
export function detectLegacyFamily(name:string):LegacyEncoding|null{
 const n=name.toLowerCase().replace(/[\s_-]+/g,'')
 if(/(?:^|[^a-z])fm|fmabhaya|fm[\w]+/.test(n)||n.startsWith('fm'))return 'fm'
 if(/isiwara|isiguru|isidavas|isibindu|isibasuru|isiarund|isimalithi|^isi/.test(n))return 'isiwara'
 return null
}
