import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metoda nu este permisă" });
  }

  const { prompt } = req.body;
  if (!prompt?.trim()) {
    return res.status(400).json({ error: "Introdu un meci valid" });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Analizează meciul: ${prompt}. Returnează **10 puncte clare și numerotate** în limba română, folosind date reale și un ton profesional. Structura:
1. Forma ultimelor 5 meciuri fiecare echipă
2. Clasament & obiective directe
3. Absențe / accidentări cheie
4. H2H ultimele 5 directe
5. Cote case de pariuri (1X2, GG, +2.5)
6. Presiune & context (derby, cupe europene, retrogradare)
7. Jucători de urmărit
8. Stil tactici / așteptări
9. Vreme / teren (dacă afectează)
10. Predicție neutră / concluzie`,
        },
      ],
      max_tokens: 900,
      temperature: 0.7,
    });

    res.status(200).json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.error("Eroare OpenAI:", err.message);
    res.status(500).json({ error: "Eroare la procesarea cererii." });
  }
}
