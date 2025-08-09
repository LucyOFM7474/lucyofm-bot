export const config = { runtime: "nodejs20.x" };

export default async function handler(req, res) {
  try {
    const { match } = await req.body;

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Lipsă OPENAI_API_KEY în variabilele de mediu");
    }

    const sourcesRes = await fetch(`${process.env.BOT_URL}/api/fetchSources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match })
    });
    const sources = await sourcesRes.json();

    const prompt = `
    Ești GPT-5. Fă o analiză în 10 puncte cu format fix (fundal negru, text alb, ✅⚠️📊🎯), folosind DOAR informațiile de mai jos:
    ${JSON.stringify(sources)}
    `;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }]
      })
    });

    const aiData = await aiRes.json();

    res.status(200).json({
      success: true,
      analysis: aiData.choices?.[0]?.message?.content || "Nu am putut genera analiza."
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
