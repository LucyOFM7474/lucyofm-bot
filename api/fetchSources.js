// api/fetchSources.js — construiește link-urile către surse (fără scraping)

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
    return res.status(200).json({
      ok: true,
      formatted,
      urls: {
        sportytrader: `https://www.sportytrader.com/ro/pronosticuri/${formatted}/`,
        forebet: `https://www.forebet.com/en/football-predictions/${H}-${A}`,
        predictz: `https://www.predictz.com/predictions/${H}-${A}/`
      }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Eroare internă" });
  }
}
