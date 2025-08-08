// api/chat.js — STRICT MODE (fără invenții)
import { fetchAllSources } from "./fetchSources.js";

// Detectăm eticheta 1 / X / 2 / 1X / X2 / 12 din text
function detectLabel(text) {
  const t = String(text || "").toLowerCase();

  // variante de limbă uzuale
  if (/\b(x2|2x)\b/.test(t) || /millwall\s+sau\s+egal|away win or draw|draw\s+or\s+away/.test(t))
    return "X2";
  if (/\b(1x|x1)\b/.test(t) || /gazde\s+sau\s+egal|home win or draw|draw\s+or\s+home/.test(t))
    return "1X";
  if (/\b(12)\b/.test(t) || /no draw|fără\s+egal/.test(t)) return "12";

  // victorie directă
  if (/\b(home|gazde|victorie\s+gazde|câștigă\s+.*(gazda|gazdele))\b/.test(t)) return "1";
  if (/\b(away|oaspeți|victorie\s+oaspeți|câștigă\s+.*(oaspeții|oaspeții))\b/.test(t)) return "2";

  // cuvinte cheie
  if (/victorie\s+millwall|millwall\s+câștigă/.test(t)) return "2";
  if (/victorie\s+norwich|norwich\s+câștigă/.test(t)) return "1";

  // predictii tip text (sportytrader/predictz)
  if (/our\s+prediction.*(draw|egal)/i.test(t)) return "X";

  return ""; // nimic clar
}

function summarizeSource(src) {
  if (!src) return { label: "", note: "date indisponibile" };
  const blocks = [
    src.prediction,
    ...(src.picks || []),
    ...(src.keyPoints || []),
    src.synopsis || "",
  ]
    .filter(Boolean)
    .join(" | ");
  const label = detectLabel(blocks);
  return { label, note: blocks.slice(0, 240) };
}

function consensus(labels) {
  const cnt = { "1": 0, X: 0, "2": 0, "1X": 0, X2: 0, "12": 0 };
  labels.forEach((l) => {
    if (cnt[l] != null) cnt[l]++;
  });
  // ordinea preferințelor la consens
  const entries = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  return { top: top?.[0] || "", count: top?.[1] || 0, table: cnt };
}

function asList(arr) {
  return arr.filter(Boolean).map((x) => `- ${x}`).join("\n");
}

function buildTenPoints(match, S) {
  const ST = summarizeSource(S.sportytrader);
  const PZ = summarizeSource(S.predictz);
  const FB = summarizeSource(S.forebet);
  const WDW = summarizeSource(S.windrawwin);

  const labels = [ST.label, PZ.label, FB.label, WDW.label].filter(Boolean);
  const cn = consensus(labels);

  // punctul 1 – listă explicită pe surse, fără invenții
  const p1 = [
    `${ST.label ? "✅" : "⚠️"} SportyTrader: ${ST.label || "date limitate"}`,
    `${FB.label ? "✅" : "⚠️"} Forebet: ${FB.label || "date limitate"}`,
    `${PZ.label ? "✅" : "⚠️"} PredictZ: ${PZ.label || "date limitate"}`,
    `${WDW.label ? "✅" : "⚠️"} WinDrawWin: ${WDW.label || "date limitate"}`,
  ].join(" | ");

  // punctul 2 – tendință: doar dacă există măcar 2 surse cu aceeași etichetă
  let p2;
  if (cn.count >= 2) {
    p2 = `Medie ponderată: ${cn.top} (consens ${cn.count}/4 surse).`;
  } else {
    p2 = "Medie ponderată: fără consens clar (distribuție echilibrată între surse).";
  }

  // punctul 3 – 1X2% estimativ: doar indicăm direcția, fără cifre inventate
  const p3 =
    cn.count >= 2
      ? `Consens 1X2: ${cn.top} (majoritar în surse).`
      : "Consens 1X2: indecis (sursele nu converg).";

  // punctul 4 – Over/Under: deducere simplă din texte; dacă nu găsim, în lucru
  const overHints = [S.sportytrader, S.predictz, S.forebet, S.windrawwin]
    .filter(Boolean)
    .map((x) => [x.prediction, ...(x.picks || [])].join(" ").toLowerCase())
    .join(" | ");
  const over =
    /\bover\s*2\.?5\b|peste\s*2[,\.]?\s*5/.test(overHints) ? "Over 2.5 probabil" : "";
  const under =
    /\bunder\s*2\.?5\b|sub\s*2[,\.]?\s*5/.test(overHints) ? "Under 2.5 probabil" : "";
  const p4 = over || under ? `Consens Over/Under: ${over || under}.` : "Consens Over/Under: în lucru.";

  // punctul 5/6 – formă/absențe & golgheteri: fără invenții
  const p5 = "Impact formă & absențe: date limitate în sursele automate.";
  const p6 = "Golgheteri & penalty-uri: date indisponibile în sursele automate.";

  // punctul 7 – statistici
  const p7 = "📊 Posesie, cornere, galbene, faulturi: în lucru (nu s-au găsit valori fiabile).";

  // punctul 8 – tendințe din text (foarte conservator)
  const p8 = "Tendințe: indicii mixte; recomand prudență fără confirmare suplimentară.";

  // punctul 9 – recomandări doar dacă există consens (≥2 surse)
  let p9 = "🎯 Recomandări de jucat:\n- (fără consens suficient; evită pariul solist)";
  if (cn.count >= 2) {
    const reco = [];
    if (["1", "1X"].includes(cn.top)) reco.push("Solist sigur: 1 / 1X");
    if (["2", "X2"].includes(cn.top)) reco.push("Solist sigur: 2 / X2");
    if (over) reco.push("Valoare ascunsă: Over 2.5");
    if (under) reco.push("Valoare ascunsă: Under 2.5");
    if (!reco.length) reco.push("Prudent: doar X2/1X în bilete combinate");
    p9 = "🎯 Recomandări de jucat:\n" + asList(reco);
  }

  // punctul 10 – note
  const p10 =
    "Note & verificări: confirmă loturile oficiale și eventuale absențe de ultim moment; evită pariurile dacă sursele se contrazic.";

  return [
    `Analiză strictă – ${match}`,
    "",
    `1) Surse & predicții: ${p1}`,
    `2) ${p2}`,
    `3) ${p3}`,
    `4) ${p4}`,
    `5) ${p5}`,
    `6) ${p6}`,
    `7) ${p7}`,
    `8) ${p8}`,
    `9) ${p9}`,
    `10) ${p10}`,
  ].join("\n");
}

function ok(res, payload) {
  res.status(200).json({ ok: true, ...payload });
}
function fail(res, code = 500, message = "Eroare") {
  res.status(code).json({ ok: false, error: message });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return fail(res, 405, "Method Not Allowed");
    }

    const body = req.body || {};
    const match =
      String(body.match || body.meci || body.query || "").replace(/\s+/g, " ").trim();
    if (!match) return fail(res, 400, "Parametrul 'match' este obligatoriu");

    // 1) Citește sursele (STRICT)
    const sources = await fetchAllSources(match);

    // 2) Construiește analiza strictă (fără model)
    const analysis = buildTenPoints(match, sources);

    // 3) Returnează și sursele (pentru butoanele „Deschide {Sursă}”)
    return ok(res, {
      model: "STRICT",
      match,
      analysis,
      sources,
    });
  } catch (err) {
    return fail(res, 500, err?.message || "Eroare server");
  }
}
