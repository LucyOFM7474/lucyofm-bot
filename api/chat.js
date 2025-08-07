import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
  prompt: { type: String, required: true },
  response: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const Conversation = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(process.env.MONGODB_URI);
};

const analyzeText = (text) => {
  return `✅ Text primit: "${text}"\n\n🔢 Număr caractere: ${text.length}\n🕒 ${new Date().toLocaleString("ro-RO")}`;
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodă neacceptată" });

  try {
    await connectDB();
    const { prompt } = req.body;
    if (!prompt || prompt.trim() === "")
      return res.status(400).json({ error: "Prompt lipsă" });

    const result = analyzeText(prompt);
    await Conversation.create({ prompt, response: result });
    res.status(200).json({ result });
  } catch (error) {
    console.error("Eroare server:", error);
    res.status(500).json({ error: "Eroare internă server" });
  }
}
