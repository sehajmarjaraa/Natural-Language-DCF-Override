import type { CompanyData } from "../engine/companyData";

export function Footer({ company }: { company: CompanyData }) {
  return (
    <footer className="border-t border-edge">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 text-[12px] text-ink-faint">
          <span>
            scenario-engine — built by <span className="text-ink-dim">Sehaj Marjara</span>
          </span>
          <span className="flex gap-4">
            <a href="https://www.linkedin.com/in/sehajmarjara/" target="_blank" rel="noopener noreferrer" className="hover:text-ink-dim">LinkedIn</a>
            <a href="https://github.com/sehajmarjaraa" target="_blank" rel="noopener noreferrer" className="hover:text-ink-dim">GitHub</a>
            <a href="resume.pdf" className="hover:text-ink-dim">Resume</a>
          </span>
        </div>
        <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-ink-faint">
          Research and educational demonstration using public SEC filings and market data as of
          the dates stated on this page (data snapshot {company.generatedAt.slice(0, 10)}). This
          is not investment advice, not investment research, and not a recommendation to buy or
          sell {company.ticker} or any security. Model outputs are the mechanical result of the
          stated assumptions and can differ materially from reality.
        </p>
      </div>
    </footer>
  );
}
