// api/chat.js — forțează ScraperAPI pe TOATE fetch-urile + retry pe 401 + DIAGNOSTIC corect (proxy)
// ENV Production: OPENAI_API_KEY, SCRAPER_API_KEY

const { OpenAI } = require("openai");
const cheerio = require("cheerio");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function reqEnv(name){
  const v = process.env[name];
  if(!v) throw new Error(`ENV lipsă: ${name} (setează în Vercel → Settings → Environment Variables → PRODUCTION)`);
  return v;
}
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasScraper = !!process.env.SCRAPER_API_KEY;

function proxyURL(raw, { render=true, country="eu" } = {}){
  const key = reqEnv("SCRAPER_API_KEY");
  const u = new URL("https://api.scraperapi.com/");
  u.searchParams.set("api_key", key);
  u.searchParams.set("url", raw);
  u.searchParams.set("render", String(render));
  u.searchParams.set("country_code", country);
  return u.toString();
}

async function fetchViaProxy(rawUrl, { render=true, timeoutMs=20000 } = {}){
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const res = await fetch(proxyURL(rawUrl,{render}), {
      headers:{
        "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        "accept":"text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });
    return res;
  } finally { clearTimeout(t); }
}

async function getHTML(rawUrl, { render=true, timeoutMs=20000 } = {}){
  // 1) încercăm cu render=render
  let res = await fetchViaProxy(rawUrl, { render, timeoutMs });
  // 2) dacă 401/403, reîncercăm cu opus (render toggle)
  if (res && (res.status === 401 || res.status === 403)) {
    const res2 = await fetchViaProxy(rawUrl, { render: !render, timeoutMs });
    if (res2.ok) return await res2.text();
    if (res2.status !== 401 && res2.status !== 403) {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    }
    // ambele 401/403
    throw new Error(`HTTP ${res2.status}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function cleanText(html, maxLen=24000){
  const $ = cheerio.load(html);
  ["script","style","noscript","nav","footer","header","aside"].forEach(s => $(s).remove());
  const parts=[];
  $("h1,h2,h3,h4,p,li,td,th").each((_,el)=>{
    const t=$(el).text().replace(/\s+/g," ").trim();
    if(t && t.length>30) parts.push(t);
  });
  let text=parts.join("\n");
  if(text.length>maxLen) text=text.slice(0,maxLen);
  return text;
}

const norm = s => (s||"").toLowerCase().replace(/\s+/g," ").trim();

function srchURLs(home, away){
  const q = encodeURIComponent(`${home} ${away}`);
  return {
    st: `https://www.sportytrader.com/en/search/?q=${q}`,
    fb: `https://www.forebet.com/en/search?query=${q}`,
    wdw:`https://www.windrawwin.com/search/?q=${q}`,
    pz: `https://www.predictz.com/search/?q=${q}`
  };
}

async function pickFromSearch(searchURL, allowPattern){
  // TOT prin proxy (getHTML)!
  const html = await getHTML(searchURL, { render:false, timeoutMs:15000 });
  const $ = cheerio.load(html);
  const links = new Set();
  $('a[href]').each((_,a)=>{
    const href = ($(a).attr("href")||"").trim();
    if(!href) return;
    const base =
      searchURL.startsWith("https://www.sportytrader.com") ? "https://www.sportytrader.com" :
      searchURL.startsWith("https://www.forebet.com")      ? "https://www.forebet.com" :
      searchURL.startsWith("https://www.windrawwin.com")   ? "https://www.windrawwin.com" :
      searchURL.startsWith("https://www.predictz.com")     ? "https://www.predictz.com" : "";
    const url = href.startsWith("http") ? href : (base ? base + href : href);
    if(allowPattern.test(url)) links.add(url);
  });
  return Array.from(links).slice(0,2);
}

async function autoFindSources(home, away){
  const h = norm(home), a = norm(away);
  const U = srchURLs(h,a);

  const [st, fb, wdw, pz] = await Promise.all([
    pickFromSearch(U.st,  /sportytrader\.com\/en\/(betting-tips|predictions|match)/i).catch(()=>[]),
    pickFromSearch(U.fb,  /forebet\.com\/en\/(football-tips|predictions|matches|match)/i).catch(()=>[]),
    pickFromSearch(U.wdw, /windrawwin\.com\/(matches|tips|vs|fixtures|predictions)/i).catch(()=>[]),
    pickFromSearch(U.pz,  /predictz\.com\/(predictions|tips|soccer|matches)/i).catch(()=>[])
  ]);

  let urls = Array.from(new Set([...st, ...fb, ...wdw, ...pz].filter(Boolean)));

  // FALLBACK: dacă nu găsim linkuri, folosim chiar paginile de căutare ca surse
  if (urls.length === 0) {
    urls = [U.st, U.fb, U.wdw, U.pz];
  }
  return urls.slice(0,6);
}

async function scrape(url){
  try{
    const html = await getHTML(url, { render:true, timeoutMs:22000 }); // proxy enforced
    const text = cleanText(html);
    if(!text || text.length<300) return { url, ok:false, proxied:true, error:"conținut insuficient (<300 chars)" };
    return { url, ok:true, proxied:true, text };
  }catch(e){
    return { url, ok:false, proxied:true, error:String(e?.message||e) };
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

  const env = { hasOpenAI, hasScraper, node: process.version };

  try{
    reqEnv("OPENAI_API_KEY");
    reqEnv("SCRAPER_API_KEY");

    const body = typeof req.body==="string" ? JSON.parse(req.body||"{}") : (req.body||{});
    const home = (body.home||"").trim();
    const away = (body.away||"").trim();
    let urls = Array.isArray(body.urls) ? body.urls.filter(Boolean) : [];
    if(!home || !away) return res.status(400).json({ ok:false, env, error:"Câmpurile 'home' și 'away' sunt obligatorii" });

    if(urls.length===0) urls = await autoFindSources(home, away);

    const scraped=[];
    for(const u of urls.slice(0,6)) scraped.push(await scrape(u));

    // dacă toate au FAIL → încearcă din nou fără render (tot prin proxy)
    if(scraped.every(s=>!s.ok)){
      const retried=[];
      for(const u of urls.slice(0,6)){
        try{
          const html = await getHTML(u, { render:false, timeoutMs:14000 });
          const text = cleanText(html);
          if(text && text.length>=300) retried.push({ url:u, ok:true, proxied:true, text });
          else retried.push({ url:u, ok:false, proxied:true, error:"conținut insuficient (<300 chars)"});
        }catch(e){
          retried.push({ url:u, ok:false, proxied:true, error:String(e?.message||e) });
        }
      }
      scraped.splice(0, scraped.length, ...retried);
    }

    const diagText = scraped.length
      ? scraped.map(s => (s.ok ? "OK  (proxy) " : "FAIL (proxy) ") + s.url + (s.error ? ` — ${s.error}` : "")).join("\n")
      : "(fără)";

    const srcBlock = scraped.filter(s=>s.ok && s.text)
      .map(s=>`SRC (proxy): ${s.url}\n${s.text}`).join("\n\n---\n\n");

    const messages = [
      { role:"system", content: sysPrompt() },
      { role:"user", content:
        `Meci: ${home} vs ${away}\n\n# DIAGNOSTIC SCRAPING\n${diagText}\n\n# TEXT EXTRAS DIN SURSE\n${srcBlock || "(niciun text disponibil)"}`
      }
    ];

    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages
    });

    const text = r.choices?.[0]?.message?.content || "(fără conținut)";
    return res.status(200).json({ ok:true, env, tried: urls, scraped, result: text });
  }catch(e){
    return res.status(500).json({ ok:false, env, error:String(e?.message||e) });
  }
};
