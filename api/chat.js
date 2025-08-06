import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send({ message: 'Method not allowed' });
  }

  const { message } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Ești un expert în fotbal. Răspunde analizând fiecare meci în 10 puncte după structura standard:
1. Surse & Predicții (✅⚠️❌)
2. Medie ponderată
3. Impact pe pronostic
4. Formă recentă
5. Absențe
6. Golgheteri
7. Statistici (posesie, cornere, cartonașe)
8. H2H
9. Alte date
10. Predicție finală și scor estimat.`
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    const reply = completion.choices[0].message.content;
    res.status(200).json({ reply });
  } catch (error) {
    console.error("EROARE GPT:", error);
    res.status(500).json({ reply: "A apărut o eroare la procesarea răspunsului." });
  }
}
