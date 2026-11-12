import {createContext,useContext,useState,type Dispatch,type ReactNode,type SetStateAction} from 'react'
import type {CaptionSegment} from './sinhalaAsr'

interface CaptionWorkspaceValue{
  draft:CaptionSegment[]
  setDraft:Dispatch<SetStateAction<CaptionSegment[]>>
  sourceClipId:string
  setSourceClipId:Dispatch<SetStateAction<string>>
  reviewReady:boolean
  setReviewReady:Dispatch<SetStateAction<boolean>>
  languageMode:'sinhala'|'original'
  setLanguageMode:Dispatch<SetStateAction<'sinhala'|'original'>>
  geminiKey:string
  setGeminiKey:Dispatch<SetStateAction<string>>
  feedback:string
  setFeedback:Dispatch<SetStateAction<string>>
}
const Context=createContext<CaptionWorkspaceValue|null>(null)
export function CaptionWorkspaceProvider({children}:{children:ReactNode}){
 const [draft,setDraft]=useState<CaptionSegment[]>([])
 const [sourceClipId,setSourceClipId]=useState('')
 const [reviewReady,setReviewReady]=useState(false)
 const [feedback,setFeedback]=useState('')
 const [languageMode,setLanguageMode]=useState<'sinhala'|'original'>('original')
 // BYOK key intentionally held only in volatile React memory, never localStorage.
 const [geminiKey,setGeminiKey]=useState('')
 return <Context.Provider value={{draft,setDraft,sourceClipId,setSourceClipId,reviewReady,setReviewReady,languageMode,setLanguageMode,geminiKey,setGeminiKey,feedback,setFeedback}}>{children}</Context.Provider>
}
export function useCaptionWorkspace(){
 const value=useContext(Context)
 if(!value)throw Error('Caption workspace provider missing')
 return value
}
