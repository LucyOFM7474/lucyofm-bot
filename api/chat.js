// api/chat.js — Node 20 implicit pe Vercel, fără runtime config
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { home = "", away = "" } = req.body || {};
  if (!home || !away) {
    return res.status(400).json({ error: "home și away sunt necesari" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY lipsă" });
  }

  const prompt = `
Analizează meciul ${home} vs ${away} în 10 puncte, cu ✅ ⚠️ 📊 🎯, stil compact, fără umplutură.
Dacă lipsesc date: scrie „Nu știu / Nu pot confirma” și oprește-te.
Fără caractere asiatice. Fundal negru (textual), text alb.
`.trim();

  try {
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok) {
      return res
        .status(aiRes.status)
        .json({ error: aiData?.error?.message || "OpenAI error" });
    }

    const content = aiData?.choices?.[0]?.message?.content || "Fără conținut.";
    return res.status(200).json({ content });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Eroare necunoscută" });
  }
}
