import {FolderOpen,Save,Upload,Subtitles,Download,ChevronDown,Undo2,Redo2,Clapperboard,CloudOff} from 'lucide-react'
import {parseSrt,writeSrt} from './subtitles'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ClipProperties } from './ClipProperties'
import { AdvancedTimelineTools } from './AdvancedTimelineTools'
import { TrackArrangement,TimelineZoomButtons } from './TrackArrangement'
import { VisualCanvasTools } from './VisualCanvasTools'
import { ExportModal } from './ExportModal'
import { btnDisabled, theme } from './theme'
import {WorkspaceNavigation,WorkspacePanel,AudioPanelInfo,CaptionsPanelInfo,type WorkspaceSection} from './WorkspaceNavigation'
import {
  AssetPanel,
  ElementsPanel,
  EditorProvider,
  Preview,
  Timeline,
  createDefaultDemuxerFactory,
  useTracksStore,
  usePlaybackStore,
  useSelectionStore,
  useTimelineEngine,
  useMediaLibrary,
  insertMediaAsset,
  splitClipAtPlayhead,
  framesToTimecode,
  type InitialTrackConfig,
  type TimelineRef,
  type ExportVideoCodec,
  type ExportAudioCodec,
} from '@elah/editor'

const FPS = 30

// One video lane on top, an elements (text/shape) lane, then two audio lanes.
// Any number of audio/elements tracks is supported. Order is top→bottom in the
// UI (lower index renders on top). The demo/asset APIs fill these lanes.
const INITIAL_TRACKS: InitialTrackConfig[] = [
  { kind: 'video', name: 'Video / Image' },
  { kind: 'video', name: 'Video Overlay' },
  { kind: 'elements', name: 'Titles / Sinhala Captions' },
  { kind: 'audio', name: 'Audio (Main)' },
  { kind: 'audio', name: 'Audio 2' },
]

const ZOOM_MIN = 0.02
const ZOOM_MAX = 50
const zoomToSlider = (z: number) =>
  (Math.log(z) - Math.log(ZOOM_MIN)) / (Math.log(ZOOM_MAX) - Math.log(ZOOM_MIN))
const sliderToZoom = (s: number) =>
  Math.exp(Math.log(ZOOM_MIN) + s * (Math.log(ZOOM_MAX) - Math.log(ZOOM_MIN)))

const divider: React.CSSProperties = {
  width: 1,
  height: 18,
  background: theme.border,
  flexShrink: 0,
  margin: '0 8px',
}

