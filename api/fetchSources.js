// Runtime Node 18 pentru Vercel
export const config = { runtime: "nodejs18.x" };

/**
 * API: GET /api/fetchSources?match=Rapid%20-%20FCSB
 * Răspuns: { sportytrader, forebet, predictz }
 *
 * Nu face scraping. Doar construiește linkuri directe către paginile de predicții.
 */

function allowCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function slugify(ro) {
  if (!ro) return "";
  const s = String(ro)
    .toLowerCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, "-")
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/ș/g, "s")
    .replace(/ţ/g, "t")
    .replace(/ț/g, "t")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/\-+/g, "-")
    .replace(/^\-|\-$/g, "");
  return s;
}

export default async function handler(req, res) {
  try {
    allowCors(res);

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed. Use GET." });
    }

    const match = String(req.query?.match || "").trim();
    if (!match) {
      return res.status(400).json({ error: "Parametrul 'match' este obligatoriu (ex: Rapid – FCSB)." });
    }

    const formatted = slugify(match);

    const links = {
      sportytrader: `https://www.sportytrader.com/ro/pronosticuri/${formatted}/`,
      forebet: `https://www.forebet.com/ro/predictii-pentru-${formatted}`,
      predictz: `https://www.predictz.com/predictions/${formatted}/`
    };

    return res.status(200).json(links);
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err || "Eroare necunoscută") });
  }
}
