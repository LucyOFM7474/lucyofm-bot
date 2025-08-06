import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await client.connect();
    const db = client.db("lucyofm");
    const colectie = db.collection("analize");

    const analize = await colectie
      .find({})
      .sort({ data: -1 })
      .limit(20)
      .toArray();

    res.status(200).json(analize);
  } catch (err) {
    console.error("Eroare extragere:", err.message);
    res.status(500).json({ error: "Eroare la extragere" });
  }
}