const AppHeader = memo(function AppHeader({ onExport }: { onExport: () => void }) {
  const canUndo = useTracksStore((s) => s.canUndo)
  const canRedo = useTracksStore((s) => s.canRedo)
  const engine = useTimelineEngine()
  const mediaRef = useRef<HTMLInputElement>(null)
  const {importFiles}=useMediaLibrary()
  const srtRef = useRef<HTMLInputElement>(null)
  const projectRef = useRef<HTMLInputElement>(null)
  const relinkRef = useRef<HTMLInputElement>(null)
  const [missingMedia,setMissingMedia]=useState<string[]>([])
  const [message,setMessage]=useState('')
  const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
  const importMedia=async(files:File[])=>{setMessage('Importing '+files.length+' media files...');try{const result=await importFiles(files);let added=0;for(const asset of result.imported){const inserted=await insertMediaAsset(engine,asset.id,{desiredStartFrame:engine.getTotalFrames()});if(inserted.ok)added++}setMessage('Imported '+result.imported.length+' files, placed '+added+' clips'+(result.skipped.length?'; skipped '+result.skipped.length:''))}catch(e){setMessage('Import error: '+String(e))}}
  const saveProject=()=>{try{const project=engine.getProject();download(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),'StoryMix-project.json');setMessage('Project saved. Keep original media files for relinking.')}catch(e){setMessage('Save failed: '+String(e));console.error('StoryMix project save',e)}}
  useEffect(()=>{const onSave=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject()}};window.addEventListener('keydown',onSave);return()=>window.removeEventListener('keydown',onSave)},[engine])
  const checkMissing=(project:ReturnType<typeof engine.getProject>)=>[...new Set(Object.values(project.clips).flat().filter(clip=>['video','audio','image'].includes(clip.type)&&typeof clip.src==='string'&&clip.src.startsWith('blob:')).map(clip=>clip.name))]
  const openProject=async(file:File)=>{try{const {readProjectDocument}=await import('@elah/editor');const project=readProjectDocument(JSON.parse(await file.text()));engine.loadProject(project,{history:'reset',transport:'rewind'});const missing=checkMissing(project);setMissingMedia(missing);setMessage(missing.length?'Project loaded. Relink '+missing.length+' local media files.':'Project loaded.')}catch(e){setMessage('Open failed: '+String(e))}}
  const relinkFiles=async(files:File[])=>{
    if(!files.length)return;
    try{
      const project=engine.getProject();
      const byName=new Map(files.map(f=>[f.name.toLowerCase(),f]));
      let replaced=0;
      const urls=new Map<string,string>();
      const clips=Object.fromEntries(Object.entries(project.clips).map(([track,bucket])=>[track,bucket.map(clip=>{
        if(!['video','audio','image'].includes(clip.type)||typeof clip.src!=='string')return clip;
        const match=byName.get(clip.name.toLowerCase());
        if(!match)return clip;
        let url=urls.get(match.name);if(!url){url=URL.createObjectURL(match);urls.set(match.name,url)}
        replaced++;
        return {...clip,src:url};
      })]));
      if(!replaced){setMessage('No matching filenames. Select the original media files.');return}
      await importFiles(files);
      engine.loadProject({...project,clips},{history:'reset',transport:'rewind'});
      const remaining=missingMedia.filter(name=>!byName.has(name.toLowerCase()));
      setMissingMedia(remaining);
      setMessage('Relinked '+replaced+' clips'+(remaining.length?'; '+remaining.length+' still need media':''));
    }catch(e){setMessage('Relink failed: '+String(e))}
  }
  const addSrt=async(file:File)=>{try{const segments=parseSrt(await file.text());if(!segments.length)throw new Error('No valid captions found in SRT');const track=engine.addTrack('elements',{name:'Captions'});engine.batch(()=>{for(const seg of segments)engine.addClip({type:'text',trackId:track.id,name:'Caption',startFrame:Math.round(seg.start*30),durationFrames:Math.max(1,Math.round((seg.end-seg.start)*30)),text:{content:seg.text,fontSize:48,color:'#ffffff',fontFamily:'Noto Sans Sinhala'}})},'Import captions');setMessage('Imported '+segments.length+' captions')}catch(e){setMessage('SRT error: '+String(e))}}
  const exportSrt=()=>{try{const p=engine.getProject();const entries=p.tracks.filter(t=>t.kind==='elements'&&/caption/i.test(t.name)).flatMap(t=>(p.clips[t.id]||[]).filter(c=>c.type==='text'&&c.content).map(c=>({start:c.startFrame/30,end:(c.startFrame+c.durationFrames)/30,text:c.content||''})));download(new Blob([writeSrt(entries)],{type:'text/plain;charset=utf-8'}),'StoryMix-captions.srt');setMessage('SRT exported: '+entries.length+' captions')}catch(e){setMessage('SRT export failed: '+String(e));console.error('StoryMix SRT export',e)}}
  return (
    <header className="sm-topbar">
      <div className="sm-topbar-brand">
        <span className="sm-brand-symbol"><Clapperboard size={19}/></span>
        <span className="sm-wordmark">Story<span>Mix</span></span>
        <span className="sm-topbar-divider"/>
        <span className="sm-project-name">Untitled Project</span>
        <span className="sm-project-local" title="Projects are saved to your device, not the cloud"><CloudOff size={12}/> Local project</span>
      </div>
      <div className="sm-topbar-actions">
        <button className="sm-top-action sm-top-undo" type="button" disabled={!canUndo} onClick={()=>engine.undo()} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={16}/></button>
        <button className="sm-top-action sm-top-undo" type="button" disabled={!canRedo} onClick={()=>engine.redo()} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 size={16}/></button>
        <span className="sm-topbar-divider"/>
        <button className="sm-top-action" type="button" onClick={()=>mediaRef.current?.click()}><Upload size={15}/> <span>Import</span></button>
        <div className="sm-top-menu-container">
          <details className="sm-top-menu">
            <summary className="sm-top-action"><FolderOpen size={16}/><span>Project</span><ChevronDown size={12}/></summary>
            <div className="sm-menu-popover" role="group" aria-label="Project actions">
              <button type="button" onClick={()=>projectRef.current?.click()}><FolderOpen size={15}/>Open project</button>
              <button type="button" onClick={saveProject}><Save size={15}/>Save project</button>
              <button type="button" onClick={()=>relinkRef.current?.click()}><Upload size={15}/>Relink media files</button>
            </div>
          </details>
        </div>
        <div className="sm-top-menu-container">
          <details className="sm-top-menu">
            <summary className="sm-top-action"><Subtitles size={16}/><span>Captions</span><ChevronDown size={12}/></summary>
            <div className="sm-menu-popover" role="group" aria-label="Caption actions">
              <button type="button" onClick={()=>srtRef.current?.click()}><Upload size={15}/>Import SRT</button>
              <button type="button" onClick={exportSrt}><Download size={15}/>Export SRT</button>
            </div>
          </details>
        </div>
        <input aria-label="Choose video audio or image files" ref={mediaRef} type="file" accept="video/*,audio/*,image/*" multiple hidden onChange={async e=>{const files=Array.from(e.target.files||[]);if(files.length)await importMedia(files);e.target.value=''}}/>
        <input ref={srtRef} type="file" accept=".srt,text/plain" hidden onChange={async e=>{const file=e.target.files?.[0];if(file)await addSrt(file);e.target.value=''}}/>
        <input ref={relinkRef} type="file" accept="video/*,audio/*,image/*" multiple hidden aria-label="Relink original media files" onChange={async e=>{await relinkFiles(Array.from(e.target.files||[]));e.target.value=''}}/>
        <input ref={projectRef} type="file" accept=".json" hidden onChange={async e=>{const file=e.target.files?.[0];if(file)await openProject(file);e.target.value=''}}/>
      </div>
      <div className="sm-topbar-right">
        {message&&<output className="sm-topbar-message" title={message}>{message}</output>}{missingMedia.length>0&&<button type="button" className="sm-top-action" onClick={()=>relinkRef.current?.click()} title="Relink missing original media">Relink ({missingMedia.length})</button>}
        <button type="button" className="sm-top-export elah-export-btn" onClick={onExport} title="Export to MP4"><Download size={16}/> Export</button>
      </div>
    </header>
  )
})

