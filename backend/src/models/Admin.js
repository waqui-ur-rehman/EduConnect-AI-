
import mongoose from "mongoose";
import { userSchema } from "./User.js";

const Admin = mongoose.model(
  "Admin",
  userSchema.clone(),
  "admins"
);

export default Admin;
