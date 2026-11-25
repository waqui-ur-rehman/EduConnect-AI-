
import "dotenv/config";
import mongoose from "mongoose";

const databaseUrl = process.env.MONGO_URI;
const apply = process.argv.includes("--apply");

const collectionNames = {
  student: "students",
  teacher: "teachers",
  admin: "admins"
};

const normalizeEmail = (value) =>
  typeof value === "string"
    ? value.trim().toLowerCase()
    : "";

async function migrateUsers() {
  if (!databaseUrl) {
    throw new Error("MONGO_URI is missing in .env");
  }

  await mongoose.connect(databaseUrl);

  const db = mongoose.connection.db;

  console.log("Database:", db.databaseName);
  console.log("Mode:", apply ? "APPLY" : "DRY RUN");

  const oldUsers = await db
    .collection("users")
    .find({})
    .toArray();

  const existingRecords = [];

  for (const collection of Object.values(collectionNames)) {
    const records = await db
      .collection(collection)
      .find({}, { projection: { _id: 1, email: 1 } })
      .toArray();

    for (const record of records) {
      existingRecords.push({
        collection,
        id: String(record._id),
        email: normalizeEmail(record.email)
      });
    }
  }

  const planned = [];
  const skipped = [];
  const conflicts = [];
  const sourceEmails = new Set();

  for (const user of oldUsers) {
    const role = String(user.role || "").toLowerCase();
    const target = collectionNames[role];
    const email = normalizeEmail(user.email);
    const id = String(user._id);

    if (!target || !email) {
      conflicts.push(`Invalid role or email for user ${id}`);
      continue;
    }

    if (sourceEmails.has(email)) {
      conflicts.push(`Duplicate email in old users: ${email}`);
      continue;
    }

    sourceEmails.add(email);

    const matches = existingRecords.filter(
      (record) =>
        record.email === email || record.id === id
    );

    if (matches.length > 0) {
      const alreadyCopied =
        matches.length === 1 &&
        matches[0].collection === target &&
        matches[0].email === email &&
        matches[0].id === id;

      if (alreadyCopied) {
        skipped.push(email);
      } else {
        conflicts.push(`Conflicting existing account: ${email}`);
      }

      continue;
    }

    planned.push({
      target,
      document: { ...user }
    });
  }

  console.log("\nMigration Summary");
  console.log("-------------------------");
  console.log("Old users:", oldUsers.length);
  console.log("Already migrated:", skipped.length);
  console.log("Ready to migrate:", planned.length);
  console.log("Conflicts:", conflicts.length);

  for (const target of Object.values(collectionNames)) {
    console.log(
      `${target}:`,
      planned.filter((item) => item.target === target).length
    );
  }

  if (conflicts.length) {
    console.error("\nConflicts found:");
    conflicts.forEach((message) => console.error(message));
    throw new Error("Migration stopped due to conflicts");
  }

  if (!apply) {
    console.log("\nDRY RUN complete. No data changed.");
    console.log("Use --apply only after reviewing results.");
    return;
  }

  for (const target of Object.values(collectionNames)) {
    await db.collection(target).createIndex(
      { email: 1 },
      { unique: true }
    );
  }

  let copied = 0;

  for (const item of planned) {
    // Direct collection insertion preserves password hashes.
    // It does not execute Mongoose password hashing hooks.
    await db
      .collection(item.target)
      .insertOne(item.document);

    copied++;
  }

  console.log(`\nSuccessfully copied ${copied} accounts.`);
  console.log("Original users collection was NOT deleted.");
}

try {
  await migrateUsers();
} catch (error) {
  console.error("Migration error:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
