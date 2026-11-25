import { uploadContentFile, loadContentFile } from "../../utils/contentApi";
import { useEffect, useMemo, useState } from "react";
import "./CurriculumBuilder.css";
import StudentCourseCurriculum from "./StudentCourseCurriculum";
import { Layers3, Folder, PlaySquare, CircleHelp, ClipboardCheck, Link2, FileText, Download, Eye, EyeOff, Save, Pencil, Trash2, ChevronDown, ChevronUp, GripVertical, Plus, ArrowUpDown, ArrowUp, ArrowDown, Upload, Check, X, GraduationCap, Clock3, AlertCircle, CheckCircle2 } from "lucide-react";
import { assignmentKey } from "../assignments/assignmentStorage";
import { teacherQuizzes } from "../../utils/mongoQuizApi";
import { teacherAssignments } from "../../utils/mongoAssignmentApi";
const PREFIX="educonnect.curriculum.v1.";
const EVENT="educonnect:curriculum-updated";
const key=(teacher,id)=>`${PREFIX}${encodeURIComponent(String(teacher||"").toLowerCase())}.${encodeURIComponent(String(id))}`;
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||"null")}catch{return null}};
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const qkey=(email,id)=>`educonnect.quiz.v1.${encodeURIComponent(String(email??"").trim().toLowerCase())}.${encodeURIComponent(String(id))}`;
const array=k=>{const v=read(k);return Array.isArray(v)?v:[]};
const DB="educonnect-curriculum-resources", STORE="files";
function resourceDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function resource(action,mode="readonly"){const db=await resourceDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),r=action(tx.objectStore(STORE));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.onerror=()=>reject(tx.error)})}finally{db.close()}}
const put=(id,file)=>resource(s=>s.put(file,id),"readwrite");
const get=id=>resource(s=>s.get(id));
const del=id=>resource(s=>s.delete(id),"readwrite");
function download(file){const u=URL.createObjectURL(file),a=document.createElement("a");a.href=u;a.download=file.name||"resource";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
const empty=()=>({sections:[],resources:[],links:[]});
const DOCUMENT_TYPES=/\.(pdf|txt|md|docx|pptx)$/i;
const DOWNLOAD_TYPES=/\.(pdf|txt|md|docx|pptx|zip|png|jpe?g|xlsx|csv)$/i;
function useRevision(){const [n,setN]=useState(0);useEffect(()=>{const f=()=>setN(x=>x+1);["storage","focus",EVENT,"educonnect:quizzes-updated","educonnect:assignments-updated"].forEach(e=>window.addEventListener(e,f));return()=>["storage","focus",EVENT,"educonnect:quizzes-updated","educonnect:assignments-updated"].forEach(e=>window.removeEventListener(e,f))},[]);return n}
const pluralize=(count,one,many)=>`${count} ${count===1?one:many||one+"s"}`;
const matchesReference=(record,id)=>[record?.id,record?._id,record?.legacyId].some(value=>value!==undefined&&String(value)===String(id));

function TeacherCurriculumBuilder({role,email,courses=[],onSaveCurriculum,onAddLesson,onReorderLessons,onOpenLesson,onDeleteLesson,onEditCourse,onNavigate}){
  const [courseId,setCourseId]=useState("");
  const [pendingCurriculum, setPendingCurriculum] = useState(null);
  const [sectionName,setSectionName]=useState("");
  const [lessonTitle,setLessonTitle]=useState("");
  const [lessonDescription,setLessonDescription]=useState("");
  const [chosenSection,setChosenSection]=useState("");
  const [message,setMessage]=useState("");
  const [messageType,setMessageType]=useState("info");
  const [expanded,setExpanded]=useState({});
  const [activeTool,setActiveTool]=useState("");
  const [preview,setPreview]=useState(false);
  const [resourceLesson,setResourceLesson]=useState("");
  const [itemTitle,setItemTitle]=useState("");
  const [itemDetails,setItemDetails]=useState("");
  const [itemSection,setItemSection]=useState("");
  const [bulkNames,setBulkNames]=useState("");
  const [importText,setImportText]=useState("");
  const [renamingId,setRenamingId]=useState("");
  const [renameValue,setRenameValue]=useState("");
  const [mongoAssessments,setMongoAssessments]=useState({courseId:"",quizzes:[],assignments:[],loading:false});
  const revision=useRevision();
  const course=courses.find(c=>String(c.id)===String(courseId))||courses[0];
  const teacher=role==="teacher"?email:course?.teacherEmail;
  const storageKey=course?key(teacher,course.id):"";
  const notify=(text,type="info")=>{setMessage(text);setMessageType(type)};
  const resetTransient=()=>{setMessage("");setExpanded({});setActiveTool("");setRenamingId("");setResourceLesson("");setItemTitle("");setItemDetails("");setItemSection("");setBulkNames("");setImportText("");setChosenSection("");setLessonTitle("");setLessonDescription("");setSectionName("")};
  const saved=useMemo(() => {
    void revision;
    if (course?.mongoContent) return pendingCurriculum?.id === course.id && pendingCurriculum.revision === course.revision
      ? pendingCurriculum.value : course.curriculum || empty();
    return storageKey ? read(storageKey) || empty() : empty();
  }, [storageKey, revision, course, pendingCurriculum]);
  useEffect(()=>{
    void revision;
    const id=String(course?.id||"");
    if(!course?.mongoContent)return;
    let active=true;
    Promise.all([teacherQuizzes(id),teacherAssignments(id)]).then(([quizData,assignmentData])=>{
      if(!active)return;
      setMongoAssessments({courseId:id,loading:false,
        quizzes:(quizData.quizzes||[]).map(item=>({...item,id:String(item.id||item._id)})),
        assignments:(assignmentData.assignments||[]).map(item=>({...item,id:String(item.id||item._id)}))});
    }).catch(error=>{if(active){setMongoAssessments({courseId:id,quizzes:[],assignments:[],loading:false});notify(`Assessments could not be loaded: ${error.message}`,"error")}});
    return()=>{active=false};
  },[course?.id,course?.mongoContent,revision]);
  const lessons=useMemo(()=>Array.isArray(course?.lessons)?course.lessons:Array.isArray(course?.lessonItems)?course.lessonItems:[],[course]);
  const sections=useMemo(()=>{
    const existing=saved.sections||[];
    const assigned=new Set(existing.flatMap(s=>s.lessonIds||[]).map(String));
    const missing=lessons.filter(l=>!assigned.has(String(l.id))).map(l=>String(l.id));
    return [...existing.map(s=>({...s,lessonIds:(s.lessonIds||[]).filter(id=>lessons.some(l=>String(l.id)===String(id)))})),
      ...(missing.length?[{id:"unassigned",title:"Unassigned Lessons",lessonIds:missing}]:[])];
  },[saved,lessons]);
  const realSections=useMemo(()=>sections.filter(s=>s.id!=="unassigned"),[sections]);
  const placedLessons=useMemo(()=>realSections.reduce((total,s)=>total+s.lessonIds.length,0),[realSections]);
  const mongoAssessmentReady=course?.mongoContent&&mongoAssessments.courseId===String(course.id);
  const quizzes=course?(course.mongoContent?(mongoAssessmentReady?mongoAssessments.quizzes:[]):array(qkey(teacher,course.id))):[];
  const assignments=course?(course.mongoContent?(mongoAssessmentReady?mongoAssessments.assignments:[]):array(assignmentKey(teacher,course.id))):[];
  const links=saved.links||[];
  const resources=saved.resources||[];
  const linkedQuizCount=links.filter(l=>l.type==="quiz"&&quizzes.some(q=>matchesReference(q,l.id))).length;
  const linkedAssignmentCount=links.filter(l=>l.type==="assignment"&&assignments.some(a=>matchesReference(a,l.id))).length;
  const lessonCount=lessons.length;
  const quizCount=quizzes.length;
  const assignmentCount=assignments.length;
  const sectionCount=sections.length;
  const totalItems=lessonCount+quizCount+assignmentCount;
  const attached=resources.length;
  const organized=placedLessons+linkedQuizCount+linkedAssignmentCount;
  const contentScore=totalItems?organized/totalItems:0;
  const sectionScore=realSections.length?1:0;
  const completion=(totalItems||realSections.length)?Math.min(100,Math.round(contentScore*70+sectionScore*30)):0;
  const donutSegments=[
    {value:lessonCount,color:"#6500C8"},
    {value:quizCount,color:"#E3B32B"},
    {value:assignmentCount,color:"#A259E6"},
    {value:sectionCount,color:"#CFC8DC"}
  ];
  const donutTotal=donutSegments.reduce((total,segment)=>total+segment.value,0);
  const donutStyle=(()=>{
    if(!donutTotal)return {background:"conic-gradient(#E7DEF3 0 100%)"};
    let offset=0;
    const stops=[];
    for(const segment of donutSegments){
      if(!segment.value)continue;
      const start=(offset/donutTotal)*100;
      offset+=segment.value;
      const end=(offset/donutTotal)*100;
      stops.push(`${segment.color} ${start}% ${end}%`);
    }
    return {background:`conic-gradient(${stops.join(",")})`};
  })();
  const persist = (next, successMessage = "Curriculum saved.") => {
    if (!storageKey) { notify("Select a course first.", "error"); return false; }
    if (course.mongoContent) {
      if (!onSaveCurriculum) { notify("Course saving is unavailable.", "error"); return false; }
      setPendingCurriculum({ id: course.id, revision: course.revision, value: next });
      Promise.resolve(onSaveCurriculum(course.id, next)).then((saved) => {
        if (!saved) throw new Error("Curriculum could not be saved. Review the dashboard message.");
        notify(successMessage);
      }).catch((error) => { setPendingCurriculum(null); notify(error.message, "error"); });
      return true;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(new Event(EVENT));
      notify(successMessage);
      return true;
    } catch (error) { notify(error.message, "error"); return false; }
  };
  const syncLessonOrder=async orderedSections=>{
    if(!onReorderLessons||!course)return true;
    if(await onReorderLessons(course.id,orderedSections.flatMap(section=>section.lessonIds||[]))===false){
      notify("Curriculum saved, but the course lesson order could not be updated.","error");
      return false;
    }
    return true;
  };
  const addSection=()=>{if(!sectionName.trim()){notify("Enter a section title first.","error");return false}if(!course){notify("Select a course first.","error");return false}if(!persist({...saved,sections:[...(saved.sections||[]),{id:uid(),title:sectionName.trim(),lessonIds:[]}]},"Section added."))return false;setSectionName("");return true};
  const moveSection=(id,d)=>{const list=[...(saved.sections||[])],i=list.findIndex(s=>s.id===id),j=i+d;if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];if(persist({...saved,sections:list},"Sections reordered."))syncLessonOrder(list)};
  const startRename=s=>{setRenamingId(s.id);setRenameValue(s.title)};
  const confirmRename=()=>{const title=renameValue.trim();if(!title){notify("Section title can't be empty.","error");return}persist({...saved,sections:(saved.sections||[]).map(x=>x.id===renamingId?{...x,title}:x)},"Section renamed.");setRenamingId("");setRenameValue("")};
  const removeSection=s=>{if(!window.confirm(`Delete “${s.title}”? Lessons stay in the course as unassigned.`))return;const next=(saved.sections||[]).filter(x=>x.id!==s.id);if(persist({...saved,sections:next},"Section deleted. Lessons kept as unassigned."))syncLessonOrder(next)};
  const assignLesson=(lessonId,sectionId)=>{
    const actual=sectionId==="unassigned"?"":sectionId;
    let list=(saved.sections||[]).map(s=>({...s,lessonIds:(s.lessonIds||[]).filter(id=>String(id)!==String(lessonId))}));
    if(actual)list=list.map(s=>s.id===actual?{...s,lessonIds:[...s.lessonIds,String(lessonId)]}:s);
    if(persist({...saved,sections:list},"Lesson moved."))syncLessonOrder(list);
  };
  const moveLesson=(sectionId,lessonId,d)=>{
    const section=sections.find(s=>s.id===sectionId),ids=[...(section?.lessonIds||[])],i=ids.indexOf(String(lessonId)),j=i+d;
    if(i<0||j<0||j>=ids.length)return;
    [ids[i],ids[j]]=[ids[j],ids[i]];
    if(sectionId==="unassigned"){notify("Move this lesson into a section before reordering.","error");return}
    const nextSections=(saved.sections||[]).map(s=>s.id===sectionId?{...s,lessonIds:ids}:s);
    if(persist({...saved,sections:nextSections},"Lessons reordered."))syncLessonOrder(nextSections);
  };
  const createLesson=async()=>{
    if(!lessonTitle.trim()){notify("Enter a lesson title first.","error");return false}
    if(!course||!onAddLesson){notify("Lesson creation is unavailable right now.","error");return false}
    const id=uid();
    try {
      if(await onAddLesson(course.id,{id,title:lessonTitle.trim(),description:lessonDescription.trim(),duration:"",isFreePreview:false})===false){
        notify("Lesson could not be saved. Check the dashboard message and try again.","error");
        return false;
      }
    } catch (error) {
      notify(`Lesson could not be saved: ${error.message}`,"error");
      return false;
    }
    if(chosenSection&&chosenSection!=="unassigned"){
      const nextSections=(saved.sections||[]).map(s=>s.id===chosenSection?{...s,lessonIds:[...(s.lessonIds||[]),String(id)]}:s);
      if(persist({...saved,sections:nextSections},"Lesson added to section."))syncLessonOrder(nextSections);
      else {
        setLessonTitle("");setLessonDescription("");
        return true;
      }
    }
    setLessonTitle("");setLessonDescription("");notify("Lesson added. Use Edit to attach its video.");
    return true;
  };
  const addResource=async(lessonId,file,accept=DOCUMENT_TYPES)=>{
    if(!file)return;
    if(file.size>20*1024*1024){notify("Maximum file size is 20 MB.","error");return}
    if(!accept.test(file.name)){notify("This file type is not allowed here.","error");return}
    if (course?.mongoContent) {
      try {
        const fileId = await uploadContentFile("document", file);
        persist({ ...saved, resources: [...resources, { id: "remote:" + fileId, fileId, lessonId: String(lessonId), name: file.name, size: file.size }] }, "Resource attached. Submit the course for review when ready.");
      } catch (error) { notify(error.message, "error"); }
      return;
    }
    const id=uid();try{await put(id,file);persist({...saved,resources:[...resources,{id,lessonId:String(lessonId),name:file.name,size:file.size}]},"Resource attached.")}catch(e){notify(`File save failed: ${e.message}`,"error")}
  };
  const replaceResource=async(current,file)=>{
    if(!file)return;
    if(file.size>20*1024*1024){notify("Maximum file size is 20 MB.","error");return}
    if(!DOWNLOAD_TYPES.test(file.name)){notify("This file type is not allowed here.","error");return}
    try{
      let replacement={...current,name:file.name,size:file.size};
      if(course?.mongoContent){
        const fileId=await uploadContentFile("document",file);
        replacement={...replacement,id:`remote:${fileId}`,fileId};
      }else await put(current.id,file);
      persist({...saved,resources:resources.map(resource=>resource.id===current.id?replacement:resource)},"Resource replaced. The previous stored file was retained safely.");
    }catch(error){notify(`Resource could not be replaced: ${error.message}`,"error")}
  };
  const moveResource=(resource,direction)=>{
    const next=[...resources],positions=next.map((item,index)=>({item,index})).filter(entry=>String(entry.item.lessonId)===String(resource.lessonId));
    const current=positions.findIndex(entry=>entry.item.id===resource.id),target=current+direction;
    if(current<0||target<0||target>=positions.length)return;
    const left=positions[current].index,right=positions[target].index;
    [next[left],next[right]]=[next[right],next[left]];
    persist({...saved,resources:next},"Resources reordered.");
  };
  const openResource=async r=>{try{const file=r.fileId ? await loadContentFile(r.fileId) : await get(r.id);if(!file)throw Error("File missing from this browser");download(file)}catch(e){notify(e.message,"error")}};
  const removeResource=async r=>{try{if (!r.fileId) await del(r.id);persist({...saved,resources:resources.filter(x=>x.id!==r.id)},"Resource removed.")}catch(e){notify(e.message,"error")}};
  const setLink=(sectionId,type,id,checked)=>{const rest=links.filter(l=>!(l.sectionId===sectionId&&l.type===type&&String(l.id)===String(id)));persist({...saved,links:checked?[...rest,{sectionId,type,id:String(id)}]:rest});notify(checked?"Linked to section.":"Link removed.")};
  const moveLink=(sectionId,type,id,direction)=>{
    const next=[...links],positions=next.map((link,index)=>({link,index})).filter(item=>String(item.link.sectionId)===String(sectionId));
    const current=positions.findIndex(item=>item.link.type===type&&String(item.link.id)===String(id)),target=current+direction;
    if(current<0||target<0||target>=positions.length)return;
    const left=positions[current].index,right=positions[target].index;
    [next[left],next[right]]=[next[right],next[left]];
    persist({...saved,links:next},"Linked content reordered.");
  };
  const createAssessment=(type)=>{
    if(!course||!itemTitle.trim()){notify("Enter a title first.","error");return}
    if(course.mongoContent){
      setActiveTool("");
      if(onNavigate)onNavigate(type==="quiz"?"quizzes":"course-assignments");
      else notify(`Open Course ${type==="quiz"?"Quizzes":"Assignments"} to create the MongoDB record.`,"error");
      return;
    }
    const id=uid(), title=itemTitle.trim();
    try {
      if(type==="quiz"){
        const entry={id,title,description:itemDetails.trim(),passingScore:60,timeLimit:0,questions:[],published:false};
        localStorage.setItem(qkey(teacher,course.id),JSON.stringify([...quizzes,entry]));
        window.dispatchEvent(new Event("educonnect:quizzes-updated"));
      }else{
        const entry={id,title,instructions:itemDetails.trim(),dueAt:"",maxMarks:100,published:false,createdAt:new Date().toISOString()};
        localStorage.setItem(assignmentKey(teacher,course.id),JSON.stringify([...assignments,entry]));
        window.dispatchEvent(new Event("educonnect:assignments-updated"));
      }
    } catch (error) {
      notify(`${type==="quiz"?"Quiz":"Assignment"} draft could not be saved: ${error.message}`,"error");
      return;
    }
    if(itemSection&&itemSection!=="unassigned"&&!persist({...saved,links:[...links,{sectionId:itemSection,type,id:String(id)}]},"Draft created and linked.")){
      setItemTitle("");setItemDetails("");setItemSection("");setActiveTool("");
      return;
    }
    setItemTitle("");setItemDetails("");setItemSection("");setActiveTool("");
    notify(`${type==="quiz"?"Quiz":"Assignment"} draft created. Open its dashboard tab to complete and publish it.`);
  };
  const importCurriculum=()=>{
    try{
      const incoming=JSON.parse(importText);
      if(!incoming||typeof incoming!=="object"||Array.isArray(incoming))throw Error("Expected a curriculum JSON object");
      if(!Array.isArray(incoming.sections))throw Error("Missing \"sections\" array");
      const lessonIds=new Set(lessons.map(l=>String(l.id)));
      const quizIds=new Set(quizzes.map(q=>String(q.id)));
      const assignmentIds=new Set(assignments.map(a=>String(a.id)));
      const seen=new Set();
      let droppedLessons=0;
      const cleanSections=incoming.sections.slice(0,100).map((entry,index)=>{
        if(!entry||typeof entry.title!=="string"||!entry.title.trim())throw Error(`Section ${index+1} needs a title`);
        let id=String(entry.id||uid());
        if(seen.has(id))id=uid();
        seen.add(id);
        const rawIds=Array.isArray(entry.lessonIds)?entry.lessonIds:[];
        const kept=rawIds.map(String).filter(lessonId=>{const exists=lessonIds.has(lessonId);if(!exists)droppedLessons+=1;return exists});
        return {id,title:entry.title.trim().slice(0,160),lessonIds:kept};
      });
      const sectionIds=new Set(cleanSections.map(section=>section.id));
      const cleanLinks=(Array.isArray(incoming.links)?incoming.links:[])
        .filter(link=>link&&["quiz","assignment"].includes(link.type)&&link.id&&sectionIds.has(String(link.sectionId)))
        .filter(link=>link.type==="quiz"?quizIds.has(String(link.id)):assignmentIds.has(String(link.id)))
        .map(link=>({sectionId:String(link.sectionId),type:link.type,id:String(link.id)}));
      const cleanResources=(Array.isArray(incoming.resources)?incoming.resources:[])
        .filter(item=>item&&item.id&&item.name)
        .map(item=>({id:String(item.id),lessonId:String(item.lessonId||""),name:String(item.name).slice(0,200),size:Number(item.size)||0}));
      const droppedLinks=(Array.isArray(incoming.links)?incoming.links.length:0)-cleanLinks.length;
      if(!window.confirm(`Replace the current curriculum with the imported data?\n\nImport: ${cleanSections.length} sections, ${cleanLinks.length} linked assessments, ${cleanResources.length} resource references.\n${droppedLessons?`\n${droppedLessons} lesson references will be dropped because those lessons don't exist in this course.\n`:""}${droppedLinks?`${droppedLinks} link(s) will be dropped because their section or assessment no longer exists.\n`:""}\nCurrent sections, links and resource references will be replaced.`))return;
      if(persist({...saved,sections:cleanSections,links:cleanLinks,resources:cleanResources}))syncLessonOrder(cleanSections);
      setImportText("");setActiveTool("");
      notify(`Imported ${pluralize(cleanSections.length,"section")}, ${pluralize(cleanLinks.length,"link")} and ${pluralize(cleanResources.length,"resource reference")}.`);
    }catch(e){notify(`Import failed: ${e.message}`,"error")}
  };
  const exportCurriculum=()=>{
    if(!course){notify("Select a course first.","error");return}
    const payload={version:1,exportedAt:new Date().toISOString(),course:{id:course.id,title:course.title||""},sections:saved.sections||[],links,resources:resources.map(r=>({id:r.id,lessonId:r.lessonId,name:r.name,size:r.size}))};
    const file=new File([JSON.stringify(payload,null,2)],`curriculum-${String(course.title||"course").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")||"course"}.json`,{type:"application/json"});
    download(file);
    notify("Curriculum JSON downloaded. Import it in any course to restore sections and links.");
  };
  const bulkRename=()=>{
    const names=bulkNames.split("\n").map(x=>x.trim()).filter(Boolean);
    if(!names.length){notify("Enter one section title per line.","error");return}
    persist({...saved,sections:(saved.sections||[]).map((section,i)=>({...section,title:(names[i]||section.title).slice(0,160)}))});
    setActiveTool("");notify(`${pluralize(Math.min(names.length,(saved.sections||[]).length),"section name","section names")} updated.`);
  };
  const deleteLesson=async lesson=>{
    if(!course)return;
    if(!onDeleteLesson){assignLesson(lesson.id,"unassigned");notify("Lesson moved to Unassigned (course deletion is unavailable).");return}
    if(!window.confirm(`Delete “${lesson.title||"Untitled Lesson"}”? It will be removed from this course and its curriculum. This can't be undone.`))return;
    if(await onDeleteLesson(course.id,lesson.id,{skipConfirm:true})===false){
      notify("Lesson could not be deleted. Check the dashboard message and try again.","error");
      return;
    }
    const removed=resources.filter(r=>String(r.lessonId)===String(lesson.id));
    const nextSections=(saved.sections||[]).map(s=>({...s,lessonIds:(s.lessonIds||[]).filter(id=>String(id)!==String(lesson.id))}));
    const savedCurriculum=persist({...saved,sections:nextSections,resources:resources.filter(r=>String(r.lessonId)!==String(lesson.id))},"Lesson deleted and removed from the curriculum.");
    if(!savedCurriculum)return;
    syncLessonOrder(nextSections);
    Promise.allSettled(removed.filter(r=>!r.fileId).map(r=>del(r.id))).then(results=>{
      if(results.some(result=>result.status==="rejected"))notify("Lesson was deleted, but one or more attachment files could not be removed.","error");
    });
  };
  const tools=[{name:"Add Section",icon:Folder},{name:"Add Lesson",icon:PlaySquare},{name:"Add Quiz",icon:CircleHelp},{name:"Add Assignment",icon:ClipboardCheck},{name:"Add Resource",icon:Link2},{name:"Add Article (Text)",icon:FileText},{name:"Add Download",icon:Download}];
  const chooseTool=(name)=>{
    if(course?.mongoContent&&["Add Quiz","Add Assignment"].includes(name)){
      if(onNavigate)onNavigate(name==="Add Quiz"?"quizzes":"course-assignments");
      else notify(`Open Course ${name==="Add Quiz"?"Quizzes":"Assignments"} to create it.`,"error");
      return;
    }
    setActiveTool(name);setPreview(false);setMessage("");
  };
  const courseDetailsDone=Boolean(course&&String(course.title||"").trim()&&String(course.description||"").trim());
  const buildDone=realSections.length>0&&realSections.some(section=>section.lessonIds.length>0);
  const resourcesDone=attached>0;
  const publishDone=String(course?.status||"").toLowerCase()==="published";
  const steps=[
    {n:1,label:"Course Details",done:courseDetailsDone},
    {n:2,label:"Build Curriculum",done:buildDone},
    {n:3,label:"Add Resources",done:resourcesDone},
    {n:4,label:"Settings & Publish",done:publishDone}
  ];
  const goToStep=n=>{
    switch(n){
      case 1:
        if(course&&onEditCourse)onEditCourse(course.id);
        else if(!course)notify("Create or select a course first.","error");
        else notify("Course editing is unavailable right now.","error");
        break;
      case 2:
        setPreview(false);
        window.scrollTo({top:0,behavior:"smooth"});
        break;
      case 3:
        setPreview(false);
        setActiveTool(current=>current==="Add Resource"?"":"Add Resource");
        notify("Attach a PDF, document or file to any lesson.");
        break;
      case 4:
        if(lessons.length===0){notify("Add at least one lesson before publishing. Publishing also requires admin approval from the My Courses page.","error");return}
        if(onNavigate)onNavigate("courses");
        else notify("Open My Courses to submit or publish this course.","error");
        break;
      default:
        break;
    }
  };
  return <div className="ecc-root ecc-v2">
    <header className="ecc-page-head"><div className="ecc-page-title"><h2><Layers3 size={33}/> Curriculum Builder</h2><p>Build and organize your course curriculum with sections, lessons, quizzes, and assignments.</p></div>
      <div className="ecc-head-controls"><label className="ecc-course-picker"><span>Select Course</span><div className="ecc-picker-wrap"><span className="ecc-picker-icon" aria-hidden="true">{course?.thumbnail?<img src={course.thumbnail} alt=""/>:<GraduationCap size={20}/>}</span><select value={course?.id??""} disabled={!courses.length} onChange={e=>{setCourseId(e.target.value);resetTransient()}} aria-label="Select course">{courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select><ChevronDown size={17} className="ecc-picker-caret" aria-hidden="true"/></div></label><button type="button" className="ecc-btn ecc-preview-btn" onClick={()=>setPreview(x=>!x)} aria-pressed={preview}>{preview?<EyeOff size={18}/>:<Eye size={18}/>} {preview?"Edit Curriculum":"Preview Curriculum"}</button><button type="button" className="ecc-btn ecc-gold" onClick={()=>{if(course)persist(saved);else notify("Select a course first.","error")}}><Save size={19}/> Save Changes</button></div></header>
    <nav className="ecc-steps" aria-label="Course creation progress">{steps.map(step=>{const isCurrent=step.n===2;const className=step.done?"ecc-step ecc-done":isCurrent?"ecc-step ecc-current":"ecc-step";return <button key={step.n} type="button" className={className} aria-current={isCurrent?"step":undefined} onClick={()=>goToStep(step.n)}><b>{step.done?<Check size={17} strokeWidth={3}/>:step.n}</b><span>{step.label}</span>{step.done&&<Check size={19} className="ecc-step-check"/>}</button>})}</nav>
    {!courses.length?<div className="ecc-panel">No courses available. Create a course in My Courses first.</div>:<div className="ecc-layout">
      <aside className="ecc-panel ecc-tools" aria-label="Curriculum tools"><h3>Curriculum Tools</h3>{tools.map(t=><button key={t.name} type="button" className={activeTool===t.name?"ecc-tool ecc-tool-active":"ecc-tool"} onClick={()=>chooseTool(t.name)} aria-pressed={activeTool===t.name}><t.icon size={22}/><span>+ {t.name}</span></button>)}</aside>
      <main className="ecc-panel ecc-main" aria-label="Course curriculum"><div className="ecc-main-head"><h3><Layers3 size={26}/> Course Curriculum</h3><span>Total: {pluralize(sectionCount,"Section")} · {pluralize(lessonCount,"Lesson")} · {pluralize(quizCount,"Quiz","Quizzes")} · {pluralize(assignmentCount,"Assignment")}</span></div>
        {activeTool==="Add Section"&&!preview&&<div className="ecc-inline-editor"><h4>Create Section</h4><div className="ecc-inline"><input value={sectionName} onChange={e=>setSectionName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSection()} placeholder="e.g. Introduction to React" maxLength={160} aria-label="Section title"/><button type="button" className="ecc-btn ecc-purple" onClick={()=>{if(addSection())setActiveTool("")}}>Add Section</button><button type="button" className="ecc-btn" onClick={()=>setActiveTool("")}>Cancel</button></div></div>}
        {activeTool==="Add Lesson"&&!preview&&<div className="ecc-inline-editor"><h4>Create Video Lesson</h4><div className="ecc-form"><input value={lessonTitle} onChange={e=>setLessonTitle(e.target.value)} placeholder="Lesson title" maxLength={200} aria-label="Lesson title"/><textarea value={lessonDescription} onChange={e=>setLessonDescription(e.target.value)} placeholder="Lesson description" maxLength={2000} aria-label="Lesson description"/><select value={chosenSection} onChange={e=>setChosenSection(e.target.value)} aria-label="Section for new lesson"><option value="">Unassigned</option>{realSections.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select><button type="button" className="ecc-btn ecc-purple" onClick={async()=>{if(await createLesson())setActiveTool("")}}>Create Lesson</button><button type="button" className="ecc-btn" onClick={()=>setActiveTool("")}>Cancel</button></div></div>}
        {(["Add Quiz","Add Assignment","Add Article (Text)"].includes(activeTool))&&!preview&&<div className="ecc-inline-editor"><h4>{activeTool}</h4><div className="ecc-form"><input value={itemTitle} onChange={e=>setItemTitle(e.target.value)} placeholder="Title" maxLength={200} aria-label="Title"/><textarea value={itemDetails} onChange={e=>setItemDetails(e.target.value)} placeholder={activeTool==="Add Assignment"?"Assignment instructions":"Description / text content"} maxLength={4000} aria-label="Details"/><select value={itemSection} onChange={e=>setItemSection(e.target.value)} aria-label="Section"><option value="">No section</option>{realSections.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select><button type="button" className="ecc-btn ecc-purple" onClick={()=>{if(activeTool==="Add Article (Text)"){if(!itemTitle.trim()){notify("Enter an article title first.","error");return}setLessonTitle(itemTitle);setLessonDescription(itemDetails);setChosenSection(itemSection);setActiveTool("Add Lesson");notify("Review the article lesson and click Create Lesson.")}else createAssessment(activeTool==="Add Quiz"?"quiz":"assignment")}}>{activeTool==="Add Article (Text)"?"Continue to Lesson":"Create Draft"}</button><button type="button" className="ecc-btn" onClick={()=>setActiveTool("")}>Cancel</button></div></div>}
        {(["Add Resource","Add Download"].includes(activeTool))&&!preview&&<div className="ecc-inline-editor"><h4>{activeTool==="Add Resource"?"Attach a document to a lesson":"Add a downloadable file to a lesson"}</h4><p className="ecc-editor-note">{activeTool==="Add Resource"?"Allowed: PDF, TXT, MD, DOCX, PPTX · up to 20 MB.":"Allowed: PDF, TXT, MD, DOCX, PPTX, ZIP, PNG, JPG, XLSX, CSV · up to 20 MB."}</p><div className="ecc-form"><select value={resourceLesson} onChange={e=>setResourceLesson(e.target.value)} aria-label="Lesson to attach file to"><option value="">Select lesson</option>{lessons.map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</select><input type="file" disabled={!resourceLesson} accept={activeTool==="Add Resource"?".pdf,.txt,.md,.docx,.pptx":".pdf,.txt,.md,.docx,.pptx,.zip,.png,.jpg,.jpeg,.xlsx,.csv"} onChange={e=>{addResource(resourceLesson,e.target.files?.[0],activeTool==="Add Resource"?DOCUMENT_TYPES:DOWNLOAD_TYPES);e.target.value=""}} aria-label="Choose file to attach"/><button type="button" className="ecc-btn" onClick={()=>setActiveTool("")}>Close</button></div></div>}
        {activeTool==="Bulk Edit"&&!preview&&<div className="ecc-inline-editor"><h4>Bulk Rename Sections</h4><p className="ecc-editor-note">One section title per line, in current order. Extra lines are ignored; missing lines keep the current title.</p><textarea rows={5} value={bulkNames} onChange={e=>setBulkNames(e.target.value)} aria-label="Section titles, one per line"/><div className="ecc-inline"><button type="button" className="ecc-btn ecc-purple" onClick={bulkRename}>Apply Names</button><button type="button" className="ecc-btn" onClick={()=>setActiveTool("")}>Cancel</button></div></div>}
        {activeTool==="Import Curriculum"&&!preview&&<div className="ecc-inline-editor"><h4>Import Curriculum JSON</h4><p className="ecc-editor-note">Restores sections, assessment links and resource references from an exported file. You will be asked to confirm before anything is replaced.</p><input type="file" accept=".json,application/json" onChange={async e=>{const f=e.target.files?.[0];if(f){if(f.size>1024*1024){notify("JSON file must be under 1 MB","error");return}try{setImportText(await f.text())}catch{notify("Could not read that file.","error")}}}} aria-label="Choose curriculum JSON file"/><textarea rows={4} value={importText} onChange={e=>setImportText(e.target.value)} placeholder="Paste exported curriculum JSON" aria-label="Curriculum JSON"/><div className="ecc-inline"><button type="button" className="ecc-btn ecc-purple" onClick={importCurriculum}><Upload size={16}/> Import &amp; Replace</button><button type="button" className="ecc-btn" onClick={()=>setActiveTool("")}>Cancel</button></div></div>}
        {activeTool==="Reorder Content"&&!preview&&<div className="ecc-inline-editor"><h4>Reorder Content</h4><p className="ecc-editor-note">Move sections and lessons up or down. Changes save automatically.</p><div className="ecc-reorder-list">{realSections.map((section,index,list)=><div className="ecc-reorder-section" key={section.id}><div className="ecc-reorder-row"><GripVertical size={15} aria-hidden="true"/><Folder size={16} aria-hidden="true"/><span className="ecc-reorder-title">{index+1}. {section.title}</span><button type="button" className="ecc-icon-btn ecc-small" disabled={index===0} onClick={()=>moveSection(section.id,-1)} aria-label={`Move ${section.title} up`}><ArrowUp size={14}/></button><button type="button" className="ecc-icon-btn ecc-small" disabled={index===list.length-1} onClick={()=>moveSection(section.id,1)} aria-label={`Move ${section.title} down`}><ArrowDown size={14}/></button></div>{section.lessonIds.map((lessonId,li,lessonList)=>{const lesson=lessons.find(l=>String(l.id)===String(lessonId));return lesson&&<div className="ecc-reorder-row ecc-reorder-lesson" key={lessonId}><GripVertical size={15} aria-hidden="true"/><PlaySquare size={15} aria-hidden="true"/><span className="ecc-reorder-title">{index+1}.{li+1} {lesson.title||"Untitled Lesson"}</span><button type="button" className="ecc-icon-btn ecc-small" disabled={li===0} onClick={()=>moveLesson(section.id,lessonId,-1)} aria-label="Move lesson up"><ArrowUp size={14}/></button><button type="button" className="ecc-icon-btn ecc-small" disabled={li===lessonList.length-1} onClick={()=>moveLesson(section.id,lessonId,1)} aria-label="Move lesson down"><ArrowDown size={14}/></button></div>})}</div>)}{!realSections.length&&<p className="ecc-editor-note">No sections yet — add a section first, then reorder here.</p>}</div><button type="button" className="ecc-btn" onClick={()=>setActiveTool("")}>Done</button></div>}
        {!sections.length?<div className="ecc-empty">No sections yet. Click <strong>+ Add Section</strong> to start building your curriculum.</div>:sections.map((section,si)=>{const isOpen=expanded[section.id]??si===0;const linkedQuizzes=links.filter(l=>l.sectionId===section.id&&l.type==="quiz"&&quizzes.some(q=>matchesReference(q,l.id)));const linkedAssignments=links.filter(l=>l.sectionId===section.id&&l.type==="assignment"&&assignments.some(a=>matchesReference(a,l.id)));const linkedItems=links.filter(link=>String(link.sectionId)===String(section.id)).flatMap(link=>{const record=(link.type==="quiz"?quizzes:assignments).find(item=>matchesReference(item,link.id));return record?[{link,record}]:[]});const countParts=[pluralize(section.lessonIds.length,"Lesson")];if(linkedQuizzes.length)countParts.push(pluralize(linkedQuizzes.length,"Quiz","Quizzes"));if(linkedAssignments.length)countParts.push(pluralize(linkedAssignments.length,"Assignment"));return <article className="ecc-chapter" key={section.id}>
          <div className="ecc-chapter-head"><GripVertical size={17} aria-hidden="true"/><Folder size={22} aria-hidden="true"/>{renamingId===section.id?<span className="ecc-rename"><input autoFocus value={renameValue} maxLength={160} onChange={e=>setRenameValue(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")confirmRename();if(e.key==="Escape")setRenamingId("")}} aria-label="Section title"/><button type="button" title="Save section name" className="ecc-icon-btn" onClick={confirmRename}><Check size={15}/></button><button type="button" title="Cancel rename" className="ecc-icon-btn" onClick={()=>setRenamingId("")}><X size={15}/></button></span>:<button type="button" className="ecc-chapter-name" onClick={()=>setExpanded(v=>({...v,[section.id]:!isOpen}))}>{si+1}. {section.title}</button>}<span className="ecc-chapter-count">{countParts.join(" · ")}</span>{section.id==="unassigned"&&<span className="ecc-badge">Needs a section</span>}{!preview&&section.id!=="unassigned"&&<button type="button" title="Rename section" className="ecc-icon-btn" onClick={()=>startRename(section)}><Pencil size={15}/></button>}<button type="button" className="ecc-icon-btn" aria-label={isOpen?"Collapse section":"Expand section"} aria-expanded={isOpen} onClick={()=>setExpanded(v=>({...v,[section.id]:!isOpen}))}>{isOpen?<ChevronUp size={20}/>:<ChevronDown size={20}/>}</button></div>
          {isOpen&&<div className="ecc-chapter-body">{section.lessonIds.map((lessonId,li)=>{const lesson=lessons.find(l=>String(l.id)===String(lessonId));if(!lesson)return null;const attachOpen=resourceLesson===String(lessonId);return <div key={lessonId} className="ecc-lesson-block"><div className="ecc-lesson-row"><GripVertical size={17} aria-hidden="true"/><span className="ecc-lesson-icon"><PlaySquare size={17}/></span><strong>{si+1}.{li+1} {lesson.title||"Untitled Lesson"}</strong><span className="ecc-lesson-duration"><Clock3 size={12} aria-hidden="true"/> {lesson.duration||"Video"}</span>{!preview&&<><button type="button" title="Move lesson up" aria-label="Move lesson up" className="ecc-icon-btn ecc-small" disabled={li===0} onClick={()=>moveLesson(section.id,lessonId,-1)}><ArrowUp size={13}/></button><button type="button" title="Move lesson down" aria-label="Move lesson down" className="ecc-icon-btn ecc-small" disabled={li===section.lessonIds.length-1} onClick={()=>moveLesson(section.id,lessonId,1)}><ArrowDown size={13}/></button><button type="button" title="Edit lesson" aria-label={`Edit ${lesson.title||"lesson"}`} className="ecc-icon-btn" onClick={()=>{if(onOpenLesson)onOpenLesson(course.id,lesson.id);else notify("Open Lessons in the Teacher Dashboard to edit this lesson.","error")}}><Pencil size={16}/></button><button type="button" title="Delete lesson" aria-label={`Delete ${lesson.title||"lesson"}`} className="ecc-icon-btn ecc-danger" onClick={()=>deleteLesson(lesson)}><Trash2 size={16}/></button></>}</div>
          {!preview&&attachOpen&&<div className="ecc-resource-editor"><label>Attach PDF / document<input type="file" accept=".pdf,.txt,.md,.docx,.pptx,.zip,.png,.jpg,.jpeg,.xlsx,.csv" onChange={e=>{addResource(lessonId,e.target.files?.[0],DOWNLOAD_TYPES);e.target.value=""}}/></label><button type="button" onClick={()=>setResourceLesson("")}>Close</button></div>}
          {resources.filter(r=>r.lessonId===String(lessonId)).map((r,ri,list)=><div className="ecc-resource-row" key={r.id}><FileText size={14} aria-hidden="true"/><span className="ecc-resource-name">{r.name}</span><button type="button" onClick={()=>openResource(r)}>Download</button>{!preview&&<><button type="button" disabled={ri===0} onClick={()=>moveResource(r,-1)} aria-label={`Move ${r.name} up`}><ArrowUp size={13}/></button><button type="button" disabled={ri===list.length-1} onClick={()=>moveResource(r,1)} aria-label={`Move ${r.name} down`}><ArrowDown size={13}/></button><label className="ecc-resource-replace">Replace<input type="file" accept=".pdf,.txt,.md,.docx,.pptx,.zip,.png,.jpg,.jpeg,.xlsx,.csv" onChange={event=>{replaceResource(r,event.target.files?.[0]);event.target.value=""}}/></label><button type="button" onClick={()=>removeResource(r)}>Remove</button></>}</div>)}
          {!preview&&<div className="ecc-lesson-extra"><button type="button" onClick={()=>setResourceLesson(attachOpen?"":String(lessonId))}><Plus size={13}/> Attach resource</button><select aria-label="Move lesson to section" value={section.id} onChange={e=>assignLesson(lessonId,e.target.value)}><option value="unassigned">Unassigned</option>{realSections.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></div>}</div>})}
          {linkedItems.map(({link,record},index)=><div className="ecc-assessment-row" key={`${link.type}${link.id}`}><GripVertical size={16} aria-hidden="true"/><span className="ecc-assessment-icon">{link.type==="quiz"?<CircleHelp size={17}/>:<ClipboardCheck size={17}/>}</span><strong>{link.type==="quiz"?"Quiz":"Assignment"}: {record.title}</strong><span className="ecc-assessment-meta">{link.type==="quiz"?pluralize(record.questions?.length||0,"Question"):(record.maxMarks?`${record.maxMarks} marks`:"Assignment")}</span>{!preview&&<><button type="button" title="Move linked content up" aria-label={`Move ${record.title} up`} className="ecc-icon-btn ecc-small" disabled={index===0} onClick={()=>moveLink(section.id,link.type,link.id,-1)}><ArrowUp size={13}/></button><button type="button" title="Move linked content down" aria-label={`Move ${record.title} down`} className="ecc-icon-btn ecc-small" disabled={index===linkedItems.length-1} onClick={()=>moveLink(section.id,link.type,link.id,1)}><ArrowDown size={13}/></button><button type="button" title={`Edit ${link.type}`} aria-label={`Edit ${record.title}`} className="ecc-icon-btn" onClick={()=>{if(onNavigate)onNavigate(link.type==="quiz"?"quizzes":"course-assignments");else notify(`Open Course ${link.type==="quiz"?"Quizzes":"Assignments"} to edit this item.`,"error")}}><Pencil size={16}/></button><button type="button" title={`Unlink ${link.type} from section`} aria-label={`Unlink ${record.title}`} className="ecc-icon-btn ecc-danger" onClick={()=>setLink(section.id,link.type,link.id,false)}><Trash2 size={16}/></button></>}</div>)}
          {!preview&&(quizzes.length>0||assignments.length>0)&&<details className="ecc-link-panel"><summary>+ Link existing quiz or assignment</summary>{quizzes.map(q=><label key={q.id}><input type="checkbox" checked={linkedQuizzes.some(l=>matchesReference(q,l.id))} onChange={e=>setLink(section.id,"quiz",q.id,e.target.checked)}/> Quiz: {q.title}</label>)}{assignments.map(a=><label key={a.id}><input type="checkbox" checked={linkedAssignments.some(l=>matchesReference(a,l.id))} onChange={e=>setLink(section.id,"assignment",a.id,e.target.checked)}/> Assignment: {a.title}</label>)}</details>}
          {!preview&&section.id!=="unassigned"&&<div className="ecc-section-actions"><button type="button" onClick={()=>moveSection(section.id,-1)} disabled={si===0}><ArrowUp size={12}/> Move Section</button><button type="button" onClick={()=>moveSection(section.id,1)} disabled={si===realSections.length-1}><ArrowDown size={12}/> Move Section</button><button type="button" className="ecc-danger-text" onClick={()=>removeSection(section)}>Delete Section</button></div>}</div>}</article>})}
      </main>
      <aside className="ecc-right" aria-label="Curriculum statistics and quick actions"><div className="ecc-panel ecc-structure-card"><h3><ClipboardCheck size={21}/> Course Structure</h3><div className="ecc-structure"><div className="ecc-donut" style={donutStyle} role="img" aria-label={`Curriculum ${completion} percent complete`}><div className="ecc-donut-center"><strong>{completion}%</strong><small>Complete</small></div></div><ul className="ecc-legend"><li><i className="ecc-dot ecc-dot-purple"/>Lessons <strong>{lessonCount}</strong></li><li><i className="ecc-dot ecc-dot-yellow"/>Quizzes <strong>{quizCount}</strong></li><li><i className="ecc-dot ecc-dot-lavender"/>Assignments <strong>{assignmentCount}</strong></li><li><i className="ecc-dot ecc-dot-grey"/>Sections <strong>{sectionCount}</strong></li></ul></div></div>
      <div className="ecc-panel ecc-overview-card"><h3><ClipboardCheck size={21}/> Curriculum Overview</h3><div className="ecc-overview"><div><PlaySquare aria-hidden="true"/><strong>{lessonCount}</strong><small>Lessons</small></div><div><CircleHelp aria-hidden="true"/><strong>{quizCount}</strong><small>Quizzes</small></div><div><ClipboardCheck aria-hidden="true"/><strong>{assignmentCount}</strong><small>Assignments</small></div><div><Folder aria-hidden="true"/><strong>{sectionCount}</strong><small>Sections</small></div></div></div>
      <div className="ecc-panel ecc-actions-card"><h3><svg className="ecc-lightning" viewBox="0 0 24 24" width="24" height="24" fill="#E3B32B" aria-hidden="true"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg> Quick Actions</h3><div className="ecc-quick"><button type="button" onClick={()=>{setPreview(false);setActiveTool("Reorder Content")}}><ArrowUpDown aria-hidden="true"/>Reorder Content</button><button type="button" onClick={()=>{setBulkNames(realSections.map(x=>x.title).join("\n"));setPreview(false);setActiveTool("Bulk Edit")}}><Pencil aria-hidden="true"/>Bulk Edit</button><button type="button" onClick={()=>{setPreview(false);setActiveTool("Import Curriculum")}}><Upload aria-hidden="true"/>Import Curriculum</button><button type="button" onClick={exportCurriculum}><Download aria-hidden="true"/>Export Curriculum</button></div></div></aside>
    </div>}
    {message&&<p className={`ecc-message${messageType==="error"?" ecc-message-error":""}`} role="status">{messageType==="error"?<AlertCircle size={18} aria-hidden="true"/>:<CheckCircle2 size={18} aria-hidden="true"/>}<span>{message}</span><button type="button" onClick={()=>setMessage("")} aria-label="Dismiss"><X size={17}/></button></p>}
  </div>;

}

export default function CurriculumBuilder({ role, email, ...props }) {
  return role === "teacher" ? <TeacherCurriculumBuilder role="teacher" email={email} {...props} /> : <StudentCourseCurriculum key={email} email={email} {...props} />;
}
