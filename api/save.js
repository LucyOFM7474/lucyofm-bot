import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { meci, rezultat } = req.body;
  if (!meci || !rezultat) {
    return res.status(400).json({ error: "Date lipsă" });
  }

  try {
    await client.connect();
    const db = client.db("lucyofm");
    const colectie = db.collection("analize");

    await colectie.insertOne({
      meci,
      rezultat,
      data: new Date().toISOString()
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Eroare salvare:", err.message);
    res.status(500).json({ error: "Eroare la salvare" });
  }
}
