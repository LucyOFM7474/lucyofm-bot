// public/script.js — UI + apeluri API
(function () {
  const $ = (sel) => document.querySelector(sel);

  const input = $("#matchInput");
  const btn = $("#generateBtn");
  const resultBox = $("#resultBox");
  const sourcesBar = $("#sourcesBar");
  const status = $("#status");
  const fbGood = $("#fbGood");
  const fbBad  = $("#fbBad");

  function setLoading(on){
    if(btn){ btn.disabled = !!on; btn.textContent = on ? "Se generează..." : "Generează analiza"; }
    if(on) setStatus("Se pregătesc sursele...");
  }
  function setStatus(msg){ if(status) status.textContent = msg || ""; }
  function htmlEscape(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  // suportă -, – și —
  function parseMatch(text){
    if(!text) return {home:"", away:""};
    const parts = String(text).split(/\s*[-–—]\s*/g).map(s=>s.trim()).filter(Boolean);
    if(parts.length < 2) return {home:"", away:""};
    return { home: parts[0], away: parts.slice(1).join(" - ") };
  }

  async function fetchSourceLinks(home, away){
    const r = await fetch(`/api/fetchSources?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`);
    const data = await r.json().catch(()=>null);
    if(!r.ok) throw new Error(data?.error || `fetchSources ${r.status}`);
    return data?.urls || {};
  }

  function renderSourcesBar(urls){
    if(!sourcesBar) return;
    sourcesBar.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.display = "flex"; wrap.style.gap = "8px"; wrap.style.flexWrap = "wrap";

    const add = (label, url) => {
      if(!url) return;
      const a = document.createElement("a");
      a.href = url; a.target="_blank"; a.rel="noopener";
      a.className = "btn btn-secondary"; a.textContent = label;
      wrap.appendChild(a);
    };

    add("Deschide SportyTrader", urls.sportytrader);
    add("Deschide Forebet", urls.forebet);
    add("Deschide PredictZ", urls.predictz);

    sourcesBar.appendChild(wrap);
  }

  function renderResult(text){ resultBox.innerHTML = `<pre class="result-pre">${htmlEscape(text)}</pre>`; }
  function normalizeAnalysisPayload(d){ if(!d) return ""; if(typeof d==="string") return d; return d.content || d.text || d.result || d.message || JSON.stringify(d,null,2); }

  async function runAnalysis(){
    try{
      const raw = input?.value || "";
      const {home, away} = parseMatch(raw);
      if(!home || !away){ setStatus("Status: Scrie meciul corect. Exemplu: „Korona Kielce – Radomiak”."); return; }

      setLoading(true);

      let links = {};
      try{ links = await fetchSourceLinks(home, away); renderSourcesBar(links); }
      catch(e){ console.warn("Links error:", e?.message || e); renderSourcesBar({}); }

      setStatus("Generez analiza în 10 puncte...");

      const r = await fetch(`/api/chat`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ home, away, sources: links })
      });
      const data = await r.json().catch(()=>null);
      if(!r.ok) throw new Error(data?.error || `Chat API ${r.status}`);

      const text = normalizeAnalysisPayload(data);
      renderResult(text);
      setStatus("Analiza generată.");
    }catch(err){
      console.error(err);
      renderResult("Eroare: " + (err?.message || "necunoscută"));
      setStatus("A apărut o eroare. Reîncearcă.");
    }finally{
      setLoading(false);
    }
  }

  async function sendFeedback(type){
    setStatus("Mulțumim pentru feedback.");
    try{
      await fetch(`/api/feedback`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ type, ts: Date.now() })
      }).catch(()=>{});
    }catch(_){}
  }

  btn?.addEventListener("click", runAnalysis);
  input?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") runAnalysis(); });
  fbGood?.addEventListener("click", ()=>sendFeedback("good"));
  fbBad ?.addEventListener("click", ()=>sendFeedback("bad"));
})();
