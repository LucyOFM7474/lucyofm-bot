import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  const { messages } = await req.json();

  const systemPrompt = {
    role: "system",
    content: `
Ești LucyOFM7474 – un expert în analiză fotbalistică. Răspunzi întotdeauna în formatul fix cu 10 puncte, clar și profesionist:
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

Nu părăsi niciodată acest format. Folosește un ton profesionist, direct, compact.
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
