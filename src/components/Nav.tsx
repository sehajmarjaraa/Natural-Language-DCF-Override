export function Nav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-edge/60 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
        <a href="#" className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-dim">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
              <path
                d="M2 12 L6 7 L9 9.5 L14 3"
                stroke="var(--color-accent)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="num text-[15px] font-semibold tracking-tight">
            <span className="text-ink">scenario</span>
            <span className="text-accent">engine</span>
          </span>
        </a>
        <div className="flex items-center gap-5 text-[13px] text-ink-dim sm:gap-7">
          <a href="#tool" className="hidden transition-colors hover:text-ink sm:block">
            Model
          </a>
          <a href="#data" className="transition-colors hover:text-ink">
            Data
          </a>
          <a href="#how" className="transition-colors hover:text-ink">
            How it works
          </a>
          <a
            href="https://github.com/sehajmarjaraa/Natural-Language-DCF-Override"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-edge-2 px-3.5 py-1.5 text-ink transition-colors hover:border-ink-faint"
          >
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
