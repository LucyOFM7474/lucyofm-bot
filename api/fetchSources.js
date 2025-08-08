// api/fetchSources.js
// Returnează linkul corect spre SportyTrader și încearcă să extragă câteva meta-informații.
// Are fallback: dacă site-ul blochează request-ul (403/503/CORS), întoarce măcar URL-ul valid.

export default async function handler(req, res) {
  try {
    const { home = "", away = "" } = req.query;

    const slugify = (s) =>
      String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const homeSlug = slugify(home);
    const awaySlug = slugify(away);
    const formatted = [homeSlug, awaySlug].filter(Boolean).join("-");

    if (!formatted) {
      return res.status(400).json({
        ok: false,
        error: "Parametrii 'home' și 'away' sunt necesari (ex: ?home=FC Copenhaga&away=Aarhus).",
      });
    }

    const url = `https://www.sportytrader.com/ro/pronosticuri/${formatted}/`;

    // Încearcă să citească pagina (poate fi blocat de Cloudflare).
    let scraped = false;
    let meta = { title: null, h1: null, snippet: null };

    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cache-Control": "no-cache",
        },
      });

      if (resp.ok) {
        const html = await resp.text();

        // titlu (og:title sau <title>)
        const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
        const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        meta.title = (ogTitle?.[1] || titleTag?.[1] || null)?.trim() || null;

        // <h1>
        const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        meta.h1 = h1 ? stripTags(h1[1]).trim() : null;

        // mic snippet „Pronostic” dacă apare în pagină
        const pronosticBlock = html.match(/(Pronostic[^<]{0,200})/i);
        meta.snippet = pronosticBlock?.[1]?.trim() || null;

        scraped = true;
      } else {
        // resp nu e ok (403/503 etc.) -> oferim URL + motiv
        meta.snippet = `Pagina a răspuns cu status ${resp.status}. Deschide direct linkul din interfață.`;
      }
    } catch (e) {
      // Eșec la fetch din motive de rețea/Cloudflare -> oferim măcar URL-ul
      meta.snippet = "Conținutul nu poate fi preluat automat acum. Apasă butonul «Deschide SportyTrader».";
    }

    return res.status(200).json({
      ok: true,
      source: "sportytrader",
      formatted,
      url,
      scraped,
      meta,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Eroare internă",
    });
  }
}

// Helpers
function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, "");
}
