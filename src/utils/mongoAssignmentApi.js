import {apiFetch} from './api';
export const isMongoId=value=>/^[a-f\d]{24}$/i.test(String(value||''));
export async function assignmentRequest(path,options={}){const headers=new Headers(options.headers);if(options.body && !(options.body instanceof FormData))headers.set('Content-Type','application/json');const response=await apiFetch('/assignments'+path,{...options,headers});if(response.headers.get('content-type')?.includes('application/json')){const data=await response.json();if(!response.ok||!data.success)throw Error(data.message||'Assignment request failed.');return data;}if(!response.ok)throw Error('File could not be downloaded.');return response.blob();}
export const teacherAssignments=id=>assignmentRequest(`/courses/${id}/teacher`);
export const studentAssignments=id=>assignmentRequest(`/courses/${id}/student`);
export const saveAssignment=(courseId,item)=>assignmentRequest(`/courses/${courseId}/teacher${isMongoId(item.id)?'/'+item.id:''}`,{method:isMongoId(item.id)?'PUT':'POST',body:JSON.stringify({...item,...(!isMongoId(item.id)&&item.id?{legacyId:String(item.id)}:{})})});
export const publishAssignment=(courseId,id,published)=>assignmentRequest(`/courses/${courseId}/teacher/${id}/publish`,{method:'PATCH',body:JSON.stringify({published})});
export const deleteAssignment=(courseId,id)=>assignmentRequest(`/courses/${courseId}/teacher/${id}`,{method:'DELETE'});
export const submitAssignment=(courseId,id,answer,fileIds)=>assignmentRequest(`/courses/${courseId}/student/${id}/submission`,{method:'PUT',body:JSON.stringify({answer,fileIds})});
export const gradeAssignment=(courseId,id,submissionId,marks,feedback)=>assignmentRequest(`/courses/${courseId}/teacher/${id}/submissions/${submissionId}`,{method:'PATCH',body:JSON.stringify({marks,feedback})});
export async function uploadAssignmentFile(courseId,file){const form=new FormData();form.append('file',file);return (await assignmentRequest(`/courses/${courseId}/attachments`,{method:'POST',body:form})).file;}
export async function downloadAssignmentFile(courseId,fileId,name){const blob=await assignmentRequest(`/courses/${courseId}/attachments/${fileId}`);const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=name||'attachment';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
