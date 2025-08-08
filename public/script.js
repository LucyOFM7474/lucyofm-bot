<script>
(() => {
  const $ = (sel) => document.querySelector(sel);

  function setText(el, html){ if(el) el.innerHTML = html; }
  function sanitize(s){ return String(s||"").replace(/\r/g,"").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim(); }
  function makeEl(tag, attrs={}, text=""){ const el=document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if(k==="class") el.className=v;
      else if(k.startsWith("on") && typeof v==="function") el.addEventListener(k.slice(2),v);
      else if(v!=null) el.setAttribute(k,v);
    }); if(text) el.textContent=text; return el; }

  const input = $("#matchInput");
  const genBtn = $("#generateBtn");
  const resultBox = $("#result");
  const srcBtnsWrap = $("#sourceButtons");
  const srcSummaryWrap = $("#sourceSummary");

  function loading(on=true){
    if(!genBtn) return; genBtn.disabled=!!on;
    genBtn.textContent = on ? "Se generează..." : "Generează analiza";
  }
  function toast(msg,type="info"){
    const box=makeEl("div",{class:`fixed-toast ${type}`},msg);
    document.body.appendChild(box); setTimeout(()=>box.remove(),3000);
  }

  // =============== API ===============
  async function requestAnalysis(match){
    const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({match})});
    if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error(e?.error||`Eroare ${res.status}`); }
    return res.json();
  }

  // =============== Render ===============
  function renderOpenButtons(sources){
    if(!srcBtnsWrap) return; srcBtnsWrap.innerHTML="";
    const map = [
      ["SportyTrader", sources?.sportytrader?.url],
      ["Forebet", sources?.forebet?.url],
      ["PredictZ", sources?.predictz?.url],
      ["WinDrawWin", sources?.windrawwin?.url],
    ];
    map.forEach(([label,url])=>{
      const b=makeEl("button",{class:"btn"},`Deschide ${label}`); b.disabled=!url;
      b.addEventListener("click",()=>url&&open(url,"_blank")); srcBtnsWrap.appendChild(b);
    });
  }
  function summarizeSources(s){
    const badges=[];
    if(s?.sportytrader?.picks?.length) badges.push("✅ SportyTrader");
    else if(s?.sportytrader) badges.push("⚠️ SportyTrader");
    if(s?.predictz?.picks?.length) badges.push("✅ PredictZ");
    else if(s?.predictz) badges.push("⚠️ PredictZ");
    if(s?.forebet?.picks?.length || s?.forebet?.odds?.length) badges.push("✅ Forebet");
    else if(s?.forebet) badges.push("⚠️ Forebet");
    if(s?.windrawwin?.picks?.length || s?.windrawwin?.form?.length) badges.push("✅ WinDrawWin");
    else if(s?.windrawwin) badges.push("⚠️ WinDrawWin");
    return badges.length ? "📎 Surse: " + badges.join(" · ") : "📎 Surse: date indisponibile.";
  }
  function renderSourceSummary(sources){ setText(srcSummaryWrap, `<div class="muted small">${summarizeSources(sources)}</div>`); }

  function renderAnalysis(text){
    if(!resultBox) return;
    const safe = sanitize(text).replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const html = safe.split("\n").map(ln=>{
      if(/^\s*\d+\)/.test(ln)){
        const idx = ln.indexOf(")");
        const head = ln.slice(0, idx+1);
        const rest = ln.slice(idx+1);
        return `<div><strong>${head}</strong>${rest}</div>`;
      }
      return `<div>${ln}</div>`;
    }).join("");
    resultBox.innerHTML = `<div class="analysis">${html}</div>`;
    // colorăm rapid simbolurile
    resultBox.querySelectorAll("div").forEach(d=>{
      d.innerHTML = d.innerHTML
        .replaceAll("✅","<span class='ok'>✅</span>")
        .replaceAll("⚠️","<span class='warn'>⚠️</span>")
        .replaceAll("📊","<span class='stat'>📊</span>")
        .replaceAll("🎯","<span class='reco'>🎯</span>");
    });
  }

  async function onGenerate(){
    const match = sanitize(input?.value||"");
    if(!match){ toast("Scrie meciul în format „Gazdă - Oaspeți” sau slug/link.","error"); input?.focus(); return; }
    try{
      loading(true); setText(resultBox,""); setText(srcSummaryWrap,""); if(srcBtnsWrap) srcBtnsWrap.innerHTML="";
      const data = await requestAnalysis(match);
      renderAnalysis(data?.analysis || "Nu am reușit să generez analiza.");
      renderOpenButtons(data?.sources); renderSourceSummary(data?.sources);
    }catch(e){ toast(e.message||"Eroare la generare","error"); }
    finally{ loading(false); }
  }

  genBtn?.addEventListener("click", onGenerate);
  input?.addEventListener("keydown", ev=>{ if(ev.key==="Enter") onGenerate(); });

  // =============== Setări + Demo ===============
  const settings = $("#settingsModal");
  $("#openSettings")?.addEventListener("click",()=>{ settings?.classList.remove("hidden"); settings?.setAttribute("aria-hidden","false"); });
  $("#closeSettings")?.addEventListener("click",()=>{ settings?.classList.add("hidden"); settings?.setAttribute("aria-hidden","true"); });

  const DEMO = [
"Analiză „marca ta” – Club Brugge vs Cercle Brugge (9 august 2025)",
"",
"1) ✅ Consens general – Toate sursele majore văd victorie Club Brugge, cote ~1.40, probabilitate estimată 70–72% pentru succes.",
"",
"2) 🧮 Scor estimat – Majoritatea previziunilor merg pe 2–0 pentru Club Brugge, bazat pe forma bună și problemele ofensive ale lui Cercle.",
"",
"3) 📊 Over 2.5 goluri – Analizele SportyTrader și Betimate indică un meci deschis, cu peste 2,5 goluri în total.",
"",
"4) 📊 Cornere – Media recentă: Brugge ~5,5/meci, Cercle ~4/meci. Recomandare APWin – Sub 9,5 cornere.",
"",
"5) ✅ Pauză – Club Brugge conduce – În ultimele 5 meciuri directe, Brugge a condus la pauză în 4 dintre ele.",
"",
"6) 📊 H2H – Ultimele 16 dueluri: 8 victorii Brugge, 7 egaluri, 1 victorie Cercle. BTTS în 56% din cazuri.",
"",
"7) 📊 Formă recentă – Club Brugge: 4 victorii din 6 meciuri, medie de 1,67 goluri marcate și 0,83 primite. Cercle: fără gol în primele 2 etape.",
"",
"8) 📊 Context derby – Se joacă pe Jan Breydel Stadium, unde Brugge este neînvinsă în ultimele 8 derby-uri.",
"",
"9) ⚠️ Alternative prudente – Există și scenarii cu Under 2,5 goluri și „Ambele nu marchează” – pentru pariori conservatori.",
"",
"10) 🎯 Concluzie finală – Tricombo recomandat:",
"    ° Rezultat: Club Brugge victorie",
"    ° Goluri: Peste 2,5",
"    ° Cornere: Sub 9,5",
"    ° Pauză: Brugge conduce"
].join("\n");

  $("#demoBtn")?.addEventListener("click", ()=>{
    renderAnalysis(DEMO);
    setText(srcSummaryWrap, `<div class="muted small">📎 Surse: exemplu vizual (format standard). Pentru date live apasă „Generează analiza”.</div>`);
    settings?.classList.add("hidden");
  });

  // URL ?m= pre-complete
  const q = new URLSearchParams(location.search).get("m");
  if(q && input){ input.value=q; setTimeout(onGenerate,100); }
})();
</script>
