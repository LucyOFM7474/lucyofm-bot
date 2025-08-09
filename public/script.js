// public/script.js — UI complet funcțional (surse + analiză)

function $(id){return document.getElementById(id)}

const els={
  form:$("matchForm"),
  home:$("homeTeam"),
  away:$("awayTeam"),
  urlSporty:$("urlSportyTrader"),
  urlForebet:$("urlForebet"),
  urlPredictz:$("urlPredictZ"),
  btnFetch:$("btnFetchSources"),
  btnGen:$("btnGenerate"),
  linkSporty:$("linkSportyTrader"),
  linkForebet:$("linkForebet"),
  linkPredictz:$("linkPredictZ"),
  sourcesBox:$("sourcesBox"),
  resultBox:$("resultBox"),
};

function setHref(a,href){ if(!a||!href) return; a.href=href; a.target="_blank"; a.rel="noopener"; }
function setBusy(el,b){ if(!el) return; el.disabled=b; el.textContent=b? (el===els.btnFetch?"Încarc sursele…":"Generez…") : (el===els.btnFetch?"Citește sursele":"Generează analiza"); }

async function api(path, body){
  const res = await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body||{})});
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function renderSources(s,links){
  const lines=[];
  if(s?.sportytrader){lines.push(`✅ SportyTrader — ${s.sportytrader.prediction||"Date indisponibile"}`);} else {lines.push(`⚠️ SportyTrader — Date indisponibile`);}
  if(s?.forebet){lines.push(`📊 Forebet — ${s.forebet.prediction||"Date indisponibile"}`);} else {lines.push(`⚠️ Forebet — Date indisponibile`);}
  if(s?.predictz){lines.push(`📊 PredictZ — ${s.predictz.prediction||"Date indisponibile"}`);} else {lines.push(`⚠️ PredictZ — Date indisponibile`);}
  els.sourcesBox.textContent = lines.join("\n");

  setHref(els.linkSporty, links?.sportytrader);
  setHref(els.linkForebet, links?.forebet);
  setHref(els.linkPredictz, links?.predictz);
}

async function readSources(){
  const home=(els.home.value||"").trim();
  const away=(els.away.value||"").trim();
  if(!home||!away){ alert("Completează Gazdă și Oaspeți."); return; }

  const urls={};
  if(els.urlSporty.value) urls.sportytrader=els.urlSporty.value.trim();
  if(els.urlForebet.value) urls.forebet=els.urlForebet.value.trim();
  if(els.urlPredictz.value) urls.predictz=els.urlPredictz.value.trim();

  try{
    setBusy(els.btnFetch,true);
    const data=await api("/api/fetchSources",{homeTeam:home,awayTeam:away,urls});
    renderSources(data?.sources, data?.links);
  }catch(e){
    console.error(e);
    alert("Nu am putut citi sursele. Încearcă din nou.");
  }finally{ setBusy(els.btnFetch,false); }
}

async function generateAnalysis(){
  const home=(els.home.value||"").trim();
  const away=(els.away.value||"").trim();
  if(!home||!away){ alert("Completează Gazdă și Oaspeți."); return; }

  const urls={};
  if(els.urlSporty.value) urls.sportytrader=els.urlSporty.value.trim();
  if(els.urlForebet.value) urls.forebet=els.urlForebet.value.trim();
  if(els.urlPredictz.value) urls.predictz=els.urlPredictz.value.trim();

  try{
    setBusy(els.btnGen,true);
    const data=await api("/api/chat",{homeTeam:home,awayTeam:away,urls});
    if(!data?.ok) throw new Error(data?.error||"Eșec API");
    // afișează ANALIZA exact în formatul GPT-5 (text alb, simboluri)
    els.resultBox.textContent = data.analysis || "Date indisponibile";
    // actualizează și linkurile dacă au venit
    renderSources(data?.sources, data?.links);
  }catch(e){
    console.error(e);
    els.resultBox.textContent = "Eroare la generare. Verifică cheile și încearcă din nou.";
  }finally{ setBusy(els.btnGen,false); }
}

els.form?.addEventListener("submit",(e)=>{ e.preventDefault(); readSources(); });
els.btnFetch?.addEventListener("click",(e)=>{ e.preventDefault(); readSources(); });
els.btnGen?.addEventListener("click",(e)=>{ e.preventDefault(); generateAnalysis(); });
