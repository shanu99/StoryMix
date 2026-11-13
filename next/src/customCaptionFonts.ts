/**
 * User-owned font library for caption styling.
 * Font files stay in this browser's IndexedDB and are never uploaded to StoryMix.
 * Unicode text remains Unicode; legacy FM/Isiwara encodings are NOT converted here.
 */
export type CustomCaptionFont = {
 id:string
 name:string
 family:string
 kind:'unicode'|'legacy'
 size:number
}
type StoredFont = CustomCaptionFont & {bytes:ArrayBuffer}
const DB='storymix-caption-fonts-v1'
const STORE='fonts'
const MAX_FONT_SIZE=12*1024*1024
const faceCache=new Map<string,FontFace>()
function openDB():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1)
  request.onupgradeneeded=()=>{
   const db=request.result
   if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})
  }
  request.onsuccess=()=>resolve(request.result)
  request.onerror=()=>reject(request.error??new Error('Font library unavailable in this browser.'))
  request.onblocked=()=>reject(new Error('Close other StoryMix tabs and try again.'))
 })
}
async function run<T>(mode:IDBTransactionMode,cb:(store:IDBObjectStore,resolve:(v:T)=>void,reject:(e:Error)=>void)=>void):Promise<T>{
 const db=await openDB()
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,mode)
   let value:T
   let completed=false
   tx.oncomplete=()=>completed?resolve(value):reject(new Error('Font library operation did not complete.'))
   tx.onerror=()=>reject(tx.error??new Error('Font library operation failed.'))
   tx.onabort=()=>reject(tx.error??new Error('Font library operation cancelled.'))
   cb(tx.objectStore(STORE),v=>{value=v;completed=true},reject)
  })
 }finally{db.close()}
}
function metadata(record:StoredFont):CustomCaptionFont{
 const {id,name,family,kind,size}=record
 return {id,name,family,kind,size}
}
function mountFont(record:StoredFont):Promise<void>{
 if(faceCache.has(record.id))return Promise.resolve()
 const face=new FontFace(record.family,record.bytes,{style:'normal',weight:'100 900'})
 return face.load().then(loaded=>{
  document.fonts.add(loaded)
  faceCache.set(record.id,loaded)
 })
}
export async function listCustomCaptionFonts():Promise<CustomCaptionFont[]>{
 const saved=await run<StoredFont[]>('readonly',(store,resolve,reject)=>{
  const request=store.getAll()
  request.onsuccess=()=>resolve(request.result as StoredFont[])
  request.onerror=()=>reject(request.error??new Error('Could not read saved fonts.'))
 })
 // A corrupted file should not prevent the user's other fonts from loading.
 const available:CustomCaptionFont[]=[]
 for(const item of saved){
  try{await mountFont(item);available.push(metadata(item))}catch{/* skip unsupported font */}
 }
 return available.sort((a,b)=>a.name.localeCompare(b.name))
}
export async function importCustomCaptionFont(file:File,kind:'unicode'|'legacy'):Promise<CustomCaptionFont>{
 if(!/\.(ttf|otf|woff2?)$/i.test(file.name))throw new Error('Choose a TTF, OTF, WOFF or WOFF2 font.')
 if(file.size<128||file.size>MAX_FONT_SIZE)throw new Error('Font must be smaller than 12 MB.')
 const bytes=await file.arrayBuffer()
 const id=crypto.randomUUID()
 const name=file.name.replace(/\.(ttf|otf|woff2?)$/i,'').replace(/[_-]+/g,' ').trim()
 const family='StoryMixUserFont-'+id.replaceAll('-','')
 const record:StoredFont={id,name,family,kind,size:file.size,bytes}
 // Reject malformed files before storing.
 await mountFont(record)
 await run<void>('readwrite',(store,resolve,reject)=>{
  const request=store.put(record)
  request.onsuccess=()=>resolve()
  request.onerror=()=>reject(request.error??new Error('Could not save the font.'))
 })
 return metadata(record)
}
export async function removeCustomCaptionFont(id:string):Promise<void>{
 await run<void>('readwrite',(store,resolve,reject)=>{
  const request=store.delete(id)
  request.onsuccess=()=>resolve()
  request.onerror=()=>reject(request.error??new Error('Could not remove font.'))
 })
 const face=faceCache.get(id)
 if(face){document.fonts.delete(face);faceCache.delete(id)}
}
