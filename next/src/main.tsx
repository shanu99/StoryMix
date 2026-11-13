import {listCustomCaptionFonts} from './customCaptionFonts'
import '@fontsource/noto-sans-sinhala/400.css'
import '@fontsource/noto-sans-sinhala/700.css'
import{StrictMode}from'react';import{createRoot}from'react-dom/client';import '@elah/timeline/styles.css';import '@elah/editor/styles.css';import '@elah/editor/styles/tokens.css';import './storymix.css';import StoryMix from './StoryMix';createRoot(document.getElementById('root')!).render(<StrictMode><StoryMix/></StrictMode>);
// Restore user-owned typefaces before the editor renders saved caption clips.
void listCustomCaptionFonts().catch(()=>{})
