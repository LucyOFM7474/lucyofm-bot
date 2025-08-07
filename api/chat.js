const mongoose = require('mongoose');

// Schema MongoDB
const conversationSchema = new mongoose.Schema({
  prompt: { type: String, required: true },
  response: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

// Conectare MongoDB
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI);
  } catch (error) {
    throw error;
  }
};

// Cele 10 funcții de analiză
const analyzeText = (text) => {
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const chars = text.replace(/\s/g, '');
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  // 1. Număr de caractere
  const charCount = text.length;
  
  // 2. Număr de cuvinte
  const wordCount = words.length;
  
  // 3. Număr de propoziții
  const sentenceCount = sentences.length;
  
  // 4. Cuvântul cel mai lung
  const longestWord = words.reduce((longest, current) => 
    current.length > longest.length ? current : longest, '');
  
  // 5. Cuvântul cel mai scurt
  const shortestWord = words.reduce((shortest, current) => 
    current.length < shortest.length ? current : shortest, 'a'.repeat(100));
  
  // 6. Lungime medie a cuvintelor
  const avgWordLength = wordCount > 0 
    ? (words.reduce((sum, word) => sum + word.length, 0) / wordCount).toFixed(2) 
    : 0;
  
  // 7. Top 5 cuvinte cele mai frecvente
  const wordFreq = {};
  words.forEach(word => {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  });
  const topWords = Object.entries(wordFreq)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([word, count]) => `${word}(${count})`);
  
  // 8. Număr de vocale
  const vowelCount = (text.match(/[aeiouăâîAEIOUĂÂÎ]/gi) || []).length;
  
  // 9. Număr de consoane
  const consonantCount = (text.match(/[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/gi) || []).length;
  
  // 10. Densitate lexicală (cuvinte unice / total cuvinte)
  const uniqueWords = new Set(words);
  const lexicalDensity = wordCount > 0 
    ? ((uniqueWords.size / wordCount) * 100).toFixed(2) + '%' 
    : '0%';
  
  return `📊 ANALIZĂ COMPLETĂ A TEXTULUI

📝 Text analizat: "${text}"

1️⃣ **Număr caractere**: ${charCount}
2️⃣ **Număr cuvinte**: ${wordCount}
3️⃣ **Număr propoziții**: ${sentenceCount}
4️⃣ **Cuvântul cel mai lung**: ${longestWord || '-'}
5️⃣ **Cuvântul cel mai scurt**: ${shortestWord.length < 100 ? shortestWord : '-'}
6️⃣ **Lungime medie cuvinte**: ${avgWordLength} caractere
7️⃣ **Top 5 cuvinte frecvente**: ${topWords.join(', ') || '-'}
8️⃣ **Număr vocale**: ${vowelCount}
9️⃣ **Număr consoane**: ${consonantCount}
🔟 **Densitate lexicală**: ${lexicalDensity}

⏰ Analiză generată la: ${new Date().toLocaleString('ro-RO')}`;
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodă neacceptată' });

  try {
    await connectDB();
    
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt lipsă' });

    const result = analyzeText(prompt);
    
    // Salvează în MongoDB
    await Conversation.create({ prompt, response: result });

    res.status(200).json({ result });
  } catch (error) {
    console.error('Eroare:', error);
    res.status(500).json({ error: 'Eroare server' });
  }
};
