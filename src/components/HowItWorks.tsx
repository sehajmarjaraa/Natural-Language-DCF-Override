const PANELS = [
  {
    title: "Real EDGAR & market data",
    body: "An ingest script pulls five years of XBRL fundamentals from SEC EDGAR, a market snapshot (price, beta) from a free-tier provider, and the 10-year Treasury yield — then commits the dated JSON. The deployed site fetches nothing and needs no keys.",
  },
  {
    title: "Deterministic in-browser DCF",
    body: "A pure TypeScript function projects ten years of unlevered free cash flow, discounts at a WACC built from the real risk-free rate and beta, and adds a Gordon-growth terminal value. Same inputs, same answer, every time — and it runs in milliseconds on every slider move.",
  },
  {
    title: "Language → overrides, nothing else",
    body: "Plain-English mode makes exactly one LLM call on your own key. The model returns a schema-validated, clamped override object — assumptions, not answers. It cannot emit a price, a valuation, or any number you see on screen.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-20">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-ink-faint">How it works</h2>
      <div className="mt-6 grid gap-px overflow-hidden rounded-md border border-edge bg-edge sm:grid-cols-3">
        {PANELS.map((p, i) => (
          <div key={p.title} className="bg-panel p-5">
            <div className="num text-[11px] text-accent">0{i + 1}</div>
            <h3 className="mt-2 text-[14px] font-medium text-ink">{p.title}</h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
