import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import {unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ContentFile from '../src/models/ContentFile.js';
import Teacher from '../src/models/Teacher.js';import Student from '../src/models/Student.js';import Course from '../src/models/Course.js';import Assignment from '../src/models/Assignment.js';import AssignmentSubmission from '../src/models/AssignmentSubmission.js';import ContentAccess from '../src/models/ContentAccess.js';
test('Assignment ownership, enrollment, submissions and grading over HTTP', {timeout:60000},async t=>{
 const database='educonnect_assignment_test_'+randomUUID().replaceAll('-','');Object.assign(process.env,{NODE_ENV:'test',JWT_SECRET:'assignment-test-only-secret-at-least-32-characters',CLIENT_ORIGIN:'http://localhost:5173'});
 await mongoose.connect('mongodb://127.0.0.1:27017',{dbName:database,serverSelectionTimeoutMS:5000});let server;t.after(async()=>{if(server)await new Promise(r=>server.close(r));for(const file of await ContentFile.find().lean())await unlink(fileURLToPath(new URL(`../uploads/content/${file.storageName}`,import.meta.url))).catch(()=>{});assert.equal(mongoose.connection.name,database);await mongoose.connection.dropDatabase();await mongoose.disconnect();});
 await Promise.all([Teacher,Student,Course,Assignment,AssignmentSubmission,ContentAccess].map(m=>m.init()));const {default:app}=await import('../src/app.js');server=app.listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;const password='Test-password-12345';const accounts={owner:await Teacher.create({email:'assign-owner@example.test',fullName:'Owner',role:'teacher',password}),other:await Teacher.create({email:'assign-other@example.test',fullName:'Other',role:'teacher',password}),student:await Student.create({email:'assign-student@example.test',fullName:'Student',role:'student',password}),stranger:await Student.create({email:'assign-stranger@example.test',fullName:'Stranger',role:'student',password})};const cookies={};
 async function request(path,{actor,method='GET',body}={}){const r=await fetch(base+path,{method,headers:{'X-Requested-With':'XMLHttpRequest',...(actor?{Cookie:cookies[actor]}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{code:r.status,data:await r.json(),response:r};}
 for(const [name,account] of Object.entries(accounts)){const r=await request('/auth/login',{method:'POST',body:{email:account.email,password}});assert.equal(r.code,200);cookies[name]=r.response.headers.get('set-cookie').split(';')[0];}
 const course=await Course.create({teacherId:accounts.owner._id,title:'Machine Learning',status:'published',published:true,approvedVersion:{title:'Machine Learning'}}),id=String(course._id),root=`/assignments/courses/${id}`,input={title:'ML homework',description:'Models',instructions:'Explain supervised learning.',maxMarks:100,dueAt:new Date(Date.now()+86400000).toISOString(),attachmentIds:[]};
 assert.equal((await request(root+'/teacher')).code,401);
 let result=await request(root+'/teacher',{actor:'owner',method:'POST',body:{...input,legacyId:'browser-assignment-1',teacherId:accounts.other._id,published:true}});assert.equal(result.code,201,JSON.stringify(result.data));const assignmentId=String(result.data.assignment._id);assert.equal(await Assignment.countDocuments(),1);assert.equal(String((await Assignment.findById(assignmentId)).teacherId),String(accounts.owner._id));
 result=await request(root+'/teacher',{actor:'owner',method:'POST',body:{...input,legacyId:'browser-assignment-1'}});assert.equal(result.code,200);assert.equal(await Assignment.countDocuments(),1);
 assert.equal((await request(root+'/teacher/'+assignmentId,{actor:'other',method:'PUT',body:{...input,revision:0}})).code,403);
 assert.equal((await request(root+'/teacher/'+assignmentId,{actor:'other',method:'DELETE'})).code,403);
 assert.equal((await request(root+'/student',{actor:'student'})).code,403);
 assert.equal((await request(root+'/teacher/'+assignmentId+'/publish',{actor:'owner',method:'PATCH',body:{published:true}})).code,200);
 assert.equal((await request(root+'/student',{actor:'student'})).code,403);
 await ContentAccess.create({studentId:accounts.student._id,kind:'course',contentId:course._id,source:'free',price:0});
 assert.equal((await request(root+'/student',{actor:'student'})).data.assignments.length,1);
 assert.equal((await request(root+'/student',{actor:'stranger'})).code,403);
 await ContentAccess.create({studentId:accounts.stranger._id,kind:'course',contentId:course._id,source:'free',price:0});
 assert.equal((await request(root+'/student',{actor:'stranger'})).data.submissions.length,0);
 assert.equal((await request(root+'/student/'+assignmentId+'/submission',{method:'PUT',body:{answer:'Work'}})).code,401);
 const submitted=await request(root+'/student/'+assignmentId+'/submission',{actor:'student',method:'PUT',body:{answer:'My answer',marks:100}});assert.equal(submitted.code,200,JSON.stringify(submitted.data));const submissionId=String(submitted.data.submission._id);assert.equal(await AssignmentSubmission.countDocuments(),1);assert.equal(submitted.data.submission.marks,null);
 assert.equal((await request(root+'/student/'+assignmentId+'/submission',{actor:'student',method:'PUT',body:{answer:'Revised'}})).code,200);assert.equal(await AssignmentSubmission.countDocuments(),1);
 assert.equal((await request(root+'/teacher/'+assignmentId+'/submissions/'+submissionId,{actor:'other',method:'PATCH',body:{marks:80}})).code,403);
 assert.equal((await request(root+'/teacher/'+assignmentId+'/submissions/'+submissionId,{actor:'owner',method:'PATCH',body:{marks:101}})).code,400);
 assert.equal((await request(root+'/teacher/'+assignmentId+'/submissions/'+submissionId,{actor:'owner',method:'PATCH',body:{marks:85,feedback:'Good work'}})).code,200);
 const studentView=await request(root+'/student',{actor:'student'});assert.equal(studentView.data.submissions[0].marks,85);assert.equal(studentView.data.submissions[0].feedback,'Good work');assert.equal((await request(root+'/student/'+assignmentId+'/submission',{actor:'student',method:'PUT',body:{answer:'After grading'}})).code,409);
 assert.equal((await request(root+'/attachments/'+new mongoose.Types.ObjectId(),{actor:'student'})).code,404);
 const form=new FormData();form.append('file',new File([Buffer.from('%PDF-1.4\n1 0 obj\n')],'instructions.pdf',{type:'application/pdf'}));
 const upload=await fetch(base+root+'/attachments',{method:'POST',headers:{Cookie:cookies.owner,'X-Requested-With':'XMLHttpRequest'},body:form});assert.equal(upload.status,201);const uploaded=await upload.json();const fileId=uploaded.file.id;
 const privateFile=()=>fetch(base+root+'/attachments/'+fileId,{headers:{Cookie:cookies.student}});
 assert.equal((await privateFile()).status,403);
 assert.equal((await fetch(base+root+'/attachments/'+fileId)).status,401);
 const attached=await request(root+'/teacher/'+assignmentId,{actor:'owner',method:'PUT',body:{...input,revision:0,attachmentIds:[fileId]}});assert.equal(attached.code,200,JSON.stringify(attached.data));
 assert.equal((await privateFile()).status,403);
 assert.equal((await request(root+'/teacher/'+assignmentId+'/publish',{actor:'owner',method:'PATCH',body:{published:true}})).code,200);
 assert.equal((await privateFile()).status,200);
 assert.equal((await fetch(base+root+'/attachments/'+fileId,{headers:{Cookie:cookies.stranger}})).status,200);

 const draft=await Course.create({teacherId:accounts.owner._id,title:'Unapproved'});const droot=`/assignments/courses/${draft._id}`;const d=await request(droot+'/teacher',{actor:'owner',method:'POST',body:input});assert.equal(d.code,201);assert.equal((await request(droot+'/teacher/'+d.data.assignment._id+'/publish',{actor:'owner',method:'PATCH',body:{published:true}})).code,409);
});

