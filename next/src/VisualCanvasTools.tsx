import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react'
import {RotateCcw,RotateCw,Move,Maximize2,Crop,Undo2} from 'lucide-react'
import {useTimelineEngine,useTracksStore,useSelectionStore,useMediaLibraryStore,type Clip} from '@elah/editor'
import {transformFromContainRect,normalizeCrop} from '@elah/core-next'

/**
 * Small overlay next to the live canvas. The Elah canvas already supports
 * direct move/8-handle resize/crop interaction, and this adds a tactile
 * draggable rotation control with a single history entry per gesture.
 * Nothing is rasterized or mutated directly; the export renderer reads the
 * same authored transform.
 */
export function VisualCanvasTools(){
 const engine=useTimelineEngine()
 const selectedIds=useSelectionStore(s=>s.selectedClipIds)
 const clips=useTracksStore(s=>s.clips)
 const stage=useTracksStore(s=>s.stage)
 const assets=useMediaLibraryStore(s=>s.assets)
 const selectedId=[...selectedIds].length===1?[...selectedIds][0]:null
 const clip:Clip|undefined=selectedId?Object.values(clips).flat().find(c=>c.id===selectedId):undefined
 const isVisual=clip&&(clip.type==='video'||clip.type==='image')
 const gesture=useRef<{id:string;trackId:string;startX:number;startRotation:number;transform:NonNullable<Clip['transform']>}|null>(null)
 const [help,setHelp]=useState(false)
 useEffect(()=>()=>{if(gesture.current)engine.cancelInteraction()},[engine])
 if(!isVisual||!clip)return null
 const asset=clip.assetId?assets[clip.assetId]:undefined
 const crop=normalizeCrop(clip.crop)
 const transform=clip.transform??transformFromContainRect((asset?.width??stage.width)*crop.width,(asset?.height??stage.height)*crop.height,stage.width,stage.height)
 const deg=Math.round(transform.rotation*180/Math.PI)
 const start=(e:ReactPointerEvent<HTMLButtonElement>)=>{
  if(e.button!==0)return
  e.stopPropagation()
  const t={...transform}
  gesture.current={id:clip.id,trackId:clip.trackId,startX:e.clientX,startRotation:transform.rotation,transform:t}
  e.currentTarget.setPointerCapture(e.pointerId)
 }
 const update=(e:ReactPointerEvent<HTMLButtonElement>)=>{
  const g=gesture.current
  if(!g)return
  const delta=(e.clientX-g.startX)*.55
  let degrees=g.startRotation*180/Math.PI+delta
  if(e.shiftKey)degrees=Math.round(degrees/15)*15
  engine.previewClip(g.id,g.trackId,{transform:{...g.transform,rotation:degrees*Math.PI/180}})
 }
 const finish=(cancel=false)=>{
  if(!gesture.current)return
  gesture.current=null
  if(cancel)engine.cancelInteraction()
  else engine.commitInteraction('Rotate media on canvas')
 }
 const btn={height:29,minWidth:30,display:'inline-flex',alignItems:'center',justifyContent:'center',
  gap:5,borderRadius:7,padding:'0 8px',border:'1px solid #38536a',background:'#172b3b',color:'#e1f4ff',cursor:'pointer'} as const
 return <div className="sm-canvas-quicktools" data-testid="visual-canvas-tools"
  style={{position:'absolute',top:11,right:12,zIndex:60,display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,maxWidth:'80%'}}>
  <div style={{display:'flex',alignItems:'center',gap:5,padding:5,borderRadius:10,border:'1px solid #34506a',
    background:'rgba(12,24,37,.94)',boxShadow:'0 10px 32px rgba(0,0,0,.35)',color:'#a7d5ec'}}>
    <button type="button" aria-label="Rotate on canvas" title="Drag left or right to rotate. Hold Shift for 15° snapping. Double-click to reset."
      onPointerDown={start} onPointerMove={update} onPointerUp={()=>finish()} onPointerCancel={()=>finish(true)}
      onDoubleClick={()=>engine.updateClip(clip.id,clip.trackId,{transform:{...transform,rotation:0}})}
      style={{...btn,cursor:'ew-resize',touchAction:'none'}}>
      <RotateCw size={15}/><span style={{fontVariantNumeric:'tabular-nums',fontSize:11,minWidth:33}}>{deg}°</span>
    </button>
    <button type="button" title="Rotate -90°" aria-label="Rotate left 90 degrees" onClick={()=>engine.updateClip(clip.id,clip.trackId,{transform:{...transform,rotation:transform.rotation-Math.PI/2}})} style={btn}><RotateCcw size={15}/></button>
    <button type="button" title="Rotate +90°" aria-label="Rotate right 90 degrees" onClick={()=>engine.updateClip(clip.id,clip.trackId,{transform:{...transform,rotation:transform.rotation+Math.PI/2}})} style={btn}><RotateCw size={15}/></button>
    <button type="button" title="Reset transform and crop" aria-label="Reset visual transform" onClick={()=>engine.updateClip(clip.id,clip.trackId,{transform:undefined,crop:undefined})} style={btn}><Undo2 size={15}/></button>
    <button type="button" title="Canvas editing help" aria-label="Canvas editing help" onClick={()=>setHelp(v=>!v)} style={btn}>?</button>
  </div>
  {help&&<div role="status" style={{maxWidth:270,padding:11,borderRadius:9,background:'#101e2d',border:'1px solid #38536a',
    color:'#b8d6e6',fontSize:11,lineHeight:1.55,boxShadow:'0 9px 23px rgba(0,0,0,.35)'}}>
    <p style={{margin:'0 0 6px'}}><Move size={13} style={{verticalAlign:'middle'}}/> Drag the selected image/video on the canvas to move it.</p>
    <p style={{margin:'0 0 6px'}}><Maximize2 size={13} style={{verticalAlign:'middle'}}/> Drag corner handles to resize.</p>
    <p style={{margin:'0 0 6px'}}><Crop size={13} style={{verticalAlign:'middle'}}/> Choose Crop above the selection, then drag handles or pan inside.</p>
    <p style={{margin:0}}><RotateCw size={13} style={{verticalAlign:'middle'}}/> Drag the rotation control horizontally. Hold Shift to snap to 15°.</p>
  </div>}
 </div>
}
