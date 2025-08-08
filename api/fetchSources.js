// api/fetchSources.js
// Colectează semnale din 3 surse publice + fallback-uri.
// NOTĂ: scraping „light” pe text, cu User-Agent; dacă o sursă blochează,
// endpoint-ul NU cade — întoarce doar ce a reușit să extragă.

export const config = { runtime: "edge" };

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function headersUA() {
  return {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  };
}

function parseSignalsFromText(txt) {
  const t = (txt || "").toLowerCase();

  // 1X2:
  let oneXtwo = null;
  if (/(?:\b| )(1x)(?:\b| )/.test(t)) oneXtwo = "1X";
  if (/(?:\b| )(x2)(?:\b| )/.test(t)) oneXtwo = oneXtwo || "X2";
  if (/(?:\b| )(12)(?:\b| )/.test(t)) oneXtwo = oneXtwo || "12";
  if (/victorie\s+gazd|home\s+win/.test(t)) oneXtwo = oneXtwo || "1";
  if (/victorie\s+oaspe|away\s+win/.test(t)) oneXtwo = oneXtwo || "2";
  if (/\bdraw\b|egal/.test(t)) oneXtwo = oneXtwo || "X";

  // BTTS/GG:
  let btts = null;
  if (/btts|gg|ambele\s+echipe\s+marcheaz/.test(t)) btts = "GG";
  if (/no\s*btts|nu\s*marcheaz|ambele.*nu/.test(t)) btts = btts || "NG";

  // Over/Under 2.5:
  let ou25 = null;
  if (/over\s*2\.?5|peste\s*2\.?5/.test(t)) ou25 = "Over 2.5";
  if (/under\s*2\.?5|sub\s*2\.?5/.test(t)) ou25 = ou25 || "Under 2.5";

  // Cornere / Galbene (doar semnal de existență + număr dacă e găsit în text)
  let corners = null;
  let mCorners = t.match(/cornere|corners/);
  if (mCorners) {
    const num = t.match(/(?:cornere|corners)[^\d]{0,12}(\d{1,2}\.?\d?)/);
    corners = num ? `Mediu ~ ${num[1]}` : "Menționate";
  }

  let cards = null;
  let mCards = t.match(/galben|yellow\s*cards/);
  if (mCards) {
    const num = t.match(/(?:galben|yellow\s*cards?)[^\d]{0,12}(\d{1,2}\.?\d?)/);
    cards = num ? `Mediu ~ ${num[1]}` : "Menționate";
  }

  return { "1X2": oneXtwo, BTTS: btts, OU25: ou25, corners, cards };
}

async function safeFetch(url) {
  try {
    // Încercare directă
    let r = await fetch(url, headersUA());
    if (!r.ok) throw new Error("status " + r.status);
    let txt = await r.text();
    // Dacă pagina e protejată, încearcă prin r.jina.ai (render text-only)
    if (/__cf_chl_captcha|cloudflare|attention required/i.test(txt)) {
      const proxy = "https://r.jina.ai/http/" + url.replace(/^https?:\/\//, "");
      r = await fetch(proxy, headersUA());
      if (!r.ok) throw new Error("proxy status " + r.status);
      txt = await r.text();
    }
    return txt;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, ctx) {
  try {
    const { searchParams } = new URL(req.url);
    const home = searchParams.get("home") || "";
    const away = searchParams.get("away") || "";
    const formatted = [slugify(home), slugify(away)].filter(Boolean).join("-");

    if (!formatted) {
      return new Response(
        JSON.stringify({ ok: false, error: "Parametrii 'home' și 'away' sunt necesari." }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // URL-uri surse
    const urls = {
      sportytrader: `https://www.sportytrader.com/ro/pronosticuri/${formatted}/`,
      forebet: `https://r.jina.ai/http/www.forebet.com/en/football-predictions/${formatted}`,
      predictz: `https://r.jina.ai/http/www.predictz.com/predictions/${formatted}/`,
    };

    // Fetch în paralel
    const [stTxt, fbTxt, pzTxt] = await Promise.all([
      safeFetch(urls.sportytrader),
      safeFetch(urls.forebet),
      safeFetch(urls.predictz),
    ]);

    const sources = {
      sportytrader: {
        url: urls.sportytrader,
        ok: !!stTxt,
        picks: stTxt ? parseSignalsFromText(stTxt) : {},
      },
      forebet: {
        url: urls.forebet.replace("https://r.jina.ai/http/", "https://"),
        ok: !!fbTxt,
        picks: fbTxt ? parseSignalsFromText(fbTxt) : {},
      },
      predictz: {
        url: urls.predictz.replace("https://r.jina.ai/http/", "https://"),
        ok: !!pzTxt,
        picks: pzTxt ? parseSignalsFromText(pzTxt) : {},
      },
    };

    return new Response(
      JSON.stringify({ ok: true, formatted, sources }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Eroare" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
