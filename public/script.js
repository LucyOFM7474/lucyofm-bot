// public/script.js
(function () {
  const $ = (sel) => document.querySelector(sel);

  const input = $("#matchInput");
  const btn = $("#generateBtn");
  const resultBox = $("#resultBox");
  const sourcesBar = $("#sourcesBar");
  const status = $("#status");
  const fbGood = $("#fbGood");
  const fbBad  = $("#fbBad");

  const API_BASE = ""; // același domeniu (Vercel)

  function setLoading(on){
    if(btn){
      btn.disabled = !!on;
      btn.textContent = on ? "Se generează..." : "Generează analiza";
    }
    if(on) setStatus("Se pregătesc sursele...");
  }

  function setStatus(msg){
    if(status) status.textContent = msg || "";
  }

  function htmlEscape(s){
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  // suportă -, – și —
  function parseMatch(text){
    if(!text) return {home:"", away:""};
    const parts = String(text).split(/\s*[-–—]\s*/g).map(s=>s.trim()).filter(Boolean);
    if(parts.length < 2) return {home:"", away:""};
    return { home: parts[0], away: parts.slice(1).join(" - ") };
  }

  async function fetchSportyLink(home, away){
    const url = `${API_BASE}/api/fetchSources?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`;
    const r = await fetch(url);
    const data = await r.json().catch(()=>null);
    if(!r.ok) throw new Error(data?.error || `fetchSources ${r.status}`);
    return data; // { ok, url, formatted, source }
  }

  function renderSourcesBar(obj){
    if(!sourcesBar) return;
    sourcesBar.innerHTML = "";
    if(obj?.url){
      const a = document.createElement("a");
      a.href = obj.url; a.target = "_blank"; a.rel = "noopener";
      a.className = "btn btn-secondary";
      a.textContent = "Deschide SportyTrader";
      sourcesBar.appendChild(a);
    }
  }

  function renderResult(text){
    resultBox.innerHTML = `<pre class="result-pre">${htmlEscape(text)}</pre>`;
  }

  function normalizeAnalysisPayload(data){
    // Acoperă toate cazurile văzute în pozele tale
    if(!data) return "";
    if(typeof data === "string") return data;
    // preferă câmpuri textuale cunoscute
    return data.content || data.text || data.result || data.message || JSON.stringify(data, null, 2);
  }

  async function runAnalysis(){
    try{
      const raw = input?.value || "";
      const {home, away} = parseMatch(raw);

      if(!home || !away){
        setStatus("Status: Scrie meciul corect. Exemplu: „Korona Kielce – Radomiak”.");
        return;
      }

      setLoading(true);

      // 1) Link SportyTrader (nu blocăm analiza dacă pică)
      let sporty=null;
      try{
        sporty = await fetchSportyLink(home, away);
        renderSourcesBar(sporty);
      }catch(e){
        console.warn("SportyTrader link error:", e?.message || e);
        renderSourcesBar(null);
      }

      setStatus("Generez analiza în 10 puncte...");

      // 2) Apelul principal la /api/chat (trecem sursa ca indiciu)
      const body = { home, away, query:`${home} - ${away}`, sources:{ sportytrader: sporty?.url || null } };

      const r = await fetch(`${API_BASE}/api/chat`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(body)
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

  // Feedback (opțional – dacă nu ai endpoint, nu fac nimic critic)
  async function sendFeedback(type){
    setStatus("Mulțumim pentru feedback.");
    try{
      await fetch(`${API_BASE}/api/feedback`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ type, ts: Date.now() })
      }).catch(()=>{});
    }catch(_){}
  }

  // Hooks
  btn?.addEventListener("click", runAnalysis);
  input?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") runAnalysis(); });
  fbGood?.addEventListener("click", ()=>sendFeedback("good"));
  fbBad ?.addEventListener("click", ()=>sendFeedback("bad"));
})();
