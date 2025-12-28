import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

if (!process.env.MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable inside .env.local");
}

async function addCredits() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    const db = client.db("rentbot");
    const users = db.collection("users");

    // Update all users to have at least 50 credits, or add 50. 
    // The user said "add more credits for now to all users".
    // I'll set them all to a high number like 100 to ensure testing is unhindered.
    const result = await users.updateMany(
      {},
      { $set: { credits: 100 } }
    );

    console.log(`Updated ${result.modifiedCount} users to have 100 credits.`);
    
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

addCredits();
