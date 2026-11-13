import {useCallback,useEffect,useState,useRef,type ReactNode,type CSSProperties} from 'react'
import {createPortal} from 'react-dom'
import {usePlaybackStore,useSelectionStore,useTracksStore,useTimelineEngine,type Clip} from '@elah/editor'
import {Scissors,Layers3,Trash2,Copy,Magnet,SkipBack,SkipForward,ChevronLeft,ChevronRight,AlignStartHorizontal,AlignEndHorizontal,Delete} from 'lucide-react'
import {theme} from './theme'

type IconButtonProps={label:string;title:string;run:()=>void;enabled?:boolean;active?:boolean;icon?:ReactNode}
const iconButtonStyle:CSSProperties={
  display:'inline-flex',alignItems:'center',justifyContent:'center',width:34,height:32,
  padding:0,border:'1px solid #344759',borderRadius:7,background:'#182737',
  color:'#e5f3fc',cursor:'pointer',flexShrink:0
}
let activeTimelineTooltipClose:(()=>void)|null=null
/** An accessible icon-only control with an instant descriptive hover/focus tooltip. */
function TimelineIconButton({label,title,run,enabled=true,active=false,icon}:IconButtonProps){
  const [tooltip,setTooltip]=useState<{left:number;top:number;below:boolean}|null>(null)
  const closeRef=useRef<()=>void>(()=>setTooltip(null))
  const hide=()=>{if(activeTimelineTooltipClose===closeRef.current)activeTimelineTooltipClose=null;setTooltip(null)}
  useEffect(()=>()=>{if(activeTimelineTooltipClose===closeRef.current)activeTimelineTooltipClose=null},[])
  const show=(element:HTMLElement)=>{
    if(activeTimelineTooltipClose&&activeTimelineTooltipClose!==closeRef.current)activeTimelineTooltipClose()
    activeTimelineTooltipClose=closeRef.current
    const rect=element.getBoundingClientRect()
    const left=Math.max(10,Math.min(window.innerWidth-244,rect.left+rect.width/2-120))
    const below=rect.top<116
    setTooltip({left,top:below?rect.bottom+9:rect.top-9,below})
  }
  return <>
    <span style={{display:'inline-flex',flexShrink:0}} onMouseEnter={e=>show(e.currentTarget)}
      onMouseLeave={hide} onFocusCapture={e=>show(e.currentTarget)}
      onBlurCapture={hide}>
      <button type="button" className="sm-advanced-edit-action" aria-label={label}
        onClick={run} disabled={!enabled}
        style={{...iconButtonStyle,...(!enabled?{opacity:.38,cursor:'not-allowed'}:{}),
          ...(active?{borderColor:'#16B9F5',background:'rgba(22,185,245,.16)',color:'#76d9ff'}:{})}}>
        {icon}
      </button>
    </span>
    {tooltip&&createPortal(
      <div role="tooltip" style={{
        position:'fixed',left:tooltip.left,top:tooltip.top,zIndex:20000,width:240,
        transform:tooltip.below?'none':'translateY(-100%)',pointerEvents:'none',
        background:'#101b29',border:'1px solid #426179',borderRadius:9,
        padding:'9px 11px',boxShadow:'0 12px 28px rgba(0,0,0,.5)',
        color:'#e7f5ff',fontSize:12,lineHeight:1.5
      }}>
        <div style={{fontWeight:700,marginBottom:3,color:'#f2fbff'}}>{label}</div>
        <div style={{color:'#a8c5d9',fontSize:11}}>{title}</div>
        {!enabled&&<div style={{marginTop:5,color:'#80d6ff',fontSize:10}}>Select a clip to enable</div>}
      </div>,document.body
    )}
  </>
}

/**
 * Non-destructive, frame-accurate shortcuts. All edits use TimelineEngine
 * mutations, so project serialization and native undo/redo stay consistent.
 */
