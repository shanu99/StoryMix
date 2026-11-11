import {useTracksStore} from '@elah/editor'
import {SinhalaAutoCaptions} from './SinhalaAutoCaptions'

/** Creation on the left; all transcript corrections and visual editing live in the Inspector. */
export function CaptionsWorkbench(){
 const stage=useTracksStore(s=>s.stage)
 return <section aria-label="Caption generation workspace" style={{display:'grid',gap:14,padding:'13px 12px',color:'#dcefff'}}>
  <div style={{fontSize:11,color:'#a8c7da'}}>Generate subtitles on this side. Edit the text, style and timing in the <strong style={{color:'#8bdffa'}}>Inspector on the right.</strong></div>
  <SinhalaAutoCaptions/>
  <div aria-label="Detected video aspect ratio" style={{padding:'9px 10px',background:'#102738',border:'1px solid #324f63',borderRadius:8,color:'#95bcd0',fontSize:10}}>
   Caption size and safe position automatically follow the {stage.width}×{stage.height} video canvas.
  </div>
 </section>
}
