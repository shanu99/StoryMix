import {useCallback,useState,type DragEvent} from 'react'
import {ArrowDown,ArrowUp,GripVertical,Layers,Lock,LockOpen,Magnet,Plus,ZoomIn,ZoomOut} from 'lucide-react'
import {usePlaybackStore,useTracksStore,useTimelineEngine} from '@elah/editor'

/** Compact native track order editor; reuses the TimelineEngine's undoable order mutations. */
export function TrackArrangement(){
 const engine=useTimelineEngine()
 const tracks=useTracksStore(s=>s.tracks)
 const [open,setOpen]=useState(false)
 const [drag,setDrag]=useState<string|null>(null)
 const [over,setOver]=useState<string|null>(null)
 const move=useCallback((id:string,to:number)=>{
  const order=tracks.map(t=>t.id)
  const from=order.indexOf(id)
  if(from<0||to<0||to>=order.length||from===to)return
  order.splice(from,1);order.splice(to,0,id)
  engine.reorderTracks(order)
 },[engine,tracks])
 const onDrop=(e:DragEvent,id:string)=>{
  e.preventDefault()
  if(drag)move(drag,tracks.findIndex(t=>t.id===id))
  setDrag(null);setOver(null)
 }
 const label={fontSize:11,color:'#aec6d7'} as const
 const btn={display:'inline-flex',justifyContent:'center',alignItems:'center',background:'#19293a',border:'1px solid #354a5e',borderRadius:6,color:'#b8d6ec',width:28,height:27,cursor:'pointer'} as const
 return <div style={{position:'relative',flexShrink:0}}>
  <button type="button" aria-label="Arrange tracks" title="Arrange tracks — drag track rows or use move arrows" onClick={()=>setOpen(o=>!o)}
   style={{...btn,width:36,height:32,borderColor:open?'#16B9F5':'#354a5e'}}><Layers size={17}/></button>
  {open&&<div role="dialog" aria-label="Track arrangement" style={{position:'absolute',left:0,bottom:'calc(100% + 12px)',width:286,zIndex:5000,padding:12,borderRadius:11,
   border:'1px solid #375166',background:'#101c2a',boxShadow:'0 20px 44px rgba(0,0,0,.6)',color:'#e6f5ff'}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><strong style={{fontSize:12}}>TRACK ORDER</strong><button type="button" onClick={()=>setOpen(false)} style={{...btn,width:26,height:25}} aria-label="Close track arrangement">×</button></div>
   <div style={{fontSize:10,color:'#9ab5c9',marginBottom:12}}>Drag to reorder. Higher tracks render above lower tracks. Undo is supported.</div>
   {tracks.map((track,index)=><div key={track.id} draggable onDragStart={e=>{setDrag(track.id);e.dataTransfer.setData('text/plain',track.id);e.dataTransfer.effectAllowed='move'}}
    onDragOver={e=>{e.preventDefault();setOver(track.id)}} onDrop={e=>onDrop(e,track.id)} onDragEnd={()=>{setDrag(null);setOver(null)}}
    data-track-arrange-id={track.id} style={{display:'flex',gap:6,alignItems:'center',padding:5,marginBottom:5,borderRadius:7,
      border:over===track.id?'1px solid #16B9F5':'1px solid #31475b',background:'#182a3a',opacity:drag===track.id?.75:1}}>
     <GripVertical size={15} style={{flexShrink:0,cursor:'grab',color:'#8db8d0'}}/>
     <span style={{...label,flex:1,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{track.name}</span>
     <button type="button" aria-label={'Move '+track.name+' up'} title="Move track higher" onClick={()=>move(track.id,index-1)} disabled={index===0} style={{...btn,opacity:index===0?.35:1}}><ArrowUp size={13}/></button>
     <button type="button" aria-label={'Move '+track.name+' down'} title="Move track lower" onClick={()=>move(track.id,index+1)} disabled={index===tracks.length-1} style={{...btn,opacity:index===tracks.length-1?.35:1}}><ArrowDown size={13}/></button>
     <button type="button" aria-label={(track.locked?'Unlock ':'Lock ')+track.name} title={track.locked?'Unlock track':'Lock track'} onClick={()=>engine.updateTrack(track.id,{locked:!track.locked})} style={btn}>{track.locked?<Lock size={13}/>:<LockOpen size={13}/>}</button>
    </div>)}
   <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginTop:8}}>
    {(['video','audio','elements'] as const).map(kind=><button key={kind} type="button" aria-label={'Add '+kind+' track'} onClick={()=>engine.addTrack(kind,{name:kind==='video'?'Video Overlay':kind==='audio'?'Audio':'Text / Captions'})}
      title={'Add '+kind+' track'} style={{...btn,width:'auto',padding:'0 7px',gap:4}}><Plus size={13}/>{kind}</button>)}
   </div>
  </div>}
 </div>
}

/** Compact controls for responsive, centered timeline zoom. */
export function TimelineZoomButtons(){
 const zoom=usePlaybackStore(s=>s.zoom)
 const setZoom=usePlaybackStore(s=>s.setZoom)
 return <div aria-label="Timeline zoom controls" style={{display:'flex',gap:3,alignItems:'center'}}>
   <button type="button" aria-label="Zoom out" title="Zoom out timeline" onClick={()=>setZoom(Math.max(.02,zoom/1.35))} style={{background:'transparent',border:0,color:'#acc7d8',cursor:'pointer'}}><ZoomOut size={16}/></button>
   <button type="button" aria-label="Zoom in" title="Zoom in timeline" onClick={()=>setZoom(Math.min(50,zoom*1.35))} style={{background:'transparent',border:0,color:'#acc7d8',cursor:'pointer'}}><ZoomIn size={16}/></button>
 </div>
}
