import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function listUsers() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db("rentbot");
    const users = await db.collection("users").find({}).toArray();
    console.log("Users found:", users);
  } finally {
    await client.close();
  }
}

listUsers();
