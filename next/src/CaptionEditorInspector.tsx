import {useEffect,useRef,useState,type CSSProperties} from 'react'
import {Check,Download,ChevronDown,Plus,Paintbrush,AlertCircle} from 'lucide-react'
import {useTimelineEngine,useTracksStore,useSelectionStore,usePlaybackStore,useMediaLibraryStore,type Clip} from '@elah/editor'
import {TextClipProperties} from './TextClipProperties'
import {captionPresentation,wrapCaption,splitCaptionForDisplay,captionQualityIssue} from './captionLayout'
import {sourceSecondsToTimelineFrame} from './sinhalaAsr'
import {useCaptionWorkspace} from './CaptionWorkspaceState'
import {writeSrt} from './subtitles'
import {importCustomCaptionFont,listCustomCaptionFonts,removeCustomCaptionFont,type CustomCaptionFont} from './customCaptionFonts'
import {detectLegacyFamily,type LegacyEncoding} from './legacyCaptionEncoding'
import {applyCaptionFont,captionGroup,captionUnicode,mainCaptionClips} from './legacyCaptionClips'
import '@fontsource/abhaya-libre/400.css'
import '@fontsource/abhaya-libre/700.css'
import '@fontsource-variable/noto-serif-sinhala'
import '@fontsource/noto-sans-sinhala/700.css'
import '@fontsource/gemunu-libre/700.css'
import '@fontsource/yaldevi/700.css'

const control:CSSProperties={padding:'9px 10px',border:'1px solid #38566c',borderRadius:8,background:'#112334',color:'#e8f6ff',width:'100%',fontFamily:'Noto Sans Sinhala, Inter, sans-serif',fontSize:12}
const button:CSSProperties={padding:'10px 11px',border:'1px solid #385c74',borderRadius:8,background:'#18364a',color:'#e8f7ff',cursor:'pointer',fontSize:12}
const secondary='#9eb8cc'
type Style='clean'|'bold'|'cinematic'|'creator'|'highlight'|'minimal'
type Preset={
 id:Style;name:string;description:string;font:string;weight:'normal'|'bold';
 fill:string;size:number;outline:number;outlineColor:string;shadow:number;shadowY:number;vertical:number;previewSize:number
}
const PRESETS:Preset[]=[
 {id:'clean',name:'Classic',description:'Simple broadcast',font:'Noto Sans Sinhala',weight:'normal',fill:'#ffffff',size:.86,outline:.045,outlineColor:'#030b12',shadow:3,shadowY:2,vertical:0,previewSize:14},
 {id:'bold',name:'Impact',description:'Heavy display',font:'Gemunu Libre',weight:'bold',fill:'#ffffff',size:1.42,outline:.16,outlineColor:'#02060c',shadow:12,shadowY:5,vertical:-.06,previewSize:26},
 {id:'cinematic',name:'Film',description:'Elegant Sinhala serif',font:'Abhaya Libre',weight:'bold',fill:'#fff4e5',size:1.22,outline:.015,outlineColor:'#1b1318',shadow:8,shadowY:5,vertical:.025,previewSize:23},
 {id:'creator',name:'Pop',description:'Vibrant creator',font:'Yaldevi',weight:'bold',fill:'#ffef4c',size:1.28,outline:.12,outlineColor:'#250730',shadow:12,shadowY:5,vertical:-.05,previewSize:22},
 {id:'highlight',name:'Editorial',description:'Premium letterforms',font:'Noto Serif Sinhala Variable',weight:'bold',fill:'#b9eafa',size:1.07,outline:.035,outlineColor:'#0a2132',shadow:6,shadowY:3,vertical:.02,previewSize:19},
 {id:'minimal',name:'Quiet',description:'Delicate subtitles',font:'Abhaya Libre',weight:'normal',fill:'#ffffff',size:.75,outline:0,outlineColor:'#000000',shadow:1,shadowY:1,vertical:.075,previewSize:15},
]
const preset=(id:Style):Preset=>PRESETS.find(p=>p.id===id)??PRESETS[0]

