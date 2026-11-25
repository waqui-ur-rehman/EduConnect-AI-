
import mongoose from "mongoose";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      // Production index builds must be reviewed and scheduled explicitly;
      // development and isolated test databases may build schema indexes.
      autoIndex: process.env.NODE_ENV !== "production"
    });

    console.log("MongoDB Connected Successfully");
    console.log("Database:", mongoose.connection.name);
  } catch (error) {
    console.error("MongoDB Connection Error:", error.message);
    process.exit(1);
  }
};

export default connectDB;
