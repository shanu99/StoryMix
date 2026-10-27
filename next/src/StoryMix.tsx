import {ExportModal} from './ExportModal';
import {TextClipProperties} from './TextClipProperties';
import {useCallback,useRef,useState} from 'react';
import {EditorProvider,Preview,Timeline,AssetPanel,ElementsPanel,createDefaultDemuxerFactory,useTracksStore,usePlaybackStore,useTimelineEngine,useSelectionStore,splitClipAtPlayhead,lazyExportVideo,type InitialTrackConfig,type TimelineRef} from '@elah/editor';
const tracks:InitialTrackConfig[]=[{kind:'video',name:'Video 1'},{kind:'video',name:'Video 2'},{kind:'elements',name:'Titles / Sinhala Captions'},{kind:'audio',name:'Voice'},{kind:'audio',name:'Music'}];
const demuxerFactory=createDefaultDemuxerFactory();
const saveBlob=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60_000)};
function Workspace(){
 const timeline=useRef<TimelineRef>(null),engine=useTimelineEngine(),playing=usePlaybackStore(s=>s.isPlaying),toggle=usePlaybackStore(s=>s.togglePlayPause),zoom=usePlaybackStore(s=>s.zoom),setZoom=usePlaybackStore(s=>s.setZoom),canUndo=useTracksStore(s=>s.canUndo),canRedo=useTracksStore(s=>s.canRedo),selected=useSelectionStore(s=>s.selectedClipIds.size===1);
 const [showExportModal,setShowExportModal]=useState(false);const [exporting,setExporting]=useState(false),[progress,setProgress]=useState(0),[notice,setNotice]=useState('Import files into the library, drag clips to tracks, then edit and export.'),[height,setHeight]=useState(270);
 const dragStart=useRef<{y:number,h:number}|null>(null);
 const exportMp4=useCallback(async(opts:{videoBitrate:number;outputHeight:number;videoCodec:'avc'|'hevc'|'vp9'|'av1';audioCodec:'aac'|'opus';signal:AbortSignal;onProgress:(frame:number,totalFrames:number)=>void})=>{
  if(exporting)return;
  setExporting(true);setProgress(0);setNotice('Rendering H.264 MP4...');
  try{
   usePlaybackStore.getState().pause();
   const project=engine.getProject();
   const blob=await lazyExportVideo(project,{videoCodec:opts.videoCodec,audioCodec:opts.audioCodec,outputHeight:opts.outputHeight,videoBitrate:opts.videoBitrate,signal:opts.signal,onProgress:({frame,totalFrames})=>{setProgress(totalFrames?Math.round(100*frame/totalFrames):0);opts.onProgress(frame,totalFrames)}});
   saveBlob(blob,'StoryMix-export.mp4');setNotice('MP4 export downloaded.');
  }catch(e){setNotice('Export error: '+(e instanceof Error?e.message:String(e)))}
  finally{setExporting(false)}
 },[engine,exporting]);
 const save=()=>{try{const p=engine.getProject();saveBlob(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}),'StoryMix-project.json');setNotice('Project JSON saved. Keep original media files.')}catch(e){setNotice(String(e))}};
 const startResize=(e:React.PointerEvent<HTMLDivElement>)=>{e.preventDefault();dragStart.current={y:e.clientY,h:height};const move=(m:PointerEvent)=>{if(dragStart.current)setHeight(Math.max(150,Math.min(630,dragStart.current.h+dragStart.current.y-m.clientY)))};const up=()=>{dragStart.current=null;window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)};
 return <div className="elah-root" style={{display:'flex',flexDirection:'column',height:'100%'}}>
  <>{showExportModal&&<ExportModal onClose={()=>setShowExportModal(false)} onExport={exportMp4}/>}<header className="sm-header"><div className="sm-logo"><i>▶</i> StoryMix</div><span className="sm-muted">Turn Moments Into Stories</span><span className="sm-spacer"/><button className="sm-btn" title="Undo Ctrl+Z" onClick={()=>engine.undo()} disabled={!canUndo}>↶</button><button className="sm-btn" title="Redo Ctrl+Shift+Z" onClick={()=>engine.redo()} disabled={!canRedo}>↷</button><button className="sm-btn" onClick={save} title="Save JSON project">Save</button><button className="sm-btn sm-primary" disabled={exporting} onClick={()=>setShowExportModal(true)}>{exporting?'Export '+progress+'%':'Export MP4'}</button></header>
  <div style={{flex:1,display:'flex',flexDirection:'column',minHeight:0}}>
   <div style={{flex:1,display:'flex',minHeight:0}}>
    <aside className="sm-pane"><div className="sm-panel-title">MEDIA · TITLES · ELEMENTS</div><ElementsPanel style={{flexShrink:0,borderBottom:'1px solid #263a4e'}}/><AssetPanel style={{flex:1,minHeight:0}}/></aside>
    <main className="sm-preview"><div style={{flex:1,minHeight:0,position:'relative'}}><Preview demuxerFactory={demuxerFactory} style={{width:'100%',height:'100%'}} /></div><div className="sm-transport"><button className="sm-btn" onClick={toggle} title="Play / Pause (Space)">{playing?'⏸ Pause':'▶ Play'}</button><span className="sm-muted">WebGL2 realtime preview</span></div></main><TextClipProperties/>
   </div>
   <div className="sm-timeline-toolbar"><button className="sm-btn" title="Split clip at playhead (S)" disabled={!selected} onClick={()=>{const x=splitClipAtPlayhead(engine);if(!x.ok)setNotice('Split: '+x.reason)}}>✂</button><button className="sm-btn" title="Fit timeline" onClick={()=>timeline.current?.fitToWindow()}>Fit</button><span className="sm-spacer"/><span className="sm-muted">Zoom</span><input className="sm-slider" aria-label="Timeline zoom" type="range" min=".05" max="10" step=".05" value={Math.min(10,Math.max(.05,zoom))} onChange={e=>setZoom(Number(e.target.value))}/><button className="sm-btn" onClick={()=>engine.setStage(1920,1080)}>16:9</button><button className="sm-btn" onClick={()=>engine.setStage(1080,1920)}>9:16</button><button className="sm-btn" onClick={()=>engine.setStage(1080,1080)}>1:1</button></div>
   <div role="separator" aria-orientation="horizontal" onPointerDown={startResize} title="Drag to resize timeline" style={{height:6,cursor:'ns-resize',background:'#25384a',touchAction:'none'}}/>
   <Timeline ref={timeline} fps={30} style={{height,flexShrink:0,minWidth:0}}/>
   <div className="sm-status" role="status">{notice}</div>
  </div>
 </>
 </div>
}
export default function StoryMix(){return <EditorProvider fps={30} defaultTrackHeight={38} initialTracks={tracks} stage={{width:1920,height:1080}}><Workspace/></EditorProvider>}
