/**
 * Persistent device-only Gemini API credential.
 *
 * IndexedDB stores AES-GCM ciphertext + a non-extractable WebCrypto CryptoKey.
 * This is protection against casual plaintext inspection, NOT a defense
 * against malicious scripts running in the same origin/browser profile.
 * The credential is never written to localStorage or exported with projects.
 * Browser storage clearing, private mode and a different device will lose it.
 */
const DB_NAME='storymix-gemini-settings-v1'
const STORE='vault'
const CIPHER_ID='gemini-key'
const KEY_ID='aes-key'
const ENCODER=new TextEncoder()
const DECODER=new TextDecoder()
type VaultEntry={id:string;value:CryptoKey|{iv:number[];data:number[]}}

function openVault():Promise<IDBDatabase>{
 if(typeof indexedDB==='undefined'||!globalThis.crypto?.subtle)
  return Promise.reject(Error('Secure browser storage is unavailable.'))
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1)
  request.onupgradeneeded=()=>{
   const db=request.result
   if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'})
  }
  request.onsuccess=()=>resolve(request.result)
  request.onerror=()=>reject(request.error??Error('Could not access local secure storage.'))
  request.onblocked=()=>reject(Error('Close other StoryMix tabs and retry.'))
 })
}

async function transaction<T>(
 mode:IDBTransactionMode,
 operation:(store:IDBObjectStore,resolve:(value:T)=>void,reject:(error:Error)=>void)=>void,
):Promise<T>{
 const db=await openVault()
 try{
  return await new Promise<T>((resolve,reject)=>{
   let settled=false
   let hasResult=false
   let lastResult:T
   const tx=db.transaction(STORE,mode)
   const store=tx.objectStore(STORE)
   // IDBRequest success fires BEFORE the write transaction commits. Wait
   // for transaction.oncomplete before reporting that a key was saved.
   const success=(value:T)=>{lastResult=value;hasResult=true}
   const fail=(error:Error)=>{if(!settled){settled=true;reject(error)}}
   tx.oncomplete=()=>{
    if(!settled){
     settled=true
     if(hasResult)resolve(lastResult)
     else reject(Error('Secure storage did not finish saving.'))
    }
   }
   tx.onerror=()=>fail(tx.error??Error('Secure storage transaction failed.'))
   tx.onabort=()=>fail(tx.error??Error('Secure storage transaction cancelled.'))
   operation(store,success,fail)
  })
 }finally{db.close()}
}
async function readRecord(id:string):Promise<VaultEntry|undefined>{
 return transaction('readonly',(store,resolve,reject)=>{
  const request=store.get(id)
  request.onsuccess=()=>resolve(request.result as VaultEntry|undefined)
  request.onerror=()=>reject(request.error??Error('Could not read saved key.'))
 })
}
async function encryptionKey():Promise<CryptoKey>{
 const existing=await readRecord(KEY_ID)
 if(existing?.value instanceof CryptoKey)return existing.value
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt'])
 await transaction<void>('readwrite',(store,resolve,reject)=>{
  const req=store.put({id:KEY_ID,value:key})
  req.onsuccess=()=>resolve()
  req.onerror=()=>reject(req.error??Error('Could not save encryption key.'))
 })
 return key
}
export function validGeminiApiKey(value:string):boolean{
 return /^(?:AIza[A-Za-z0-9_-]{25,}|AQ\.[^\s]{20,})$/.test(value.trim())
}
export async function saveGeminiApiKey(value:string):Promise<void>{
 const plain=value.trim()
 if(!validGeminiApiKey(plain))throw Error('Enter a valid Google AI Studio API key.')
 const key=await encryptionKey()
 const iv=crypto.getRandomValues(new Uint8Array(12))
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,ENCODER.encode(plain))
 await transaction<void>('readwrite',(store,resolve,reject)=>{
  const req=store.put({id:CIPHER_ID,value:{iv:[...iv],data:[...new Uint8Array(encrypted)]}})
  req.onsuccess=()=>resolve()
  req.onerror=()=>reject(req.error??Error('Could not save Gemini API key.'))
 })
}
export async function loadGeminiApiKey():Promise<string|null>{
 const cipher=await readRecord(CIPHER_ID)
 if(!cipher)return null
 const entry=cipher.value
 if(!entry||entry instanceof CryptoKey||!Array.isArray(entry.iv)||!Array.isArray(entry.data))
  throw Error('Saved Gemini key could not be read.')
 const record=await readRecord(KEY_ID)
 if(!record||!(record.value instanceof CryptoKey))
  throw Error('Saved Gemini key could not be decrypted. Remove it and save again.')
 try{
  const decrypted=await crypto.subtle.decrypt(
   {name:'AES-GCM',iv:new Uint8Array(entry.iv)},
   record.value,new Uint8Array(entry.data),
  )
  const value=DECODER.decode(decrypted)
  if(!validGeminiApiKey(value))throw Error('Saved Gemini key is invalid.')
  return value
 }catch{
  throw Error('Saved Gemini key cannot be decrypted. Remove it and save again.')
 }
}
export async function removeGeminiApiKey():Promise<void>{
 await transaction<void>('readwrite',(store,resolve,reject)=>{
  const req=store.delete(CIPHER_ID)
  req.onsuccess=()=>resolve()
  req.onerror=()=>reject(req.error??Error('Could not remove saved Gemini key.'))
 })
}
