import {useCallback,useEffect,useRef,useState} from 'react'
import {RotateCcw,ShieldCheck,Trash2} from 'lucide-react'
import {useTimelineEngine,useTracksStore,readProjectDocument} from '@elah/editor'

const KEY='storymix-autorecovery-v1'
const MAX_BYTES=1_700_000
interface Recovery{savedAt:number;project:ReturnType<ReturnType<typeof useTimelineEngine>['getProject']>}

/** Explicit local recovery; never silently overwrites a new open project. */
export function LocalProjectRecovery(){
 const engine=useTimelineEngine()
 const clips=useTracksStore(s=>s.clips)
 const [candidate,setCandidate]=useState<Recovery|null>(null)
 const [note,setNote]=useState('')
 const [lastSaved,setLastSaved]=useState(0)
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const suppress=useRef(false)
 const count=Object.values(clips).reduce((n,lane)=>n+lane.length,0)
 useEffect(()=>{
  try{
   const raw=localStorage.getItem(KEY)
   if(!raw)return
   const parsed=JSON.parse(raw) as Recovery
   if(parsed?.savedAt&&parsed?.project?.tracks?.length&&Object.values(parsed.project.clips).flat().length)
    setCandidate(parsed)
  }catch{}
 },[])
 useEffect(()=>{
  const update=()=>{
   if(suppress.current)return
   if(timer.current)clearTimeout(timer.current)
   timer.current=setTimeout(()=>{
    try{
     const project=engine.getProject()
     if(Object.values(project.clips).every(group=>!group.length))return
     const payload=JSON.stringify({savedAt:Date.now(),project})
     if(payload.length>MAX_BYTES){setNote('Autosave paused: project is too large for local recovery. Download a project backup.');return}
     localStorage.setItem(KEY,payload)
     setLastSaved(Date.now())
    }catch{setNote('Browser storage blocked. Use Project → Save project to back up your work.')}
   },1800)
  }
  engine.on('change',update)
  return()=>{engine.off('change',update);if(timer.current)clearTimeout(timer.current)}
 },[engine])
 const recover=useCallback(()=>{
  if(!candidate)return
  try{
   const project=readProjectDocument(candidate.project)
   suppress.current=true
   engine.loadProject(project,{history:'reset',transport:'rewind'})
   suppress.current=false
   setCandidate(null)
   setNote('Recovered the timeline. Local video/audio/image files must be relinked if their previous URLs expired.')
  }catch(e){suppress.current=false;setNote('Recovery failed: '+String(e))}
 },[candidate,engine])
 return <div data-testid="project-recovery" style={{position:'absolute',bottom:11,left:105,zIndex:6000,maxWidth:330,pointerEvents:'none'}}>
  {candidate&&<div style={{pointerEvents:'auto',background:'#142b3c',border:'1px solid #3a8299',borderRadius:9,
   padding:12,color:'#effaff',fontSize:12,boxShadow:'0 14px 36px rgba(0,0,0,.55)',display:'grid',gap:7}}>
   <strong><RotateCcw size={14} style={{verticalAlign:'middle'}}/> Recover your previous session?</strong>
   <span style={{fontSize:11,color:'#b4cedb'}}>Local backup from {new Date(candidate.savedAt).toLocaleString()}. Current timeline has {count} clip(s). Recovering replaces this session.</span>
   <div style={{display:'flex',gap:7}}>
    <button type="button" aria-label="Recover previous project" onClick={recover} style={{background:'#16b9f5',border:0,borderRadius:6,padding:'7px 10px',color:'#062338',fontWeight:700}}>Recover</button>
    <button type="button" aria-label="Dismiss recovery" onClick={()=>setCandidate(null)} style={{background:'#26435a',color:'#d2eaf8',border:0,borderRadius:6,padding:'7px 10px'}}>Dismiss</button>
   </div>
  </div>}
  {note&&<button type="button" onClick={()=>setNote('')} style={{pointerEvents:'auto',border:'1px solid #3e6578',borderRadius:7,padding:9,background:'#152c3d',color:'#c4ddeb',fontSize:11,textAlign:'left'}}>{note} ×</button>}
  {!candidate&&!note&&lastSaved>0&&<span title="Timeline snapshots are stored only in this browser" style={{display:'none'}}><ShieldCheck size={13}/> Locally saved</span>}
 </div>
}
