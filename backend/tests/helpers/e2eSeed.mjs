import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const DB = process.env.E2E_MONGO_URI || "mongodb://127.0.0.1:27017/educonnect_e2e_test";
const PASSWORD = "TestPass123!";

function id() { return new mongoose.Types.ObjectId(); }

async function run() {
  await mongoose.connect(DB, { serverSelectionTimeoutMS: 5000 });
  const dbName = mongoose.connection.name;
  if (!/e2e|test/i.test(dbName)) throw new Error(`Refusing to seed non-test DB: ${dbName}`);
  await mongoose.connection.dropDatabase();

  const now = new Date();
  const hash = await bcrypt.hash(PASSWORD, 12);

  const users = {
    admin:   { _id: id(), fullName: "E2E Admin",   email: "e2e.admin@educonnect.test",   password: hash, role: "admin",   isActive: true, isVerified: true, teacherStatus: "not_applicable" },
    teacher: { _id: id(), fullName: "E2E Teacher", email: "e2e.teacher@educonnect.test", password: hash, role: "teacher", isActive: true, isVerified: true, teacherStatus: "approved" },
    teacher2:{ _id: id(), fullName: "E2E Teacher2",email: "e2e.teacher2@educonnect.test",password: hash, role: "teacher", isActive: true, isVerified: true, teacherStatus: "approved" },
    student: { _id: id(), fullName: "E2E Student", email: "e2e.student@educonnect.test", password: hash, role: "student", isActive: true, isVerified: true, teacherStatus: "not_applicable" },
  };

  await mongoose.connection.collection("admins").insertOne({ ...users.admin, createdAt: now, updatedAt: now });
  await mongoose.connection.collection("teachers").insertMany([{ ...users.teacher, createdAt: now, updatedAt: now }, { ...users.teacher2, createdAt: now, updatedAt: now }]);
  await mongoose.connection.collection("students").insertOne({ ...users.student, createdAt: now, updatedAt: now });

  const ver = (accountId, email, name) => ({
    accountId, email, fullName: name, status: "verified",
    documents: { front: { relativePath: "e2e/front.jpg", mimeType: "image/jpeg" }, back: { relativePath: "e2e/back.jpg", mimeType: "image/jpeg" } },
    submittedAt: now, reviewedAt: now, rejectionReason: "", createdAt: now, updatedAt: now,
  });
  await mongoose.connection.collection("teacher_verifications").insertMany([ver(users.teacher._id, users.teacher.email, users.teacher.fullName), ver(users.teacher2._id, users.teacher2.email, users.teacher2.fullName)]);
  await mongoose.connection.collection("student_verifications").insertOne(ver(users.student._id, users.student.email, users.student.fullName));

  console.log(JSON.stringify({ ok: true, db: dbName, password: PASSWORD, users: Object.fromEntries(Object.entries(users).map(([k,v]) => [k, { id: String(v._id), email: v.email, role: v.role }])) }));
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