export function AdvancedTimelineTools(){
  const engine=useTimelineEngine()
  const selectedIds=useSelectionStore(s=>s.selectedClipIds)
  const clips=useTracksStore(s=>s.clips)
  const snapEnabled=usePlaybackStore(s=>s.snapEnabled)
  const toggleSnap=usePlaybackStore(s=>s.toggleSnap)
  const [notice,setNotice]=useState('')
  const ids=[...selectedIds]
  const selected:Clip|undefined=ids.length===1?Object.values(clips).flat().find(c=>ids[0]===c.id):undefined
  const find=useCallback(()=>{
    const current=[...useSelectionStore.getState().selectedClipIds]
    return current.length===1?engine.findClip(current[0]):null
  },[engine])
  const getFrame=()=>Math.round(usePlaybackStore.getState().currentFrame)
  const message=useCallback((value:string)=>setNotice(value),[])

  const split=useCallback((all:boolean)=>{
    const at=getFrame()
    const project=engine.getProject()
    const selection=useSelectionStore.getState().selectedClipIds
    const targets=Object.entries(project.clips).flatMap(([trackId,lane])=>
      lane.filter(clip=>(all||selection.has(clip.id))&&!engine.isTrackLocked(trackId)&&clip.startFrame<at&&at<clip.startFrame+clip.durationFrames)
        .map(clip=>({clip,trackId})))
    if(!targets.length){message(all?'No unlocked clips intersect the playhead.':'Select a clip and place the playhead inside it.');return}
    engine.batch(()=>{
      for(const {clip,trackId} of targets)engine.splitClip(clip.id,trackId,at)
    },all?'Split all tracks at playhead':'Split selected clips at playhead')
    message(`Split ${targets.length} clip${targets.length===1?'':'s'} at ${(at/30).toFixed(2)}s.`)
  },[engine,message])

  const trim=useCallback((edge:'in'|'out')=>{
    const current=find()
    if(!current){message('Select exactly one clip.');return}
    const {clip,trackId}=current
    const at=getFrame()
    const end=clip.startFrame+clip.durationFrames
    if(at<=clip.startFrame||at>=end){message('Move the playhead inside the selected clip.');return}
    if(engine.isTrackLocked(trackId)){message('Track locked.');return}
    engine.trimClip(clip.id,trackId,edge==='in'?at:clip.startFrame,edge==='in'?end-at:at-clip.startFrame)
    const next=engine.findClip(clip.id)?.clip
    message(next&&(next.startFrame!==clip.startFrame||next.durationFrames!==clip.durationFrames)
      ?(edge==='in'?'Trimmed clip in-point.':'Trimmed clip out-point.')
      :'Trim blocked by source bounds or adjoining clips.')
  },[engine,find,message])

  const remove=useCallback((ripple:boolean)=>{
    const selection=[...useSelectionStore.getState().selectedClipIds]
    if(!selection.length){message('Select one or more clips.');return}
    if(ripple&&selection.length!==1){message('Ripple delete requires exactly one clip.');return}
    const targets=selection.map(id=>engine.findClip(id)).filter((v):v is NonNullable<typeof v>=>!!v)
    if(targets.some(x=>engine.isTrackLocked(x.trackId))){message('Unlock the affected tracks first.');return}
    if(!ripple){
      engine.batch(()=>{for(const {clip,trackId} of targets)engine.removeClip(clip.id,trackId)},'Delete selected clips')
      message(`Deleted ${targets.length} clip${targets.length===1?'':'s'} — existing gaps preserved.`)
      return
    }
    const {clip,trackId}=targets[0]
    const end=clip.startFrame+clip.durationFrames
    const later=engine.getClipsOnTrack(trackId).filter(c=>c.id!==clip.id&&c.startFrame>=end)
    // Preflight the destination range before removal: the batch then creates
    // one undo entry and never needs to simulate rollback by throwing.
    const preflight=later.every(c=>c.startFrame-clip.durationFrames>=clip.startFrame)
    if(!preflight){message('Ripple delete cannot close this gap safely.');return}
    engine.batch(()=>{
      engine.removeClip(clip.id,trackId)
      if(later.length)engine.shiftClips(later.map(c=>({clipId:c.id,trackId,delta:-clip.durationFrames})),'Close deleted gap')
    },'Ripple delete clip')
    message('Ripple delete: closed the gap on this track.')
  },[engine,message])

  const duplicate=useCallback(()=>{
    const current=find()
    if(!current){message('Select exactly one clip.');return}
    const {clip,trackId}=current
    if(engine.isTrackLocked(trackId)){message('Track locked.');return}
    const outcome=engine.placeClips([{clipId:clip.id,toTrackId:trackId,startFrame:clip.startFrame+clip.durationFrames}],{
      copy:true,mode:'insert',description:'Duplicate and insert clip'
    })
    message(outcome.ok?'Duplicate inserted after clip.':'Duplicate blocked: '+outcome.reason)
  },[engine,find,message])

  const nextCut=useCallback((direction:-1|1)=>{
    const current=getFrame()
    const boundaries=[...new Set(Object.values(engine.getProject().clips).flat().flatMap(c=>[c.startFrame,c.startFrame+c.durationFrames]))].sort((a,b)=>a-b)
    const target=direction===1?boundaries.find(v=>v>current):boundaries.reverse().find(v=>v<current)
    if(target===undefined){message('No more cuts in that direction.');return}
    usePlaybackStore.getState().pause()
    usePlaybackStore.getState().setCurrentFrame(target)
  },[engine,message])

  const step=useCallback((direction:-1|1)=>{
    const player=usePlaybackStore.getState()
    player.pause()
    player.setCurrentFrame(Math.max(0,Math.min(engine.getTotalFrames(),player.currentFrame+direction)))
  },[engine])

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const node=e.target as HTMLElement|null
      if(node?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"],[role="dialog"]'))return
      if(e.altKey)return
      const key=e.key.toLowerCase()
      if((e.ctrlKey||e.metaKey)&&key==='d'){if(!find())return;e.preventDefault();duplicate();return}
      if((e.ctrlKey||e.metaKey)&&key==='b'){e.preventDefault();split(false);return}
      if(e.ctrlKey||e.metaKey)return
      if(key==='s'&&e.shiftKey){e.preventDefault();split(true);return}
      if(key==='s'&&find()){e.preventDefault();split(false);return}
      if(key==='arrowleft'&&!e.shiftKey){e.preventDefault();step(-1);return}
      if(key==='arrowright'&&!e.shiftKey){e.preventDefault();step(1);return}
      if(key==='['){e.preventDefault();nextCut(-1);return}
      if(key===']'){e.preventDefault();nextCut(1);return}
      if(key==='n'){e.preventDefault();toggleSnap();return}
      if(!useSelectionStore.getState().selectedClipIds.size)return
      if(key==='q'){e.preventDefault();trim('in')}
      else if(key==='w'){e.preventDefault();trim('out')}
      else if(key==='delete'||key==='backspace'){e.preventDefault();remove(e.shiftKey)}
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[duplicate,find,nextCut,remove,split,step,toggleSnap,trim])

  const Action=TimelineIconButton

  return <div aria-label="Advanced timeline edit tools" style={{display:'flex',alignItems:'center',gap:6,minWidth:0,maxWidth:'100%',overflowX:'auto',scrollbarWidth:'thin',padding:'4px 1px'}}>
    <Action label="Split" title="Split selected clip(s) at playhead (S / Ctrl+B)" run={()=>split(false)} enabled={ids.length>0} icon={<Scissors size={17}/>}/>
    <Action label="Split All" title="Blade across unlocked tracks at playhead (Shift+S)" run={()=>split(true)} icon={<Layers3 size={17}/>}/>
    <Action label="Trim Start" title="Non-destructive trim start to playhead (Q)" run={()=>trim('in')} enabled={!!selected} icon={<AlignStartHorizontal size={17}/>}/>
    <Action label="Trim End" title="Non-destructive trim end to playhead (W)" run={()=>trim('out')} enabled={!!selected} icon={<AlignEndHorizontal size={17}/>}/>
    <Action label="Delete" title="Delete selected clips without moving other clips (Delete)" run={()=>remove(false)} enabled={ids.length>0} icon={<Trash2 size={17}/>}/>
    <Action label="Ripple Delete" title="Delete and close gap on the same track (Shift+Delete)" run={()=>remove(true)} enabled={!!selected} icon={<Delete size={17}/>}/>
    <Action label="Duplicate" title="Insert copy right after clip (Ctrl+D)" run={duplicate} enabled={!!selected} icon={<Copy size={17}/>}/>
    <span aria-hidden="true" style={{height:22,borderLeft:'1px solid #344759',margin:'0 2px'}}/>
    <Action label="Prev Cut" title="Previous edit point ([)" run={()=>nextCut(-1)} icon={<SkipBack size={17}/>}/>
    <Action label="Next Cut" title="Next edit point (])" run={()=>nextCut(1)} icon={<SkipForward size={17}/>}/>
    <Action label="−1 Frame" title="Step backward one frame (Left Arrow)" run={()=>step(-1)} icon={<ChevronLeft size={17}/>}/>
    <Action label="+1 Frame" title="Step forward one frame (Right Arrow)" run={()=>step(1)} icon={<ChevronRight size={17}/>}/>
    <Action label={snapEnabled?'Snap On':'Snap Off'} title="Toggle magnetic snapping (N)" run={toggleSnap} active={snapEnabled} icon={<Magnet size={17}/>}/>
    {notice&&<span role="status" style={{fontSize:10,color:theme.textMuted,minWidth:135,whiteSpace:'nowrap'}}>{notice}</span>}
  </div>
}
