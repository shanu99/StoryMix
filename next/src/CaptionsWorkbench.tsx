import {SinhalaAutoCaptions} from './SinhalaAutoCaptions'

/** Focused caption creation. Advanced editing stays in the right Inspector. */
export function CaptionsWorkbench(){
 return <section aria-label="Caption generation workspace" style={{padding:'12px 12px 20px',color:'#dcefff'}}>
  <SinhalaAutoCaptions/>
 </section>
}
