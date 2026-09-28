export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-3.5 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
            >
              <circle cx="6" cy="6" r="3" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="12" cy="18" r="3" />
              <path d="M8.5 7.5l7 0" />
              <path d="M7.5 8.5l3.5 7" />
              <path d="M16.5 8.5l-3.5 7" />
            </svg>
          </div>
          <div>
            <span className="block text-base font-bold leading-none tracking-tight text-slate-900">
              EdgeDecide
            </span>
            <p className="mt-0.5 text-xs leading-none text-slate-500">Where should this task run?</p>
          </div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50/60 px-2.5 py-1 text-xs font-medium text-slate-600">
          WMC Mini Project
        </div>
      </div>
    </header>
  );
}
