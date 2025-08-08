// api/fetchSources.js
// Returnează linkuri către paginile relevante (fără scraping).

export const config = { runtime: "nodejs20.x" };

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function handler(req, res) {
  try {
    const { home = "", away = "" } = req.query || {};
    const H = slugify(home), A = slugify(away);
    if (!H || !A) return res.status(400).json({ error: "Parametrii 'home' și 'away' sunt necesari." });

    const formatted = `${H}-${A}`;
    const sportytrader = `https://www.sportytrader.com/ro/pronosticuri/${formatted}/`;
    const forebet      = `https://www.forebet.com/en/football-predictions/${H}-${A}`;
    const predictz     = `https://www.predictz.com/predictions/${H}-${A}/`;

    return res.status(200).json({
      ok: true,
      formatted,
      urls: { sportytrader, forebet, predictz }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Eroare internă" });
  }
}