// Play control + running time — mirrors the app-side editor by sitting directly
// below the preview. A 1fr auto 1fr grid centers the play button; the running
// time / total time reads on the left.
const PreviewTransport = memo(function PreviewTransport() {
  const isPlaying = usePlaybackStore((s) => s.isPlaying)
  const togglePlayPause = usePlaybackStore((s) => s.togglePlayPause)
  const totalFrames = useTracksStore((s) => s.totalFrames)
  const timecodeRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    return usePlaybackStore.subscribe((state) => {
      if (timecodeRef.current) {
        const dur = Math.max(totalFrames, 1)
        timecodeRef.current.textContent =
          `${framesToTimecode(state.currentFrame, FPS)} / ${framesToTimecode(dur, FPS)}`
      }
    })
  }, [totalFrames])

  useEffect(() => {
    if (timecodeRef.current) {
      const frame = usePlaybackStore.getState().currentFrame
      const dur = Math.max(totalFrames, 1)
      timecodeRef.current.textContent =
        `${framesToTimecode(frame, FPS)} / ${framesToTimecode(dur, FPS)}`
    }
  }, [totalFrames])

  const playBtnStyle: React.CSSProperties = {
    ...btnDisabled(false),
    minWidth: 36,
    padding: '5px 12px',
    ...(isPlaying
      ? {
          background: 'rgba(34, 197, 94, 0.12)',
          border: `1px solid ${theme.success}`,
          color: theme.success,
        }
      : {}),
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        gap: 12,
        minHeight: 40,
        padding: '6px 16px',
        background: theme.bgSecondary,
        borderTop: `1px solid ${theme.border}`,
        flexShrink: 0,
      }}
    >
      <span
        ref={timecodeRef}
        style={{
          fontSize: 11,
          color: theme.textSecondary,
          fontFamily: theme.fontMono,
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        }}
      >
        00:00:00:00 / 00:00:00:00
      </span>

      <button
        type="button"
        className="elah-toolbar-btn"
        style={playBtnStyle}
        onClick={togglePlayPause}
        title="Play / Pause (Space)"
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <span />
    </div>
  )
})

