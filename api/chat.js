import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { message } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Ești un expert în fotbal. Analizează fiecare meci în exact 10 puncte, după această structură fixă:
1. Surse & Predicții (✅⚠️❌)
2. Medie ponderată
3. Impact pe pronostic
4. Formă recentă
5. Absențe
6. Golgheteri
7. Statistici (posesie, cornere, cartonașe)
8. H2H (meciuri directe)
9. Alte date relevante
10. Predicție finală + scor estimat.

Răspunsurile trebuie să fie clare, concise, numerotate de la 1 la 10, fiecare punct pe rând.`
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
    console.error("Eroare API GPT:", error);
    res.status(500).json({ reply: "A apărut o eroare la generarea analizei." });
  }
}
