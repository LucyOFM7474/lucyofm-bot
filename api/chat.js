// api/chat.js — DIRECT fetch only (fără ScraperAPI), căutare + scraping + DIAGNOSTIC clar
// ENV Production: OPENAI_API_KEY
// Notă: nu mai folosim SCRAPER_API_KEY deloc (planul tău returnează 400 pentru features).

const { OpenAI } = require("openai");
const cheerio = require("cheerio");

// Rulează pe Node 22 (Vercel)
module.exports.config = { runtime: "nodejs22.x" };

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
function reqEnv(name){ const v=process.env[name]; if(!v) throw new Error(`ENV lipsă: ${name}`); return v; }

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const BASE_ALLOWED = ["sportytrader.com","predictz.com","forebet.com","windrawwin.com"];

function isAllowed(u){
  try { const h=new URL(u).hostname.replace(/^www\./,""); return BASE_ALLOWED.some(d=>h.endsWith(d)); } catch { return false; }
}
function normG(h){ return (h && h.startsWith("/url?q=")) ? decodeURIComponent(h.split("/url?q=")[1].split("&")[0]) : (h||""); }

async function getHTML(url, timeoutMs=16000){
  const controller = new AbortController(); const t=setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9,ro;q=0.8",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "upgrade-insecure-requests": "1",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none"
      },
      redirect: "follow",
      signal: controller.signal
    });
    const text = await res.text().catch(()=> "");
    if(!res.ok) throw new Error(`HTTP ${res.status}${text ? " — " + text.slice(0,200) : ""}`);
    return text;
  } finally { clearTimeout(t); }
}

function cleanText(html, maxLen=22000){
  const $ = cheerio.load(html);
  ["script","style","noscript","nav","footer","header","aside"].forEach(s=>$(s).remove());
  const parts=[];
  $("h1,h2,h3,h4,p,li,td,th").each((_,el)=>{
    const t=$(el).text().replace(/\s+/g," ").trim();
    if(t && t.length>30) parts.push(t);
  });
  let text = parts.join("\n");
  if(text.length>maxLen) text = text.slice(0,maxLen);
  return text;
}

// ---------------- CĂUTARE DIRECTĂ (fără proxy) ----------------
function ddgQuery(q){ const u=new URL("https://duckduckgo.com/html/"); u.searchParams.set("q",q); return u.toString(); }
function gglQuery(q){ const u=new URL("https://www.google.com/search"); u.searchParams.set("q",q); u.searchParams.set("hl","en"); return u.toString(); }

async function searchAllowedLinks(query){
  const take = (html) => {
    const $ = cheerio.load(html); const links = [];
    // DuckDuckGo
    $(".result__a, a.result__a").each((_,a)=>{ const href=$(a).attr("href"); if(href?.startsWith("http") && isAllowed(href)) links.push(href); });
    // fallback generic (pentru Google)
    $("a").each((_,a)=>{ const href=normG($(a).attr("href")); if(href?.startsWith("http") && isAllowed(href)) links.push(href); });
    return Array.from(new Set(links));
  };

  let found = [];
  try { found = found.concat(take(await getHTML(ddgQuery(query)))); } catch {}
  if(found.length < 4){ try { found = found.concat(take(await getHTML(gglQuery(query)))); } catch {} }
  return Array.from(new Set(found)).slice(0,6);
}

async function autoFindSources(home, away){
  const base = `${home} vs ${away} prediction`;
  const queries = [
    `site:sportytrader.com ${base}`,
    `site:forebet.com ${base}`,
    `site:windrawwin.com ${base}`,
    `site:predictz.com ${base}`,
    base
  ];
  let all = [];
  for(const q of queries){
    try{
      const part = await searchAllowedLinks(q);
      all = all.concat(part);
      if(all.length>=6) break;
    }catch{}
  }
  const prefer = (u) => { const h=new URL(u).hostname.replace(/^www\./,""); const i=BASE_ALLOWED.findIndex(d=>h.endsWith(d)); return i===-1?99:i; };
  return Array.from(new Set(all)).sort((a,b)=>prefer(a)-prefer(b)).slice(0,6);
}

// ---------------- SCRAPING DIRECT ----------------
async function scrape(url){
  try{
    const html = await getHTML(url, 18000);
    const text = cleanText(html);
    if(!text || text.length<300) return { url, ok:false, direct:true, error:"conținut insuficient (<300 chars)" };
    return { url, ok:true, direct:true, text };
  }catch(e){
    return { url, ok:false, direct:true, error:String(e?.message||e) };
  }
}

function sysPrompt(){
  return [
    "Ești botul LucyOFM – Analize meciuri.",
    "FORMAT: 10 puncte cu ✅ ⚠️ 📊 🎯. Fără caractere asiatice. Fără cuvântul «Simbol». Ton ferm, concis.",
    "Nu inventa; folosește DOAR textul extras. Dacă sursele se contrazic, marchează cu ⚠️.",
    "Început: ce spune fiecare sursă (✅ dacă ≥3 coincid). Final: 3–5 recomandări 🎯, fiecare pe linie.",
    "Dacă n-ai text din surse: «Date insuficiente din surse – analiză bazată pe model»."
  ].join("\n");
}

module.exports = async (req,res)=>{
  // CORS
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS") return res.status(200).end();
  if(req.method!=="POST") return res.status(405).json({ error:"Metoda nu este permisă" });

  const env = { hasOpenAI: !!process.env.OPENAI_API_KEY, hasScraper:false, node: process.version };

  try{
    reqEnv("OPENAI_API_KEY");

    const body = typeof req.body === "string" ? JSON.parse(req.body||"{}") : (req.body||{});
    const home = (body.home||"").trim();
    const away = (body.away||"").trim();
    let urls = Array.isArray(body.urls) ? body.urls.filter(Boolean) : [];
    if(!home || !away) return res.status(400).json({ ok:false, env, error:"Câmpurile 'home' și 'away' sunt obligatorii" });

    if(urls.length===0) urls = await autoFindSources(home, away);

    const scraped = [];
    for(const u of urls.slice(0,6)) scraped.push(await scrape(u));

    const diag = scraped.length
      ? scraped.map(s => (s.ok ? "OK  (direct) " : "FAIL (direct) ") + s.url + (s.error ? ` — ${s.error}` : "")).join("\n")
      : "(fără)";

    const srcBlock = scraped.filter(s=>s.ok && s.text)
      .map(s=>`SRC (direct): ${s.url}\n${s.text}`).join("\n\n---\n\n");

    // dacă nu avem text din surse, nu chemăm OpenAI
    if(!srcBlock){
      return res.status(200).json({
        ok:true, env, tried: urls, scraped,
        result: `# DIAGNOSTIC SCRAPING\n${diag}\n\n# ANALIZĂ\nDate insuficiente din surse – analiză bazată pe model.`
      });
    }

    const messages = [
      { role:"system", content: sysPrompt() },
      { role:"user", content: `Meci: ${home} vs ${away}\n\n# DIAGNOSTIC SCRAPING\n${diag}\n\n# TEXT EXTRAS DIN SURSE\n${srcBlock}` }
    ];

    const r = await client.chat.completions.create({ model:"gpt-4o-mini", temperature:0.2, messages });
    const text = r.choices?.[0]?.message?.content || "(fără conținut)";

    return res.status(200).json({ ok:true, env, tried: urls, scraped, result: text });
  }catch(e){
    return res.status(500).json({ ok:false, env, error:String(e?.message||e) });
  }
};