function downloadSrt(text:string){
 const blob=new Blob([text],{type:'text/plain;charset=utf-8'})
 const url=URL.createObjectURL(blob)
 const link=document.createElement('a')
 link.href=url;link.download='StoryMix-Sinhala-Auto-Captions.srt'
 document.body.appendChild(link);link.click();link.remove()
 setTimeout(()=>URL.revokeObjectURL(url),15000)
}
function ClipAppearance({style,setStyle}:{style:Style;setStyle:(style:Style)=>void}){
 return <div style={{display:'grid',gap:10}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
   <strong style={{fontSize:12,color:'#e7f5ff'}}>Caption looks</strong>
   <span style={{fontSize:10,color:secondary}}>Tap a look to apply instantly</span>
  </div>
  <div role="group" aria-label="Caption style presets" style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>
   {PRESETS.map(p=><button key={p.id} type="button" aria-label={p.name+' caption preset'} aria-pressed={style===p.id}
    onClick={()=>setStyle(p.id)}
    style={{background:'#162535',color:'#eaf5ff',border:'1px solid '+(style===p.id?'#16b9f5':'#355064'),borderRadius:10,padding:5,display:'grid',gap:6,cursor:'pointer',textAlign:'left',boxShadow:style===p.id?'0 0 0 1px #16b9f5':'none'}}>
    <div aria-hidden="true" style={{height:88,borderRadius:6,background:p.id==='creator'?'linear-gradient(145deg,#4c2b66,#101b2f 65%)':p.id==='cinematic'?'linear-gradient(145deg,#2e2835,#0a111d 65%)':'linear-gradient(145deg,#344b61 0%,#152332 42%,#081018 100%)',
      display:'flex',justifyContent:'center',alignItems:p.vertical<-.03?'center':'flex-end',overflow:'hidden',padding:'7px 3px 13px'}}>
     <span lang="si" style={{fontFamily:p.font+', sans-serif',fontSize:p.previewSize,fontWeight:p.weight,color:p.fill,
      lineHeight:1.45,whiteSpace:'nowrap',textShadow:p.id==='creator'?'2px 3px 0 #ee3265, 4px 5px 0 #172234':'0 '+p.shadowY+'px '+Math.min(p.shadow,8)+'px #000, 0 1px 2px #000',
      WebkitTextStroke:p.outline>0?(p.outline*17).toFixed(1)+'px '+p.outlineColor:'0px transparent'}}>
      ආයුබෝවන්
     </span>
    </div>
    <div style={{display:'flex',justifyContent:'space-between',gap:4,alignItems:'center',padding:'0 4px 4px'}}>
     <span style={{display:'grid',gap:2}}>
      <strong style={{fontSize:11,color:'#eaf5ff'}}>{p.name}</strong>
      <span style={{fontSize:9,color:'#a8c0d0'}}>{p.description}</span>
     </span>
     {style===p.id&&<Check size={13} color="#16b9f5"/>}
    </div>
   </button>)}
  </div>
 </div>
}
function stylePatch(style:Style,stage:{width:number;height:number},sourceSize?:{width:number;height:number}|null):Partial<Clip>{
 const layout=captionPresentation(stage,sourceSize)
 const p=preset(style)
 const fontSize=Math.max(18,Math.round(layout.fontSize*p.size))
 return {
  fontFamily:p.font,fontSize,fontWeight:p.weight,color:p.fill,textAlign:'center',
  textOutline:{color:p.outlineColor,width:Math.round(fontSize*p.outline)},
  textShadow:{color:'#000000',blur:p.shadow,offsetX:0,offsetY:p.shadowY},
  transform:{x:layout.x,y:Math.max(.1,Math.min(.93,layout.y+p.vertical)),scale:1,rotation:0,anchor:{x:.5,y:.5}},
 }
}

function FontLibrary({
 fonts,choice,onChoose,onUpload,onDelete,busy,notice,kind,onKind
}:{
 fonts:CustomCaptionFont[];choice:string;onChoose:(font:string)=>void;
 onUpload:(file:File)=>void;onDelete:(id:string)=>void;
 busy:boolean;notice:string;kind:'unicode'|'legacy';onKind:(kind:'unicode'|'legacy')=>void
}){
 const fileInput=useRef<HTMLInputElement>(null)
 return <div style={{display:'grid',gap:9,padding:11,background:'#112637',border:'1px solid #304e63',borderRadius:10}}>
  <strong style={{fontSize:12}}>Sinhala Font Library</strong>
  <span style={{fontSize:10,color:secondary}}>Choose a real typeface, not just a different color.</span>
  <select aria-label="Caption font family" value={choice} onChange={e=>onChoose(e.target.value)} style={control}>
   <option value="">Use selected preset font</option>
   <optgroup label="Unicode · Ready to use">
    {['Noto Sans Sinhala','Gemunu Libre','Yaldevi','Abhaya Libre','Noto Serif Sinhala Variable'].map(font=>
     <option value={font} key={font}>{font}</option>)}
   </optgroup>
   {fonts.some(f=>f.kind==='unicode')&&<optgroup label="My fonts · Unicode">
    {fonts.filter(f=>f.kind==='unicode').map(font=><option key={font.id} value={font.family}>{font.name}</option>)}
   </optgroup>}
   {fonts.some(f=>f.kind==='legacy')&&<optgroup label="FM / Isiwara · Auto-render">
    {fonts.filter(f=>f.kind==='legacy').map(font=><option key={font.id} value={font.family}
     disabled={!detectLegacyFamily(font.name)}>{font.name}{detectLegacyFamily(font.name)?' · automatic':' · unknown mapping'}</option>)}
   </optgroup>}
  </select>
  <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
   <select aria-label="Imported font encoding" value={kind} onChange={e=>onKind(e.target.value as 'unicode'|'legacy')} style={{...control,width:'auto',flex:1}}>
    <option value="unicode">Unicode font</option>
    <option value="legacy">FM / Isiwara (legacy)</option>
   </select>
   <input ref={fileInput} type="file" accept=".ttf,.otf,.woff,.woff2" aria-label="Upload font file"
    style={{display:'none'}} onChange={e=>{const file=e.currentTarget.files?.[0];if(file)onUpload(file);e.currentTarget.value=''}}/>
   <button type="button" disabled={busy} aria-label="Import caption font" onClick={()=>fileInput.current?.click()}
    style={{...button,width:'auto',opacity:busy?.6:1}}>+ Import font</button>
  </div>
  {kind==='legacy'&&<span role="note" style={{fontSize:10,color:'#ffcb98',lineHeight:1.5}}>
   FM / Isiwara fonts automatically use StoryPad Studio encoding rules. Your original Unicode captions remain available for editing and SRT.
  </span>}
  {fonts.length>0&&<div style={{display:'grid',gap:5,maxHeight:160,overflowY:'auto'}}>
   {fonts.map(font=><div key={font.id} style={{display:'flex',gap:5,alignItems:'center',justifyContent:'space-between'}}>
    <span style={{fontFamily:font.family+', sans-serif',color:'#e9faff',fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}} title={font.name}>
     {font.name} {font.kind==='legacy'?'· Legacy':''}
    </span>
    <button type="button" aria-label={'Remove font '+font.name} onClick={()=>onDelete(font.id)}
     style={{...button,padding:'4px 7px',fontSize:10}}>Remove</button>
   </div>)}
  </div>}
  {notice&&<output role="status" style={{fontSize:10,color:'#a1e6ff',lineHeight:1.5}}>{notice}</output>}
 </div>
}
export function CaptionEditorInspector(){
 const engine=useTimelineEngine()
 const tracks=useTracksStore(s=>s.tracks)
 const clips=useTracksStore(s=>s.clips)
 const stage=useTracksStore(s=>s.stage)
 const assets=useMediaLibraryStore(s=>s.assets)
 const selectedIds=useSelectionStore(s=>s.selectedClipIds)
 const currentFrame=usePlaybackStore(s=>s.currentFrame)
 const {draft,setDraft,reviewReady,setReviewReady,sourceClipId,feedback,setFeedback,languageMode}=useCaptionWorkspace()
 const [timings,setTimings]=useState(false)
 const [manual,setManual]=useState(false)
 const [text,setText]=useState('')
 const [seconds,setSeconds]=useState(3)
 const [style,setStyle]=useState<Style>('bold')
 const [customFonts,setCustomFonts]=useState<CustomCaptionFont[]>([])
 const [fontOverride,setFontOverride]=useState('')
 const [fontKind,setFontKind]=useState<'unicode'|'legacy'>('unicode')
 const [fontBusy,setFontBusy]=useState(false)
 const [fontNotice,setFontNotice]=useState('')
 const [,setSourceEditing]=useState('')
 useEffect(()=>{
  let active=true
  void listCustomCaptionFonts().then(fonts=>{if(active)setCustomFonts(fonts)})
   .catch(()=>{if(active)setFontNotice('Browser font storage unavailable; built-in fonts still work.')})
  return()=>{active=false}
 },[])
 const [error,setError]=useState('')
 const selectedText=Object.values(clips).flat().find(c=>selectedIds.has(c.id)&&c.type==='text')
 const captionClips=tracks.filter(t=>t.kind==='elements'&&/caption/i.test(t.name)).flatMap(t=>clips[t.id]??[]).filter(c=>c.type==='text')
 const allCaptionClips=Object.values(clips).flat().filter(c=>c.type==='text'&&(/caption/i.test(c.name)||!!captionGroup(c)))
 const captionTargets=mainCaptionClips(allCaptionClips)
 const edit=(index:number,patch:{text?:string;start?:number;end?:number})=>setDraft(rows=>rows.map((r,i)=>i===index?{...r,...patch}:r))
 const issues=draft.map(r=>captionQualityIssue(r.text,languageMode))
 const valid=draft.length>0&&issues.every(issue=>!issue)&&draft.every(r=>r.end>r.start)
 const source=engine.findClip(sourceClipId)?.clip
 const primaryVideo=Object.values(clips).flat().find(c=>c.type==='video')
 const layoutVideo=source?.type==='video'?source:primaryVideo
 const sourceAsset=layoutVideo?.assetId?assets[layoutVideo.assetId]:undefined
 const contentSize=sourceAsset?.width&&sourceAsset?.height
  ? {width:sourceAsset.width,height:sourceAsset.height}:null
 const captionLayout=captionPresentation(stage,contentSize)
 const toTimeline=(start:number,end:number)=>{
  if(!source)throw Error('Source clip was removed. Please regenerate the captions.')
  const timelineStart=sourceSecondsToTimelineFrame(start,source.startFrame,source.speed??1)
  const timelineEnd=Math.min(source.startFrame+source.durationFrames,sourceSecondsToTimelineFrame(end,source.startFrame,source.speed??1))
  return {start:timelineStart,end:timelineEnd}
 }
 const insert=()=>{
  if(!source||!valid){setError('Please correct all Sinhala captions and timing values first.');return}
  try{
   const layout=captionLayout
   const sorted=[...draft].sort((a,b)=>a.start-b.start)
   let inserted=0
   const insertedClips:Clip[]=[]
   engine.batch(()=>{
    const target=engine.addTrack('elements',{name:'AI Captions — Sinhala'})
    let last=source.startFrame
    for(const row of sorted){
     const t=toTimeline(row.start,row.end)
     const start=Math.max(last,t.start),end=Math.min(source.startFrame+source.durationFrames,t.end)
     if(end<=start)continue
     const cards=splitCaptionForDisplay(row.text.normalize('NFC').trim(),layout.maxCharactersPerLine)
     const span=end-start
     for(let index=0;index<cards.length;index++){
      const cardStart=start+Math.round(span*index/cards.length)
      const cardEnd=start+Math.round(span*(index+1)/cards.length)
      if(cardEnd<=cardStart)continue
      const patch=patchForStyle(style)
      const created=engine.addClip({type:'text',trackId:target.id,name:'AI Caption',startFrame:cardStart,durationFrames:cardEnd-cardStart,
       text:{content:cards[index],fontFamily:fontForStyle(),fontSize:patch.fontSize,color:patch.color,textAlign:'center'}})
      engine.updateClip(created.id,target.id,patch)
      insertedClips.push(created)
      inserted++
     }
     last=end
    }
   },'Insert generated Sinhala captions')
   const encoding=currentFontEncoding()
   if(encoding)for(const clip of insertedClips)changeCaptionFont(clip,fontForStyle(),encoding)
   setFeedback(inserted+' editable Sinhala captions added. Select a caption on the timeline to edit it here.')
   setReviewReady(false);setDraft([]);setError('')
  }catch(e){setError('Could not add captions: '+String(e))}
 }
 const exportSrt=()=>{
  if(!valid||!source)return
  const rows=draft.map(r=>{
   const t=toTimeline(r.start,r.end)
   return {start:t.start/30,end:t.end/30,text:r.text.trim().normalize('NFC')}
  })
  downloadSrt(writeSrt(rows))
 }
 const addManual=()=>{
  if(!text.trim()){setError('Enter caption text first.');return}
  const start=Math.max(0,currentFrame),frames=Math.max(1,Math.round(seconds*30))
  if(Array.from(text.trim()).length>captionLayout.maxCharactersPerLine*2){setError('Manual caption is too long for this video. Split it into shorter lines first.');return}
  let target=tracks.find(t=>t.kind==='elements'&&/caption/i.test(t.name)&&!t.locked&&(clips[t.id]??[]).every(c=>c.startFrame+c.durationFrames<=start||c.startFrame>=start+frames))
  if(!target)target=engine.addTrack('elements',{name:'Captions'})
  try{
   const layout=captionLayout,patch=patchForStyle(style)
   const created=engine.addClip({type:'text',trackId:target.id,name:'Caption',startFrame:start,durationFrames:frames,
    text:{content:wrapCaption(text.trim(),layout.maxCharactersPerLine),fontFamily:fontForStyle(),fontSize:patch.fontSize,color:patch.color,textAlign:'center'}})
   engine.updateClip(created.id,target.id,patch)
   const encoding=currentFontEncoding()
   if(encoding)changeCaptionFont(created,fontForStyle(),encoding)
   setText('');setError('');setFeedback('Caption added. Select it on the timeline for precise adjustments.')
  }catch(e){setError('Could not add caption: '+String(e))}
 }
 const fontForStyle=()=>fontOverride||preset(style).font
 const patchForStyle=(chosen:Style,font=fontOverride):Partial<Clip>=>({
  ...stylePatch(chosen,stage,contentSize),
  ...(font?{fontFamily:font}:{})
 })
 const currentFontEncoding=(family=fontOverride):LegacyEncoding|null=>{
  const found=customFonts.find(f=>f.family===family)
  return found?.kind==='legacy'?detectLegacyFamily(found.name):null
 }
 const changeCaptionFont=(target:Clip,font:string,encoding:LegacyEncoding|null,override?:string)=>{
  return applyCaptionFont({
   engine,clip:target,allClips:Object.values(clips).flat(),tracks,
   font,encoding,stageWidth:stage.width,stageHeight:stage.height,sourceOverride:override
  })
 }
 const chooseFont=async(font:string,uploaded?:CustomCaptionFont)=>{
  const stored=uploaded??customFonts.find(f=>f.family===font)
  const encoding=stored?.kind==='legacy'?detectLegacyFamily(stored.name):null
  if(stored?.kind==='legacy'&&!encoding){
   setFontNotice('This font has an unknown legacy layout. Rename it FM or Isi and import again to identify the mapping.');return
  }
  const effective=font||preset(style).font
  setFontOverride(font)
  try{await document.fonts.load('700 32px "'+effective+'"','සිංහල Caption')}
  catch{/* system fallback remains available */}
  const selectedGroup=selectedText?captionGroup(selectedText):null
  const targets=selectedGroup
   ?captionTargets.filter(c=>captionGroup(c)?.id===selectedGroup.id)
   :selectedText&&captionTargets.some(c=>c.id===selectedText.id)?[selectedText]:captionTargets
  let changed=0,unmapped=0
  try{
   for(const target of targets.filter(c=>!engine.isTrackLocked(c.trackId))){
    const result=changeCaptionFont(target,effective,encoding)
    if(result.changed)changed++
    unmapped+=result.unmapped.length
   }
   setFontNotice((stored?.name??effective)+' applied to '+changed+' captions.'+(unmapped?' '+unmapped+' glyphs used Unicode fallback.':''))
  }catch(e){setFontNotice(e instanceof Error?e.message:'Could not apply font to captions.')}
 }
 const uploadFont=async(file:File)=>{
  setFontBusy(true);setFontNotice('')
  try{
   const uploaded=await importCustomCaptionFont(file,fontKind)
   setCustomFonts(await listCustomCaptionFonts())
   await chooseFont(uploaded.family,uploaded)
   setFontNotice('Font imported: '+uploaded.name+(uploaded.kind==='legacy'?' · auto-converted caption rendering':' · Unicode'))
  }catch(e){setFontNotice(e instanceof Error?e.message:'Font could not be imported.')}
  finally{setFontBusy(false)}
 }
 const deleteFont=async(id:string)=>{
  try{
   const removed=customFonts.find(f=>f.id===id)
   if(removed?.family===fontOverride)await chooseFont('')
   await removeCustomCaptionFont(id)
   setCustomFonts(await listCustomCaptionFonts())
   setFontNotice('Font removed from this browser.')
  }catch(e){setFontNotice(e instanceof Error?e.message:'Could not remove font.')}
 }
 const fontLibrary=<FontLibrary fonts={customFonts} choice={fontOverride}
  onChoose={value=>{void chooseFont(value)}} onUpload={file=>{void uploadFont(file)}}
  onDelete={id=>{void deleteFont(id)}} busy={fontBusy} notice={fontNotice} kind={fontKind} onKind={setFontKind}/>
 const choosePreset=async(next:Style)=>{
  setStyle(next)
  const targets=!reviewReady
   ?(selectedText&&captionTargets.some(c=>c.id===selectedText.id)?[selectedText]:captionTargets).filter(c=>!engine.isTrackLocked(c.trackId))
   :[]
  if(!targets.length)return
  const nextPreset=preset(next)
  try{
   // Ensure the font is available to the editor canvas BEFORE refreshing clips.
   await document.fonts.load((nextPreset.weight==='bold'?'700':'400')+' 32px "'+nextPreset.font+'"','ආයුබෝවන්')
  }catch{ /* Canvas can still use system fallbacks if font loading is blocked. */ }
  engine.batch(()=>targets.forEach(c=>{
   const patch=patchForStyle(next)
   if(captionGroup(c))delete patch.fontFamily
   engine.updateClip(c.id,c.trackId,patch)
  }),'Apply caption look: '+nextPreset.name)
  setFeedback('Applied '+nextPreset.name+' to '+targets.length+' caption'+(targets.length===1?'':'s')+'.')
 }
 const applyAll=()=>{
  const targets=captionTargets.filter(c=>!engine.isTrackLocked(c.trackId))
  engine.batch(()=>targets.forEach(c=>{
   const patch=patchForStyle(style)
   if(captionGroup(c))delete patch.fontFamily
   engine.updateClip(c.id,c.trackId,patch)
  }),'Style all captions')
  setFeedback('Updated '+targets.length+' caption styles.')
 }
 if(!reviewReady&&selectedText){
  const selectedGroup=captionGroup(selectedText)
  if(selectedGroup){
   const main=captionTargets.find(c=>captionGroup(c)?.id===selectedGroup.id)??selectedText
   const original=captionUnicode(main)
   return <section aria-label="Caption editor inspector" style={{display:'grid',gap:12,padding:14,overflowY:'auto',color:'#e7f5ff'}}>
    <strong>Caption typography</strong>
    <ClipAppearance style={style} setStyle={next=>{void choosePreset(next)}}/>
    {fontLibrary}
    <label style={{display:'grid',gap:7,fontSize:11,color:secondary}}>Caption text · Unicode original
     <textarea key={original} aria-label="Edit original Unicode caption" defaultValue={original}
      onChange={e=>setSourceEditing(e.currentTarget.value)}
      onBlur={e=>{
       const updated=e.currentTarget.value.normalize('NFC').trim()
       if(!updated||updated===original)return
       try{changeCaptionFont(main,fontForStyle(),currentFontEncoding(),updated);setSourceEditing('');setFontNotice('Caption updated without losing Unicode.')}
       catch(err){setFontNotice(String(err))}
      }} rows={3} style={{...control,resize:'vertical'}}/>
    </label>
    <div style={{fontSize:10,color:secondary}}>Font changes are automatic. English words use a separate Unicode text layer.</div>
    <button type="button" onClick={()=>{void chooseFont('')}} style={button}>Use Unicode font instead</button>
   </section>
  }

  const isCaption=captionClips.some(c=>c.id===selectedText.id)
  if(!isCaption)return <TextClipProperties/>
  return <div style={{overflowY:'auto',height:'100%',display:'grid',alignContent:'start',gap:10,padding:'12px 0'}}>
   <div style={{padding:'0 12px',display:'grid',gap:9}}>
    <ClipAppearance style={style} setStyle={next=>{void choosePreset(next)}}/>
    {fontLibrary}
    <button type="button" aria-label="Apply preset to selected caption" style={{...button,background:'#105f82'}}
     onClick={()=>{engine.updateClip(selectedText.id,selectedText.trackId,patchForStyle(style));setFeedback('Applied '+preset(style).name+' to selected caption.')}}>
     <Paintbrush size={14} style={{verticalAlign:'middle'}}/> Apply to selected caption
    </button>
    <button type="button" aria-label="Apply selected preset to all captions" style={button} onClick={applyAll}>
     Apply to all captions ({captionClips.length})
    </button>
    {feedback&&<span role="status" style={{fontSize:11,color:'#9ce4ff'}}>{feedback}</span>}
   </div>
   <TextClipProperties/>
  </div>
 }
 return <section aria-label="Caption editor inspector" style={{display:'grid',gap:13,padding:14,color:'#e7f5ff',fontSize:12,overflowY:'auto'}}>
  <div style={{display:'grid',gap:4}}>
   <strong style={{fontSize:14}}>{reviewReady?'Review Sinhala captions':'Caption editor'}</strong>
   <span style={{fontSize:11,color:secondary}}>{stage.width} × {stage.height} · Captions fit the visible video, not black bars</span>
  </div>
  <ClipAppearance style={style} setStyle={next=>{void choosePreset(next)}}/>
  {fontLibrary}
  {!reviewReady&&captionClips.length>0&&<button type="button" aria-label="Apply selected preset to all captions" style={{...button,background:'#105f82',fontWeight:700}} onClick={applyAll}><Paintbrush size={14} style={{verticalAlign:'middle'}}/> Apply to all captions ({captionClips.length})</button>}
  {reviewReady&&<>
   <div style={{fontSize:11,color:secondary}}>Correct recognized words here. The timeline and text styling stay separate from caption generation.</div>
   {issues.some(Boolean)&&<div role="alert" style={{fontSize:11,color:'#ffb7a2'}}>Some generated lines look incorrect, repeated, or too long. Please correct the highlighted lines before adding captions.</div>}
   <div style={{display:'grid',gap:9,maxHeight:'min(45vh,420px)',overflowY:'auto'}}>
   {draft.map((r,i)=><div key={i} style={{padding:9,background:'#13283b',border:'1px solid '+(issues[i]?'#b66b55':'#355269'),borderRadius:9,display:'grid',gap:6}}>
    <textarea aria-label={'Caption '+(i+1)+' text'} rows={2} style={{...control,resize:'vertical'}} value={r.text} onChange={e=>edit(i,{text:e.target.value})}/>
    {issues[i]&&<span role="alert" style={{fontSize:10,color:'#ffb7a2'}}>{issues[i]}</span>}
    <span style={{fontSize:10,color:secondary}}>{r.start.toFixed(1)}s – {r.end.toFixed(1)}s</span>
    {timings&&<div style={{display:'flex',gap:6}}>
     <input aria-label={'Caption '+(i+1)+' start time'} type="number" step=".1" min={0} style={control} value={Number(r.start.toFixed(2))} onChange={e=>edit(i,{start:Math.max(0,Number(e.target.value)||0)})}/>
     <input aria-label={'Caption '+(i+1)+' end time'} type="number" step=".1" min={0} style={control} value={Number(r.end.toFixed(2))} onChange={e=>edit(i,{end:Math.max(0,Number(e.target.value)||0)})}/>
    </div>}
   </div>)}
   </div>
   <button type="button" aria-label="Edit caption timings" style={button} onClick={()=>setTimings(v=>!v)}>{timings?'Hide timings':'Edit timings (optional)'}</button>
   <button type="button" aria-label="Insert generated captions into timeline" style={{...button,background:'#0b6285',opacity:valid?1:.45}} disabled={!valid} onClick={insert}><Check size={15} style={{verticalAlign:'middle'}}/> Add {draft.length} captions to timeline</button>
   <button type="button" aria-label="Download generated Sinhala SRT" disabled={!valid} onClick={exportSrt} style={{...button,opacity:valid?1:.45}}><Download size={15} style={{verticalAlign:'middle'}}/> Export SRT</button>
  </>}
  {!reviewReady&&<>
   <div style={{display:'grid',gap:4,padding:10,background:'#112739',borderRadius:9}}>
    <strong>How to edit captions</strong>
    <span style={{fontSize:11,color:secondary}}>Generate on the left. Review the resulting text here, or select an existing caption clip on the timeline to edit its text, position, style and animation.</span>
   </div>
   <details open={manual} onToggle={e=>setManual(e.currentTarget.open)} style={{border:'1px solid #344e62',borderRadius:9,padding:11}}>
    <summary style={{cursor:'pointer',fontWeight:600}} aria-label="Manual captions and styling">Manual captions & styling <ChevronDown size={13} style={{verticalAlign:'middle'}}/></summary>
    {manual&&<div style={{display:'grid',gap:10,marginTop:12}}>
     <label style={{display:'grid',gap:5,fontSize:11}}>Caption text
      <textarea aria-label="New caption text" rows={3} style={{...control,resize:'vertical'}} placeholder="සිංහල හෝ English caption…" value={text} onChange={e=>setText(e.target.value)}/>
     </label>
     <label style={{display:'grid',gap:5,fontSize:11}}>Duration (seconds)
      <input aria-label="New caption duration" type="number" min=".1" max="60" step=".1" style={control} value={seconds} onChange={e=>setSeconds(Math.max(.1,Math.min(60,Number(e.target.value)||3)))}/>
     </label>
     <button type="button" style={button} onClick={addManual}><Plus size={14} style={{verticalAlign:'middle'}}/> Add caption at playhead</button>
    </div>}
   </details>
  </>}
  {error&&<div role="alert" style={{color:'#ffb7aa',fontSize:11,display:'flex',gap:5}}><AlertCircle size={15}/>{error}</div>}
  {feedback&&<output role="status" style={{fontSize:11,color:'#a0e6ff'}}>{feedback}</output>}
 </section>
}
