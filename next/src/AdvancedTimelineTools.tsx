import {useCallback,useEffect,useState} from 'react'
import {usePlaybackStore,useSelectionStore,useTracksStore,useTimelineEngine,splitClipAtPlayhead,type Clip} from '@elah/editor'
import {theme} from './theme'

/**
 * StoryMix's non-destructive quick-edit actions. The Elah engine owns all
 * mutations/history: no ad-hoc changes to the project JSON or media assets.
 */
export function AdvancedTimelineTools() {
  const engine=useTimelineEngine()
  const selectedIds=useSelectionStore(s=>s.selectedClipIds)
  const clips=useTracksStore(s=>s.clips)
  const [notice,setNotice]=useState('')
  const selected:Clip|undefined=selectedIds.size===1
    ?Object.values(clips).flat().find(c=>selectedIds.has(c.id)):undefined
  const find=useCallback(()=> {
    const ids=useSelectionStore.getState().selectedClipIds
    if(ids.size!==1)return null
    return engine.findClip([...ids][0])
  },[engine])
  const report=useCallback((message:string)=>setNotice(message),[])
  const split=useCallback(()=>{
    const outcome=splitClipAtPlayhead(engine)
    report(outcome.ok?'Clip split at playhead.':(outcome.reason??'Select a clip and seek inside it.'))
  },[engine,report])
  const trim=useCallback((edge:'in'|'out')=>{
    const current=find()
    if(!current){report('Select a clip first.');return}
    const {clip,trackId}=current
    const at=Math.round(usePlaybackStore.getState().currentFrame)
    const end=clip.startFrame+clip.durationFrames
    if(at<=clip.startFrame||at>=end){report('Move playhead inside selected clip to trim.');return}
    if(engine.isTrackLocked(trackId)){report('Track is locked.');return}
    engine.trimClip(clip.id,trackId,edge==='in'?at:clip.startFrame,edge==='in'?end-at:at-clip.startFrame)
    const next=engine.findClip(clip.id)?.clip
    report(next&&(next.startFrame!==clip.startFrame||next.durationFrames!==clip.durationFrames)
      ?(edge==='in'?'Trimmed start to playhead.':'Trimmed end to playhead.')
      :'Trim blocked by source or adjacent clip.')
  },[engine,find,report])
  const remove=useCallback((ripple:boolean)=>{
    const current=find()
    if(!current){report('Select a clip first.');return}
    const {clip,trackId}=current
    if(engine.isTrackLocked(trackId)){report('Track is locked.');return}
    if(!ripple){
      engine.removeClip(clip.id,trackId)
      report('Clip deleted — timeline positions preserved.')
      return
    }
    const end=clip.startFrame+clip.durationFrames
    const later=engine.getClipsOnTrack(trackId).filter(c=>c.id!==clip.id&&c.startFrame>=end)
    try {
      engine.batch(()=>{
        engine.removeClip(clip.id,trackId)
        if(later.length&&!engine.shiftClips(later.map(c=>({clipId:c.id,trackId,delta:-clip.durationFrames})),'Close deleted gap')){
          throw new Error('Another clip prevents ripple delete.')
        }
      },'Ripple delete clip')
      report('Ripple deleted — following clips on this track moved left.')
    } catch {
      report('Ripple delete blocked. No changes were made.')
    }
  },[engine,find,report])
  const duplicate=useCallback(()=>{
    const current=find()
    if(!current){report('Select a clip first.');return}
    const {clip,trackId}=current
    const outcome=engine.placeClips([{clipId:clip.id,toTrackId:trackId,startFrame:clip.startFrame+clip.durationFrames}],{
      copy:true,mode:'insert',description:'Duplicate and insert clip'
    })
    report(outcome.ok?'Duplicate inserted immediately after selected clip.':('Could not duplicate: '+outcome.reason))
  },[engine,find,report])

  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement|null
      if(target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))return
      if(e.altKey)return
      const key=e.key.toLowerCase()
      if((e.ctrlKey||e.metaKey)&&key==='d'){if(!find())return;e.preventDefault();duplicate();return}
      if(e.ctrlKey||e.metaKey)return
      if(!find())return
      if(key==='q'){e.preventDefault();trim('in')}
      else if(key==='w'){e.preventDefault();trim('out')}
      else if(key==='delete'||key==='backspace'){e.preventDefault();remove(e.shiftKey)}
    }
    window.addEventListener('keydown',handler)
    return()=>window.removeEventListener('keydown',handler)
  },[duplicate,find,remove,trim])

  const buttonStyle:React.CSSProperties={
    border:'1px solid #344759',borderRadius:7,background:'#182737',color:'#e5f3fc',
    fontSize:11,fontWeight:600,padding:'7px 10px',cursor:'pointer',whiteSpace:'nowrap'
  }
  const disabledStyle:React.CSSProperties={opacity:.38,cursor:'not-allowed'}
  const Action=({label,title,run,enabled=true}:{label:string;title:string;run:()=>void;enabled?:boolean})=>(
    <button type="button" className="sm-advanced-edit-action" title={title} aria-label={label}
      style={{...buttonStyle,...(!enabled?disabledStyle:{})}} disabled={!enabled} onClick={run}>{label}</button>
  )

  return <div aria-label="Advanced timeline edit tools" style={{display:'flex',alignItems:'center',gap:6,minWidth:0,maxWidth:'100%',overflowX:'auto',scrollbarWidth:'thin'}}>
    <Action label="Split" title="Split at playhead (S)" run={split} enabled={!!selected}/>
    <Action label="Trim Start" title="Trim clip start to playhead (Q)" run={()=>trim('in')} enabled={!!selected}/>
    <Action label="Trim End" title="Trim clip end to playhead (W)" run={()=>trim('out')} enabled={!!selected}/>
    <Action label="Delete" title="Delete selected clip (Delete)" run={()=>remove(false)} enabled={!!selected}/>
    <Action label="Ripple Delete" title="Delete and close gap on this track (Shift+Delete)" run={()=>remove(true)} enabled={!!selected}/>
    <Action label="Duplicate" title="Duplicate clip at its end and insert (Ctrl+D)" run={duplicate} enabled={!!selected}/>
    {notice&&<span role="status" style={{fontSize:10,color:theme.textMuted,minWidth:150,whiteSpace:'nowrap'}}>{notice}</span>}
  </div>
}
