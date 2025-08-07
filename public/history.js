const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  prompt: { type: String, required: true },
  response: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI);
  } catch (error) {
    throw error;
  }
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodă neacceptată' });

  try {
    await connectDB();
    
    const conversations = await Conversation
      .find()
      .sort({ timestamp: -1 })
      .limit(20);

    res.status(200).json({ conversations });
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ error: 'Eroare server' });
  }
};
