import mongoose from "mongoose";

// Schema MongoDB
const conversationSchema = new mongoose.Schema({
  prompt: { type: String, required: true },
  response: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const Conversation =
  mongoose.models.Conversation ||
  mongoose.model("Conversation", conversationSchema);

// Conectare MongoDB
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI);
  } catch (error) {
    throw error;
  }
};

// Funcția de analiză text
const analyzeText = (text) => {
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const chars = text.replace(/\s/g, "");
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  const charCount = text.length;
  const wordCount = words.length;
  const sentenceCount = sentences.length;

  const longestWord = words.reduce((longest, current) =>
    current.length > longest.length ? current : longest,
    ""
  );

  const shortestWord = words.reduce((shortest, current) =>
    current.length < shortest.length ? current : shortest,
    "a".repeat(100)
  );

  const avgWordLength =
    wordCount > 0
      ? (
          words.reduce((sum, word) => sum + word.length, 0) / wordCount
        ).toFixed(2)
      : 0;

  const wordFreq = {};
  words.forEach((word) => {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  });

  const topWords = Object.entries(wordFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([word, count]) => `${word} (${count})`);

  const vowelCount = (text.match(/[aeiouăîâAEIOUĂÎÂ]/gi) || []).length;
  const consonantCount = (
    text.match(/[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/gi) || []
  ).length;

  const uniqueWords = new Set(words);
  const lexicalDensity =
    wordCount > 0
      ? ((uniqueWords.size / wordCount) * 100).toFixed(2) + "%"
      : "0%";

  return `📊 ANALIZĂ COMPLETĂ A TEXTULUI

📝 Text analizat: "${text}"

🔹 **Număr caractere**: ${charCount}
🔹 **Număr cuvinte**: ${wordCount}
🔹 **Număr propoziții**: ${sentenceCount || "-"}
🔹 **Cuvântul cel mai lung**: ${longestWord}
🔹 **Cuvântul cel mai scurt**: ${
    shortestWord.length < 100 ? shortestWord : "-"
  }
🔹 **Lungime medie cuvinte**: ${avgWordLength} caractere
🔹 **Top 5 cuvinte frecvente**: ${topWords.join(", ") || "-"}
🔹 **Număr vocale**: ${vowelCount}
🔹 **Număr consoane**: ${consonantCount}
🔹 **Densitate lexico-semantică**: ${lexicalDensity}

🕐 Analiză generată la: ${new Date().toLocaleString("ro-RO")}`;
};

// ✅ FUNCȚIA FINALĂ EXPORTATĂ CORECT
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Metodă neacceptată" });

  try {
    await connectDB();

    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt lipsă" });

    const result = analyzeText(prompt);

    await Conversation.create({ prompt, response: result });

    res.status(200).json({ result });
  } catch (error) {
    console.error("Eroare:", error);
    res.status(500).json({ error: "Eroare server" });
  }
}