const TimelineControls = memo(function TimelineControls({
  timelineRef,
}: {
  timelineRef: React.RefObject<TimelineRef | null>
}) {
  const engine = useTimelineEngine()
  const zoom = usePlaybackStore((s) => s.zoom)
  const setZoom = usePlaybackStore((s) => s.setZoom)
  const stage = useTracksStore((s) => s.stage)
  const aspectActive = (w: number, h: number) =>
    Math.abs(stage.width / stage.height - w / h) < 0.001

  const aspectBtn = (active: boolean): React.CSSProperties => ({
    ...btnDisabled(false),
    minWidth: 44,
    padding: '5px 10px',
    ...(active
      ? {
          background: 'rgba(225, 29, 72, 0.12)',
          border: `1px solid ${theme.accent}`,
          color: theme.accentHover,
          boxShadow: `0 0 10px rgba(225, 29, 72, 0.35)`,
        }
      : {}),
  })

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        columnGap: 12,
        rowGap: 6,
        minHeight: 40,
        padding: '6px 16px',
        background: theme.bgSecondary,
        borderTop: `1px solid ${theme.border}`,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: '1 1 auto' }}>
        <div style={{display:'flex',gap:7,alignItems:'center',minWidth:0}}><TrackArrangement /><AdvancedTimelineTools /></div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
        <TimelineZoomButtons />
        <span style={{ fontSize: 11, color: theme.textMuted }}>Zoom</span>
        <input
          type="range"
          className="elah-range"
          min={0}
          max={1}
          step={0.001}
          value={zoomToSlider(zoom)}
          onChange={(e) => setZoom(sliderToZoom(Number(e.target.value)))}
          style={{ width: 96 }}
        />
        <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: theme.fontMono, minWidth: 56 }}>
          {zoom < 1 ? zoom.toFixed(2) : zoom.toFixed(1)} px/f
        </span>
        <button
          type="button"
          className="elah-toolbar-btn"
          style={btnDisabled(false)}
          onClick={() => timelineRef.current?.fitToWindow()}
          title="Zoom to fit timeline"
        >
          Fit
        </button>

        <div style={divider} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            className="elah-toolbar-btn"
            style={aspectBtn(aspectActive(1920, 1080))}
            onClick={() => engine.setStage(1920, 1080)}
            title="Landscape 16:9"
          >
            16:9
          </button>
          <button
            type="button"
            className="elah-toolbar-btn"
            style={aspectBtn(aspectActive(1080, 1920))}
            onClick={() => engine.setStage(1080, 1920)}
            title="Portrait 9:16"
          >
            9:16
          </button>
          <button
            type="button"
            className="elah-toolbar-btn"
            style={aspectBtn(aspectActive(1080, 1080))}
            onClick={() => engine.setStage(1080, 1080)}
            title="Square 1:1"
          >
            1:1
          </button>
        </div>
      </div>
    </div>
  )
})

