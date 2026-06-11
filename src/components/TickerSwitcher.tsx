import { useState } from "react";

export interface CompanyListing {
  ticker: string;
  name: string;
  generatedAt: string;
}

interface Props {
  current: string;
  available: CompanyListing[];
  onSelect: (ticker: string) => void;
  compact?: boolean;
}

/** Switch the whole model to any company with a committed snapshot.
 *  Unknown tickers get the exact ingest command instead of fake data. */
export function TickerSwitcher({ current, available, onSelect, compact }: Props) {
  const [value, setValue] = useState("");
  const [miss, setMiss] = useState<string | null>(null);

  const submit = () => {
    const t = value.trim().toUpperCase();
    if (!t || t === current) return;
    if (available.some((a) => a.ticker === t)) {
      setMiss(null);
      setValue("");
      onSelect(t);
    } else {
      setMiss(t);
    }
  };

  return (
    <div className={compact ? "" : "space-y-1.5"}>
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value.toUpperCase());
            setMiss(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          list="available-tickers"
          placeholder={current}
          aria-label="Switch ticker"
          className="num w-24 rounded-md border border-edge bg-panel-2 px-2.5 py-1.5 text-[12px] uppercase text-ink placeholder:text-ink-faint focus:border-edge-2 focus:outline-none"
        />
        <datalist id="available-tickers">
          {available.map((a) => (
            <option key={a.ticker} value={a.ticker}>
              {a.name}
            </option>
          ))}
        </datalist>
        <button
          onClick={submit}
          className="rounded-md border border-edge px-2.5 py-1.5 text-[12px] text-ink-dim transition-colors hover:border-edge-2 hover:text-ink"
        >
          load
        </button>
      </div>
      {!compact && (
        <p className="text-[10.5px] leading-snug text-ink-faint">
          {available.length} committed snapshot{available.length === 1 ? "" : "s"}:{" "}
          {available.map((a) => a.ticker).join(" · ")}
        </p>
      )}
      {miss && (
        <p className="max-w-60 text-[10.5px] leading-snug text-down">
          No committed snapshot for {miss}. The static site never invents data — add it with{" "}
          <code className="num">npm run ingest -- --ticker {miss}</code> and rebuild.
        </p>
      )}
    </div>
  );
}
