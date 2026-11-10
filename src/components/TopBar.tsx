import { FileSearch, Upload } from "lucide-react";
import type { PolicyProfile } from "../types/policy";

interface Props {
  profiles: PolicyProfile[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onUploadClick: () => void;
  liveStatus: { geminiConfigured: boolean; model: string } | null | "checking";
}

export function TopBar({ profiles, activeId, onSelect, onUploadClick, liveStatus }: Props) {
  const live = liveStatus !== "checking" && liveStatus?.geminiConfigured;
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-2.5">
        <div className="grid size-8 place-items-center rounded-lg bg-slate-900 text-white">
          <FileSearch className="size-4" aria-hidden />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-slate-900">PolicyAutopsy</div>
          <div className="hidden text-xs text-slate-500 sm:block">Health insurance claim checker</div>
        </div>
      </div>

      <nav
        aria-label="Policy"
        className="order-3 flex min-w-0 basis-full gap-1 rounded-xl bg-slate-100 p-1 md:order-none md:basis-auto"
      >
        {profiles.map((p) => {
          const active = p.id === activeId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              aria-pressed={active}
              className={`min-w-0 flex-1 rounded-lg px-3 py-1.5 text-left transition-all duration-200 md:w-56 md:flex-none ${
                active ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="block truncate text-[13px] font-medium">{p.label}</span>
              <span className="block truncate text-[11px] text-slate-500">{p.tagline}</span>
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <span
          className="hidden items-center gap-1.5 text-xs text-slate-500 md:flex"
          title={live ? `Model: ${(liveStatus as { model: string }).model}` : "Add GEMINI_API_KEY to .env to upload your own policy"}
        >
          <span className={`size-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`} />
          {liveStatus === "checking" ? "Checking…" : live ? "Upload ready" : "Sample mode"}
        </span>
        <button
          type="button"
          onClick={onUploadClick}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          <Upload className="size-4" aria-hidden />
          Upload policy
        </button>
      </div>
    </header>
  );
}
