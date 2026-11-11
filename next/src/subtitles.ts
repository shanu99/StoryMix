export type Subtitle = {start:number;end:number;text:string}
const MAX_SRT_BYTES = 5 * 1024 * 1024
const MAX_CUES = 10000
const seconds = (value:string):number => {
  const m=value.trim().match(/^(\d{1,3}):(\d{2}):(\d{2})[,\.](\d{1,3})$/)
  if(!m || +m[2]>59 || +m[3]>59) throw new Error('Invalid SRT timestamp: '+value)
  return +m[1]*3600 + +m[2]*60 + +m[3]+(+m[4]/10**m[4].length)
}
const stamp=(s:number):string=>{
  const n=Math.max(0,Math.round(s*1000))
  return [String(Math.floor(n/3600000)).padStart(2,'0'),String(Math.floor(n%3600000/60000)).padStart(2,'0'),String(Math.floor(n%60000/1000)).padStart(2,'0')].join(':')+','+String(n%1000).padStart(3,'0')
}
export function parseSrt(raw:string):Subtitle[]{
  if(new TextEncoder().encode(raw).byteLength>MAX_SRT_BYTES) throw new Error('SRT file exceeds 5 MB safety limit')
  const blocks=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim().split(/\n\s*\n/)
  const parsed:Subtitle[]=[]
  for(const block of blocks){
    const lines=block.split('\n')
    const k=lines.findIndex(l=>l.includes('-->'))
    if(k<0) continue
    const parts=lines[k].split(/\s*-->\s*/)
    if(parts.length!==2) throw new Error('Invalid SRT timing line')
    const start=seconds(parts[0]),end=seconds(parts[1])
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('Invalid subtitle duration')
    const text=lines.slice(k+1).join('\n').trim()
    if(!text)continue
    parsed.push({start,end,text})
    if(parsed.length>MAX_CUES)throw new Error('SRT exceeds 10,000 captions')
  }
  return parsed.sort((a,b)=>a.start-b.start)
}
export function writeSrt(entries:Subtitle[]):string{
  return [...entries].filter(e=>Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.end>e.start&&e.text.trim()).sort((a,b)=>a.start-b.start).map((e,i)=>[i+1,stamp(e.start)+' --> '+stamp(e.end),e.text.trim(),''].join('\n')).join('\n')
}
