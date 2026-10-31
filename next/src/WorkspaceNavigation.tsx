import { Film, Music2, Type, Captions, Sparkles, BetweenHorizontalEnd, SlidersHorizontal, Video, LayoutTemplate, FolderOpen, CircleHelp } from 'lucide-react'
import type { ReactNode } from 'react'

export const WORKSPACE_SECTIONS = [
  {name:'Media', icon:Film, summary:'Import and organize video, images, and sounds.', ready:true},
  {name:'Audio', icon:Music2, summary:'Audio tracks and sound tools.', ready:true},
  {name:'Text', icon:Type, summary:'Titles, typography, and graphics.', ready:true},
  {name:'Captions', icon:Captions, summary:'Sinhala and English subtitles.', ready:true},
  {name:'Effects', icon:Sparkles, summary:'Video effects are planned for a future module.', ready:false},
  {name:'Transitions', icon:BetweenHorizontalEnd, summary:'Transitions library is coming in a later phase.', ready:false},
  {name:'Filters', icon:SlidersHorizontal, summary:'Color presets and filters are coming in a later phase.', ready:false},
  {name:'Record', icon:Video, summary:'Screen and microphone recording will be added in a later phase.', ready:false},
  {name:'Templates', icon:LayoutTemplate, summary:'Reusable creative templates are coming in a later phase.', ready:false},
] as const
export type WorkspaceSection = typeof WORKSPACE_SECTIONS[number]['name']

export function WorkspaceNavigation({active,onChange}:{active:WorkspaceSection;onChange:(section:WorkspaceSection)=>void}) {
 return <nav className="sm-workspace-navigation" aria-label="Editor tools">
    <div className="sm-nav-mark" aria-hidden="true"><Film size={20}/></div>
    <div className="sm-navigation-items">
    {WORKSPACE_SECTIONS.map(section=><button key={section.name} type="button" className={'sm-nav-item'+(active===section.name?' is-selected':'')} aria-current={active===section.name?'page':undefined} onClick={()=>onChange(section.name)} title={section.name}>
       <section.icon size={19} strokeWidth={1.8}/>
       <span>{section.name}</span>
    </button>)}
    </div>
    <div className="sm-navigation-bottom" title="StoryMix design workspace"><CircleHelp size={19}/></div>
 </nav>
}

export function WorkspacePanel({active,children}:{active:WorkspaceSection;children?:ReactNode}){
 const section=WORKSPACE_SECTIONS.find(x=>x.name===active)!
 return <section className="sm-workspace-pane" aria-label={active+' tools'}>
  <div className="sm-workspace-heading">
   <div className="sm-workspace-eyebrow">YOUR WORKSPACE</div>
   <h2>{active}</h2>
   <p>{section.summary}</p>
  </div>
  <div className="sm-workspace-content">
   {children ?? <div className="sm-coming-soon"><span className="sm-coming-icon"><section.icon size={25}/></span><strong>{active} tools</strong><p>{section.summary}</p><span className="sm-planned-label">Planned for future development</span></div>}
  </div>
 </section>
}

export function AudioPanelInfo(){
 return <div className="sm-panel-message"><Music2 size={22}/><strong>Audio workspace</strong><p>Import music and voice files from Media, then arrange, trim, and edit them on the audio tracks below.</p><div className="sm-panel-note">Advanced mixing, EQ, denoise and recording are planned features—not enabled yet.</div></div>
}

export function CaptionsPanelInfo(){
 return <div className="sm-panel-message"><Captions size={24}/><strong>Sinhala captions</strong><p>Use <b>Import SRT</b> in the top toolbar to create timed, editable captions. Use <b>Export SRT</b> to save your subtitle file.</p><div className="sm-panel-note">Auto-transcription is a planned AI module, not currently available.</div></div>
}
