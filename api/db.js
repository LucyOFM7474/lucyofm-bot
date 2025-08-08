// api/db.js
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI; // Setată în Vercel → Environment Variables
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

let db;

async function connectToDatabase() {
  if (db) return db;
  try {
    await client.connect();
    db = client.db("lucyofm_bot");
    console.log("✅ Conexiune MongoDB reușită");
    return db;
  } catch (error) {
    console.error("❌ Eroare conectare MongoDB:", error);
    throw error;
  }
}

async function saveAnalysis(match, analysis) {
  const database = await connectToDatabase();
  return database.collection("analyses").insertOne({
    match,
    analysis,
    createdAt: new Date()
  });
}

async function saveFeedback(match, feedback) {
  const database = await connectToDatabase();
  return database.collection("feedback").insertOne({
    match,
    feedback,
    createdAt: new Date()
  });
}

module.exports = { connectToDatabase, saveAnalysis, saveFeedback };