export default function ProductionEditor() {
  const timelineRef = useRef<TimelineRef>(null)
  const demuxerFactoryRef = useRef(createDefaultDemuxerFactory())

  const [showExportModal, setShowExportModal] = useState(false)
  const [activeTool, setActiveTool] = useState<WorkspaceSection>('Media')
  const [timelineHeight, setTimelineHeight] = useState(236)
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null)

  // Drag the handle above the timeline to resize its height. Clamped so the
  // timeline can neither swallow the canvas nor collapse below a usable strip.
  const onTimelineResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      resizeRef.current = { startY: e.clientY, startHeight: timelineHeight }
      const onMove = (ev: PointerEvent) => {
        if (!resizeRef.current) return
        const delta = ev.clientY - resizeRef.current.startY
        setTimelineHeight(
          Math.min(600, Math.max(120, resizeRef.current.startHeight - delta)),
        )
      }
      const onUp = () => {
        resizeRef.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [timelineHeight],
  )

  const handleExportStart = useCallback(async (opts: {
    videoBitrate: number
    outputHeight: number
    videoCodec: ExportVideoCodec
    audioCodec: ExportAudioCodec
    signal: AbortSignal
    onProgress: (frame: number, totalFrames: number) => void
  }) => {
    const e = timelineRef.current?.engine
    if (!e) return
    usePlaybackStore.getState().pause()
    const project = e.getProject()
    const { lazyExportVideo } = await import('@elah/editor')
    const exportOptions = {
      videoBitrate: opts.videoBitrate,
      outputHeight: opts.outputHeight,
      videoCodec: opts.videoCodec,
      audioCodec: opts.audioCodec,
      signal: opts.signal,
      onProgress: ({ frame, totalFrames }: {frame:number;totalFrames:number}) => opts.onProgress(frame, totalFrames),
    }
    let blob:Blob
    // Dev-only verification switch: exercise the real FFmpeg path in CI even
    // when the test browser supports native AAC. Omitted from production builds.
    const forceWasm = import.meta.env.DEV && new URLSearchParams(location.search).has('forceWasmExport')
    try {
      if (forceWasm) {
        const { exportMp4WithWasm } = await import('./ffmpegFallback')
        blob = await exportMp4WithWasm(project, exportOptions)
      } else {
        blob = await lazyExportVideo(project, exportOptions)
      }
    } catch(error) {
      // Some Chromium builds lack the WebCodecs AAC encoder even when H.264
      // video encoding works. Preserve the original fast export where possible.
      const reason = String(error)
      if (!/mp4a\.40\.2|AudioEncoder|audio.*encoder.*config|encoder configuration/i.test(reason) || opts.signal.aborted) throw error
      const { exportMp4WithWasm } = await import('./ffmpegFallback')
      blob = await exportMp4WithWasm(project, exportOptions)
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'StoryMix-export.mp4'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }, [])

  return (
    <EditorProvider
      fps={FPS}
      defaultTrackHeight={36}
      initialTracks={INITIAL_TRACKS}
      stage={{ width: 1920, height: 1080 }}
    >
      <div
        className="elah-root sm-hybrid-editor"
        style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      >
        <AppHeader onExport={() => setShowExportModal(true)} />
        {showExportModal && (
          <ExportModal
            onClose={() => setShowExportModal(false)}
            onExport={handleExportStart}
          />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="sm-main-workspace" style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <WorkspaceNavigation active={activeTool} onChange={setActiveTool} />
            <WorkspacePanel active={activeTool}>
              {activeTool==='Media' ? <AssetPanel style={{flex:1,minHeight:0}} /> :
               activeTool==='Text' ? <ElementsPanel style={{flex:1,minHeight:0}} /> :
               activeTool==='Audio' ? <AudioPanelInfo /> :
               activeTool==='Captions' ? <CaptionsPanelInfo /> : undefined}
            </WorkspacePanel>

            <div
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                background: theme.bgPrimary,
              }}
            >
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <Preview
                  demuxerFactory={demuxerFactoryRef.current}
                  style={{ width: '100%', height: '100%' }}
                />
                <VisualCanvasTools />
              </div>
              <PreviewTransport />
            </div>

            <aside className="sm-inspector" aria-label="Properties inspector"><div className="sm-inspector-caption">INSPECTOR <span>PROPERTIES</span></div><ClipProperties /></aside>
          </div>

          <TimelineControls timelineRef={timelineRef} />

          <div
            role="separator"
            aria-orientation="horizontal"
            title="Drag to resize timeline"
            onPointerDown={onTimelineResizeStart}
            style={{
              height: 7,
              flexShrink: 0,
              cursor: 'ns-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: theme.bgSecondary,
              borderTop: `1px solid ${theme.border}`,
              touchAction: 'none',
            }}
          >
            <div style={{ width: 36, height: 3, borderRadius: 2, background: theme.border }} />
          </div>

          <Timeline
            ref={timelineRef}
            fps={FPS}
            style={{ height: timelineHeight, flexShrink: 0, minWidth: 0 }}
          />
        </div>
      </div>
    </EditorProvider>
  )
}
