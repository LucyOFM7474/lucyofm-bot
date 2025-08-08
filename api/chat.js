// api/chat.js
// Generează analiza în 10 puncte pe baza consensului între surse externe.
// Presupune OPENAI_API_KEY setat în Vercel, dar textul final e compus local.
// Dacă vrei, poți înlocui secțiunea LLM cu apel real la OpenAI.

export const config = { runtime: "edge" };

function scoreConsensus(values) {
  // primește un array ex: ["1X","1X","X2", null]
  const counts = {};
  for (const v of values.filter(Boolean)) counts[v] = (counts[v] || 0) + 1;
  let best = null,
    bestN = 0;
  for (const k in counts) if (counts[k] > bestN) (best = k), (bestN = counts[k]);
  const total = values.filter(Boolean).length;

  // clasificare:
  // 3/3 sau 3/4 => ✅, 2/3 ori 2/4 => ⚠️, altfel ❌ (sau "—" dacă nu există date)
  let mark = "—";
  if (bestN === 0) mark = "—";
  else if (bestN >= 3) mark = "✅";
  else if (bestN === 2) mark = "⚠️";
  else mark = "❌";

  return { pick: best, mark, votes: bestN, total, counts };
}

function buildLine(label, res) {
  if (res.total === 0) return `${label}: date insuficiente.`;
  const details = Object.entries(res.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}×${v}`)
    .join(", ");
  return `${res.mark} ${label}: ${res.pick || "—"} (${details})`;
}

function sanitize(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function handler(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const home = sanitize(body.home);
    const away = sanitize(body.away);

    if (!home || !away) {
      return new Response(JSON.stringify({ error: "Completează echipele." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // 1) Colectează surse externe
    const urlFetch = new URL(req.url);
    urlFetch.pathname = "/api/fetchSources";
    urlFetch.search = `?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`;

    const sRes = await fetch(urlFetch.toString(), { headers: { "x-internal": "1" } });
    const sJson = await sRes.json().catch(() => null);

    const sources = sJson?.sources || {};
    const st = sources.sportytrader?.picks || {};
    const fb = sources.forebet?.picks || {};
    const pz = sources.predictz?.picks || {};

    // 2) Consens pe piețe
    const cons_1x2 = scoreConsensus([st["1X2"], fb["1X2"], pz["1X2"]]);
    const cons_btts = scoreConsensus([st.BTTS, fb.BTTS, pz.BTTS]);
    const cons_ou25 = scoreConsensus([st.OU25, fb.OU25, pz.OU25]);

    // 3) Statistici auxiliare (cornere/galbene) – doar dacă există mențiuni
    const corners = [st.corners, fb.corners, pz.corners].filter(Boolean)[0] || "Nespecificate clar";
    const cards = [st.cards, fb.cards, pz.cards].filter(Boolean)[0] || "Nespecificate clar";

    const lines = [];
    lines.push(`1) Surse & Predicții`);
    const srcList = Object.entries(sources)
      .map(([k, v]) => `- ${k}: ${v.ok ? "ok" : "indisponibil"} (${v.url})`)
      .join("\n");
    lines.push(srcList || "- Nicio sursă disponibilă în acest moment.");

    lines.push(`\n2) Consens 1X2\n${buildLine("1X2", cons_1x2)}`);
    lines.push(`\n3) Consens BTTS (GG)\n${buildLine("BTTS", cons_btts)}`);
    lines.push(`\n4) Consens Over/Under 2.5\n${buildLine("Over/Under 2.5", cons_ou25)}`);

    lines.push(`\n5) Impact forma & absențe\n- (în lucru: această secțiune se va alimenta din surse de lot când sunt disponibile).`);

    lines.push(`\n6) Golgheteri & penaltiuri\n- (în lucru / necesită surse dedicate marcatorilor).`);

    lines.push(`\n7) Statistici: posesie, cornere, galbene, faulturi\n- Cornere: ${corners}\n- Cartonașe galbene: ${cards}\n- (posesie/faulturi: vor fi populate când sursele devin stabile).`);

    lines.push(`\n8) Tendințe din ultimele 5 meciuri\n- (placeholder — se va popula din surse istorice).`);

    // 9) Predicție finală ajustată (bazată pe consensul cel mai puternic)
    let recomandari = [];
    if (cons_1x2.mark === "✅" || cons_1x2.mark === "⚠️") recomandari.push(`1X2: ${cons_1x2.pick}`);
    if (cons_btts.mark === "✅" || cons_btts.mark === "⚠️") recomandari.push(`BTTS: ${cons_btts.pick}`);
    if (cons_ou25.mark === "✅" || cons_ou25.mark === "⚠️") recomandari.push(`Goluri: ${cons_ou25.pick}`);

    lines.push(
      `\n9) Recomandări „de jucat” (în ordinea încrederii)\n` +
        (recomandari.length ? "- " + recomandari.join("\n- ") : "- Nicio recomandare fără consens minim.")
    );

    lines.push(`\n10) Note & verificări\n- Dacă o sursă este blocată temporar, analiza degradează elegant (fără a cădea).\n- Verifică linkurile surselor pentru detalii complete.`);

    const text = lines.join("\n");

    return new Response(JSON.stringify({ text }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || "Eroare" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
