import { MongoClient, ObjectId } from "mongodb";
const uri = process.env.MONGODB_URI || "";
const dbName = process.env.MONGODB_DB || "encuestas";
let db;
export function isReady() { return Boolean(db); }
export async function connect() {
  if (!uri) throw new Error("Falta MONGODB_URI");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  db = client.db(dbName);
  await db.collection("users").createIndex({ username: 1 }, { unique: true });
  await db.collection("polls").createIndex({ createdAt: -1 });
  await db.collection("votes").createIndex({ pollId: 1, userId: 1 }, { unique: true });
  console.log(`MongoDB conectado (${dbName})`);
  return db;
}
export const users = () => db.collection("users");
export const polls = () => db.collection("polls");
export const votes = () => db.collection("votes");
export function toId(value) { return ObjectId.isValid(value) ? new ObjectId(String(value)) : null; }
export function mapPoll(doc, counts = [], mine = "") {
  return { id: String(doc._id), question: doc.question, options: doc.options.map((label, index) => ({ index, label, votes: counts[index] || 0 })), mine, mineOwn: false };
}
