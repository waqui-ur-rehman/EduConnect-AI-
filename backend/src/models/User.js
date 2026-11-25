
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { fitsBcrypt } from "../utils/passwordPolicy.js";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: 100
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please enter a valid email"
      ]
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
      validate: { validator: fitsBcrypt, message: "Password must be at most 72 UTF-8 bytes." },
      select: false
    },

    role: {
      type: String,
      enum: ["student", "teacher", "admin"],
      default: "student"
    },

    avatar: {
      type: String,
      default: ""
    },

    isActive: {
      type: Boolean,
      default: true
    },

    isVerified: {
      type: Boolean,
      default: false
    },

    teacherStatus: {
      type: String,
      enum: [
        "not_applicable",
        "pending",
        "approved",
        "rejected"
      ],
      default: "not_applicable"
    },

    sessionVersion: { type: Number, default: 0, select: false },

    lastLogin: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

userSchema.index({ createdAt: -1, email: 1 });
userSchema.index({ isActive: 1, createdAt: -1 });
userSchema.index({ lastLogin: -1 });

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(
    this.password,
    12
  );
});

// Compare password during login
userSchema.methods.comparePassword = async function (
  enteredPassword
) {
  if (!fitsBcrypt(enteredPassword)) return false;
  return bcrypt.compare(
    enteredPassword,
    this.password
  );
};

// Do not expose password in JSON responses
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.sessionVersion;
    delete ret.__v;
    return ret;
  }
});

const User = mongoose.model("User", userSchema);

export { userSchema };
export default User;
