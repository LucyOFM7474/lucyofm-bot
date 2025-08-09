// public/script.js — un singur câmp + un singur buton.
// Face totul într-un pas: parsează inputul, citește sursele, apoi cere analiza.

function $(id){return document.getElementById(id)}
const qEl = $("query");
const btn = $("btnGenerate");
const out = $("resultBox");

function setBusy(b){
  btn.disabled = b;
  btn.textContent = b ? "Generez…" : "Generează analiza";
}

// Împarte "Gazdă – Oaspeți" / "Gazdă - Oaspeți" / "Gazdă vs Oaspeți"
function splitTeams(text){
  const s = (text||"").trim();
  const sep = /\s*(?:-|–|—|vs|VS)\s*/;
  const parts = s.split(sep).map(x=>x.trim()).filter(Boolean);
  if (parts.length >= 2) return { homeTeam: parts[0], awayTeam: parts[1] };
  return null;
}

async function post(path, body){
  const res = await fetch(path, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body||{}) });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function generate(){
  const raw = (qEl.value||"").trim();
  if(!raw){ alert("Scrie meciul sau lipește URL-ul."); return; }

  // 1) Dacă e URL SportyTrader, îl trimitem ca atare; altfel parsează echipele
  const urls = {};
  let homeTeam = "", awayTeam = "";

  if (/^https?:\/\//i.test(raw) && /sportytrader\.com/i.test(raw)) {
    urls.sportytrader = raw;
    out.textContent = "Citesc pagina SportyTrader…";
    // În lipsa numelor, trecem ceva generic; /api/fetchSources le poate deduce din titlu
    homeTeam = "Gazda";
    awayTeam = "Oaspeții";
  } else {
    const pair = splitTeams(raw);
    if (!pair) { alert("Format invalid. Exemplu: Oxford – Portsmouth"); return; }
    homeTeam = pair.homeTeam;
    awayTeam = pair.awayTeam;
  }

  try{
    setBusy(true);
    out.textContent = "Citesc sursele și generez analiza…";

    // 2) Cerem analiza direct (chat.js va apela fetchSources și va insera textual predicțiile în punctul 1)
    const data = await post("/api/chat", { homeTeam, awayTeam, urls });

    if (!data?.ok) throw new Error(data?.error || "Eșec API");
    out.textContent = data.analysis || "Date indisponibile";
  }catch(e){
    console.error(e);
    out.textContent = "Eroare la generare. Verifică cheile și încearcă din nou.";
  }finally{
    setBusy(false);
  }
}

btn?.addEventListener("click", (e)=>{ e.preventDefault(); generate(); });
qEl?.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ e.preventDefault(); generate(); }});
