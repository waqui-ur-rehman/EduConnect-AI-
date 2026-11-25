import mongoose from 'mongoose';
const schema = new mongoose.Schema({courseId:{type:mongoose.Schema.Types.ObjectId,required:true,immutable:true},teacherId:{type:mongoose.Schema.Types.ObjectId,required:true,immutable:true},legacyId:{type:String,immutable:true},title:{type:String,required:true,maxlength:140},description:{type:String,default:'',maxlength:5000},instructions:{type:String,required:true,maxlength:20000},maxMarks:{type:Number,required:true,min:1,max:10000},dueAt:Date,published:{type:Boolean,default:false},attachmentIds:[{type:mongoose.Schema.Types.ObjectId,ref:'ContentFile'}],revision:{type:Number,default:0}}, {timestamps:true});
schema.index({teacherId:1,courseId:1,legacyId:1},{unique:true,partialFilterExpression:{legacyId:{$type:'string'}}});
schema.index({courseId:1,updatedAt:-1});
schema.index({courseId:1,published:1,createdAt:1});
export default mongoose.model('Assignment',schema);
