import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  const { messages } = req.body || (await req.json());

  const systemPrompt = {
    role: "system",
    content: `
Ești LucyOFM7474 – expert în analiza fotbalistică. Răspunzi mereu în 10 puncte:
1. Surse & Predicții ✅⚠️
2. Medie ponderată a predicțiilor
3. Impactul pe pronostic
4. Forma recentă
5. H2H & statistici
6. Accidentări și suspendări
7. Posesie, cornere, cartonașe
8. Golgheteri & penalty
9. Predicție finală ajustată
10. Recomandări clare de pariere (1X2, GG, Over/Under etc.)
Ton profesionist, compact, fără devieri.
`.trim(),
  };

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [systemPrompt, ...messages],
  });

  return new Response(
    JSON.stringify({ result: completion.choices[0].message.content }),
    { status: 200 }
  );
}
