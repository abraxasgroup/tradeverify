import { useEffect, useMemo, useState } from "react";

const DEMO_CASES = [
  {
    id: "LC-DEMO-0001",
    title: "LC DEMO-0001",
    type: "MT700",
    status: "AMARILLO",
    counterparty: "Receiver: CHASUS33XXX",
    verbiage: `DEMO TEXT ONLY…
Pegá aquí el verbiage (MT700/707/799/199) en el sistema real (privado).
Este demo NO sube PDFs reales.`,
  },
  { id: "LC-DEMO-0002", title: "LC DEMO-0002", type: "MT700", status: "ROJO", counterparty: "Sin evidencia", verbiage: "" },
];

const pill = (s) =>
  s === "VERDE"
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
    : s === "AMARILLO"
    ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
    : "bg-rose-50 text-rose-700 ring-1 ring-rose-200";

const dot = (s) => (s === "VERDE" ? "bg-emerald-500" : s === "AMARILLO" ? "bg-amber-500" : "bg-rose-500");

function extractBetweenField59(text) {
  const idx = text.search(/(?:^|\n)\s*59\s*:/i);
  if (idx === -1) return null;
  const after = text.slice(idx);
  const chunk = after
    .replace(/^[\s\S]*?\b59\s*:/i, "")
    .split(/\n\s*\d{2}[A-Z]?\s*:/i)[0];

  const lines = chunk
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  return lines.length ? lines : null;
}

function parseSwift(text) {
  const t = (text || "").replace(/\r/g, "");

  const mt = /FIN\s*700|MT\s*700|\bMT700\b/i.test(t)
    ? "MT700"
    : /MT\s*707|\bMT707\b/i.test(t)
    ? "MT707"
    : /MT\s*799|\bMT799\b/i.test(t)
    ? "MT799"
    : /MT\s*199|\bMT199\b/i.test(t)
    ? "MT199"
    : null;

  const sender = (t.match(/Sender\s*[:\-]?\s*([A-Z0-9]{8,11})/i) || [])[1] || "";
  const receiver = (t.match(/Receiver\s*[:\-]?\s*([A-Z0-9]{8,11})/i) || [])[1] || "";
  const mur = (t.match(/MUR\s*[:\-]?\s*([A-Z0-9]+)/i) || [])[1] || "";
  const mir =
    (t.match(/Message Input Reference\s*[:\-]?\s*([0-9]{4}\s*[0-9]{6}[A-Z0-9]+)/i) || [])[1] ||
    (t.match(/\bMIR\b\s*[:\-]?\s*([0-9]{4}\s*[0-9]{6}[A-Z0-9]+)/i) || [])[1] ||
    "";

  const lc20 =
    (t.match(/(?:^|\n)\s*20\s*:\s*([A-Z0-9\/\-\.\_]+)/m) || [])[1] ||
    (t.match(/Documentary Credit Number\s*[:\-]?\s*([A-Z0-9\/\-\.\_]+)/i) || [])[1] ||
    "";

  const ack = /Network\s+Delivery\s+Status\s*[:\-]?\s*Network\s+Ack/i.test(t) || /\bACK\b/i.test(t);
  const f59 = extractBetweenField59(t);
  const nonOperative = /NON[\s-]*OPERATIVE/i.test(t);
  const ucpLatest = /\bUCP\b\s*LATEST/i.test(t) && !/\bUCP\s*600\b/i.test(t);

  const flags = [];

  if (!mt) flags.push({ level: "ROJO", msg: "No se detecta claramente el tipo de mensaje (MT700/707/799/199)." });
  if (!sender) flags.push({ level: "AMARILLO", msg: "No se detecta Sender BIC en el texto." });
  if (!receiver) flags.push({ level: "AMARILLO", msg: "No se detecta Receiver BIC en el texto." });
  if (!mur) flags.push({ level: "AMARILLO", msg: "No se detecta MUR." });
  if (!mir) flags.push({ level: "AMARILLO", msg: "No se detecta MIR / Message Input Reference." });

  if (mt === "MT700") {
    if (!lc20) flags.push({ level: "AMARILLO", msg: "No se detecta Field 20 (LC Number)." });

    if (!f59) {
      flags.push({ level: "ROJO", msg: "Campo 59 (Beneficiary) no aparece / no se puede leer." });
    } else {
      const first = f59[0] || "";
      const hasCompany = /CORP|LTD|LLC|INC|LIMITED|S\.A\.|GMBH|BV/i.test(first);
      const looksAddress = /\d/.test(first) && /(AVE|ST|ROAD|BLVD|UNIT|SUITE|FLOOR|FL)/i.test(first);
      if (!hasCompany && looksAddress) {
        flags.push({ level: "ROJO", msg: "Field 59 parece incompleto: arranca con dirección (faltaría nombre legal del beneficiario)." });
      }
    }

    if (nonOperative) flags.push({ level: "ROJO", msg: "LC marcada como NON-OPERATIVE: no es ejecutable/monetizable hasta enmienda/condición." });
    if (ucpLatest) flags.push({ level: "AMARILLO", msg: "UCP dice 'latest version'. Mejor UCP 600 explícito." });
  }

  const uetrNote =
    mt === "MT700"
      ? "UETR es de pagos SWIFT gpi (ej. MT103). Para MT700 normalmente NO hay UETR; se usa MUR/MIR."
      : "UETR aplica si esto es un pago gpi (ej. MT103).";

  return { mt, sender, receiver, mur, mir, lc20, ack, f59, flags, uetrNote };
}

