import {createContext,useContext,useState,type Dispatch,type ReactNode,type SetStateAction} from 'react'
import type {CaptionSegment} from './sinhalaAsr'

interface CaptionWorkspaceValue{
  draft:CaptionSegment[]
  setDraft:Dispatch<SetStateAction<CaptionSegment[]>>
  sourceClipId:string
  setSourceClipId:Dispatch<SetStateAction<string>>
  reviewReady:boolean
  setReviewReady:Dispatch<SetStateAction<boolean>>
  feedback:string
  setFeedback:Dispatch<SetStateAction<string>>
}
const Context=createContext<CaptionWorkspaceValue|null>(null)
export function CaptionWorkspaceProvider({children}:{children:ReactNode}){
 const [draft,setDraft]=useState<CaptionSegment[]>([])
 const [sourceClipId,setSourceClipId]=useState('')
 const [reviewReady,setReviewReady]=useState(false)
 const [feedback,setFeedback]=useState('')
 return <Context.Provider value={{draft,setDraft,sourceClipId,setSourceClipId,reviewReady,setReviewReady,feedback,setFeedback}}>{children}</Context.Provider>
}
export function useCaptionWorkspace(){
 const value=useContext(Context)
 if(!value)throw Error('Caption workspace provider missing')
 return value
}
