import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    await client.connect();
    const db = client.db('lucyofm-bot');
    const collection = db.collection('messages');

    await collection.insertOne({
      message,
      timestamp: new Date(),
    });

    res.status(200).json({ response: `Am salvat mesajul: "${message}" în MongoDB.` });
  } catch (error) {
    res.status(500).json({ error: 'MongoDB error', details: error.message });
  } finally {
    await client.close();
  }
}
