import { OpenAI } from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const systemPrompt = `
Ești **LucyOFM Bot**, analist sportiv premium.  
Returnează **10 puncte clare și numerotate** pentru fiecare meci, în **limba română**, cu **simboluri vizuale**:

✅   consens surse  
⚠️   atenție / dezbatere  
📊   statistică cheie  
🎯   pariu recomandat  
📉   risc / contraindicație  

Structura fixă:
1. Cote & predicții externe live (SportyTrader, PredictZ, WinDrawWin, Forebet, SportsGambler)  
2. H2H ultimele 5 directe  
3. Forma gazdelor (acasă)  
4. Forma oaspeților (deplasare)  
5. Clasament & motivație  
6. GG & BTTS – procente recente  
7. Cornere, posesie, galbene – medii  
8. Jucători-cheie / absențe / lot actual  
9. Predicție scor exact + raționament  
10. Recomandări pariuri (✅ solist, 💰 valoare, 🎯 surpriză, ⚽ goluri, 🚩 cornere)

Folosește culori (verde, galben, roșu) în text și emoji-uri pentru claritate.
`;

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
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_tokens: 900,
      temperature: 0.65,
    });
    res.status(200).json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.error("Eroare OpenAI:", err.message);
    res.status(500).json({ error: "Eroare la procesarea cererii." });
  }
}
