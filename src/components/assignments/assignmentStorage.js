const ASSIGNMENTS = 'educonnect.assignments.v1.';
const SUBMISSIONS = 'educonnect.assignmentSubmissions.v1.';
export const ASSIGNMENT_EVENT = 'educonnect:assignments-updated';
export const norm = v => String(v ?? '').trim().toLowerCase();
export const assignmentKey = (teacher, course) => `${ASSIGNMENTS}${encodeURIComponent(norm(teacher))}.${encodeURIComponent(String(course))}`;
export const submissionKey = (student, assignmentId) => `${SUBMISSIONS}${encodeURIComponent(norm(student))}.${encodeURIComponent(assignmentId)}`;
export function read(key, fallback = []) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(v) ? v : fallback; } catch { return fallback; } }
export function save(key, items) { localStorage.setItem(key, JSON.stringify(items)); window.dispatchEvent(new Event(ASSIGNMENT_EVENT)); }
export const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function allSubmissions() { const rows = []; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k?.startsWith(SUBMISSIONS)) rows.push(...read(k)); } return rows; }
const DB = 'educonnect-assignment-files-v1', STORE = 'attachments';
function openDb(){ return new Promise((resolve,reject)=>{ if(!('indexedDB' in window)){reject(new Error('IndexedDB is unavailable'));return;} const request=indexedDB.open(DB,1); request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);}; request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error); }); }
async function transact(mode, action){ const db=await openDb(); try {return await new Promise((resolve,reject)=>{ const tx=db.transaction(STORE,mode);const req=action(tx.objectStore(STORE));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.onerror=()=>reject(tx.error); });} finally {db.close();} }
export const putAttachment = (id,file) => transact('readwrite',store=>store.put(file,id));
export const getAttachment = id => transact('readonly',store=>store.get(id));
export const deleteAttachment = id => transact('readwrite',store=>store.delete(id));
export function downloadFile(file){ const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=file.name||'attachment';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
