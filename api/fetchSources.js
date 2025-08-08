// api/fetchSources.js

export default async function handler(req, res) {
  try {
    const { home = "", away = "" } = req.query;

    // Funcție pentru a crea slug-uri corecte pentru SportyTrader
    const slugify = (s) =>
      String(s)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // elimină diacritice
        .replace(/[^a-z0-9]+/g, "-") // înlocuiește caracterele non-alfanumerice cu "-"
        .replace(/^-+|-+$/g, ""); // elimină "-" la început și sfârșit

    // Combină echipele într-un singur slug
    const formatted = [slugify(home), slugify(away)].filter(Boolean).join("-");

    if (!formatted) {
      return res.status(400).json({
        error: "Parametrii 'home' și 'away' sunt necesari.",
      });
    }

    // ✅ Link corect către pagina SportyTrader
    const url = `https://www.sportytrader.com/ro/pronosticuri/${formatted}/`;

    // Returnează linkul fără să facă scraping (pentru a-l folosi direct în front-end)
    return res.status(200).json({
      ok: true,
      url,
      formatted,
      source: "sportytrader",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Eroare internă server",
    });
  }
}