function Card({ title, children }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-4">
      <div className="text-xs text-slate-300/70">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-300/70">{k}</span>
      <span className="truncate font-semibold text-slate-100">{v}</span>
    </div>
  );
}

export default function App() {
  const [cases, setCases] = useState(DEMO_CASES);
  const [selectedId, setSelectedId] = useState(DEMO_CASES[0].id);
  const [query, setQuery] = useState("");
  const [verbiage, setVerbiage] = useState(DEMO_CASES[0].verbiage);
  const [lastAnalysis, setLastAnalysis] = useState(parseSwift(DEMO_CASES[0].verbiage));

  const selected = useMemo(() => cases.find((c) => c.id === selectedId) || cases[0], [cases, selectedId]);

  useEffect(() => {
    setVerbiage(selected.verbiage || "");
    setLastAnalysis(parseSwift(selected.verbiage || ""));
  }, [selectedId]); // eslint-disable-line

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((c) => (c.title + c.id + c.status).toLowerCase().includes(q));
  }, [cases, query]);

  function analyze() {
    const p = parseSwift(verbiage);

    let status = "AMARILLO";
    const hasRed = p.flags.some((f) => f.level === "ROJO");
    const hasYellow = p.flags.some((f) => f.level === "AMARILLO");
    if (hasRed) status = "ROJO";
    else if (!hasYellow) status = "VERDE";

    setCases((prev) => prev.map((c) => (c.id === selectedId ? { ...c, verbiage, status } : c)));
    setLastAnalysis(p);
  }

  function newCase() {
    const id = `LC-DEMO-${String(cases.length + 1).padStart(4, "0")}`;
    const c = { id, title: id, type: "MT700", status: "AMARILLO", counterparty: "Receiver: (demo)", verbiage: "" };
    setCases((p) => [c, ...p]);
    setSelectedId(id);
  }

  const p = lastAnalysis;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
              <span className="text-lg font-black">TV</span>
            </div>
            <div>
              <div className="text-lg font-extrabold leading-tight">TradeVerify</div>
              <div className="text-xs text-slate-300/80">DEMO público — sin documentos sensibles</div>
            </div>
          </div>

          <div className={"flex items-center gap-2 rounded-full px-3 py-2 text-sm " + pill(selected.status)}>
            <span className={"h-2.5 w-2.5 rounded-full " + dot(selected.status)} />
            <span className="font-black">{selected.status}</span>
            <span className="hidden sm:inline text-slate-700/60">|</span>
            <span className="hidden sm:inline">{selected.id}</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[360px_1fr]">
        {/* Left */}
        <aside className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div className="font-bold">Operaciones</div>
            <button onClick={newCase} className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold ring-1 ring-white/10 hover:bg-white/15">
              + Nueva
            </button>
          </div>

          <div className="mt-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar (LC, status, id)…"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400/30"
            />
          </div>

          <div className="mt-3 space-y-2">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={
                  "w-full rounded-3xl border p-3 text-left transition " +
                  (c.id === selectedId ? "border-amber-400/30 bg-amber-400/10" : "border-white/10 bg-white/5 hover:bg-white/10")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{c.title}</div>
                  <span className={"rounded-full px-2 py-1 text-xs font-black " + pill(c.status)}>{c.status}</span>
                </div>
                <div className="mt-1 text-xs text-slate-300/80">{c.type} • {c.counterparty}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100/90">
            <b>⚠️ DEMO</b> — Sirve para visual, checklist y detectar verbiage “rojo”. No confirma bancos.
          </div>
        </aside>

        {/* Right */}
        <main className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-extrabold">{selected.id}</div>
              <div className="text-sm text-slate-300/80">{selected.counterparty}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(verbiage)}
                className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold ring-1 ring-white/10 hover:bg-white/15"
              >
                Copiar verbiage
              </button>
              <button
                onClick={analyze}
                className="rounded-2xl bg-amber-400 px-3 py-2 text-sm font-extrabold text-slate-950 hover:bg-amber-300"
              >
                Analizar
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card title="Semáforo">
              <div className="flex items-center gap-3">
                <span className={"h-3.5 w-3.5 rounded-full " + dot(selected.status)} />
                <div className="text-3xl font-black">{selected.status}</div>
              </div>
              <div className="mt-2 text-sm text-slate-300/80">Verde = OK / Amarillo = faltan checks / Rojo = bloqueo por verbiage o datos.</div>
            </Card>

            <Card title="Extracto">
              <div className="space-y-1 text-sm">
                <Row k="MT" v={p.mt || "-"} />
                <Row k="Sender" v={p.sender || "-"} />
                <Row k="Receiver" v={p.receiver || "-"} />
                <Row k="LC (20)" v={p.lc20 || "-"} />
                <Row k="MUR" v={p.mur || "-"} />
                <Row k="MIR" v={p.mir || "-"} />
              </div>
            </Card>

            <Card title="Nota clave">
              <div className="text-sm text-slate-200">{p.uetrNote}</div>
              <div className="mt-2 text-xs text-slate-300/70">Si el banco pide UETR, probablemente están mirando “wire”, no “Documentary Credits/LC”.</div>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_360px]">
            <Card title="Verbiage">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-300/70">Pegá texto SWIFT (demo)</div>
                <div className={"rounded-full px-2 py-1 text-xs font-bold " + (p.ack ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-slate-200")}>
                  {p.ack ? "ACK detectado" : "ACK no detectado"}
                </div>
              </div>

              <textarea
                value={verbiage}
                onChange={(e) => setVerbiage(e.target.value)}
                placeholder="Pegá acá MT700/707/799/199…"
                className="mt-3 h-64 w-full rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-amber-400/30"
              />

              {p.f59 && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
                  <div className="font-bold">Field 59 (detectado)</div>
                  <div className="mt-2 space-y-1 text-slate-200/90">
                    {p.f59.map((l, i) => (
                      <div key={i} className="truncate">{l}</div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card title="Hallazgos">
              <div className="space-y-2">
                {p.flags.length === 0 ? (
                  <div className="rounded-2xl bg-emerald-400/10 p-3 text-sm text-emerald-100 ring-1 ring-emerald-400/20">✅ No se detectaron problemas (demo).</div>
                ) : (
                  p.flags.map((f, i) => (
                    <div
                      key={i}
                      className={
                        "rounded-2xl p-3 text-sm ring-1 " +
                        (f.level === "ROJO" ? "bg-rose-400/10 text-rose-100 ring-rose-400/20" : "bg-amber-400/10 text-amber-100 ring-amber-400/20")
                      }
                    >
                      <b>{f.level}:</b> {f.msg}
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-200/90">
                <b>Powered by Abraxas</b> — demo público. Sistema real privado para evitar subir documentos sensibles.
              </div>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
