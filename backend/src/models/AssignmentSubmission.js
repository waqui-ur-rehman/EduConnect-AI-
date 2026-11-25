import mongoose from 'mongoose';
const schema=new mongoose.Schema({assignmentId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},courseId:{type:mongoose.Schema.Types.ObjectId,required:true,immutable:true},studentId:{type:mongoose.Schema.Types.ObjectId,required:true,immutable:true},answer:{type:String,default:'',maxlength:20000},fileIds:[{type:mongoose.Schema.Types.ObjectId,ref:'ContentFile'}],submittedAt:{type:Date,default:Date.now},status:{type:String,enum:['submitted','graded'],default:'submitted'},marks:{type:Number,default:null},feedback:{type:String,default:'',maxlength:10000},gradedAt:Date}, {timestamps:true});
schema.index({assignmentId:1,studentId:1},{unique:true});
schema.index({studentId:1,courseId:1});
export default mongoose.model('AssignmentSubmission',schema);
