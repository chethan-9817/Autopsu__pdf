import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, CircleExclamationPoint, LoaderCircle, Upload, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { extractPolicyFromFile, type ExtractionReport, type ExtractionStage } from "../extraction/extractPolicy";

const STAGES: Array<{ id: ExtractionStage; label: string }> = [
  { id: "reading", label: "Reading file" },
  { id: "gemini", label: "Reading the policy, including its tables" },
  { id: "validating", label: "Checking every number" },
  { id: "grounding", label: "Finding each clause in the document" },
];

interface Props {
  open: boolean;
  liveStatus: { geminiConfigured: boolean; model: string } | null | "checking";
  onClose: () => void;
  onExtracted: (report: ExtractionReport) => void;
}

type Phase =
  | { kind: "idle" }
  | { kind: "running"; stage: ExtractionStage; fileName: string }
  | { kind: "done"; report: ExtractionReport }
  | { kind: "error"; message: string };

export function UploadModal({ open, liveStatus, onClose, onExtracted }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const configured = liveStatus !== "checking" && liveStatus?.geminiConfigured === true;

  const run = async (file: File) => {
    setPhase({ kind: "running", stage: "reading", fileName: file.name });
    try {
      const report = await extractPolicyFromFile(file, (stage) => setPhase({ kind: "running", stage, fileName: file.name }));
      setPhase({ kind: "done", report });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const close = () => {
    if (phase.kind === "running") return;
    setPhase({ kind: "idle" });
    onClose();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && configured) void run(file);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && close()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-2xl shadow-slate-900/15"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="upload-title" className="text-base font-semibold text-slate-900">
                Upload a policy
              </h2>
              <button type="button" onClick={close} className="grid size-8 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {!configured && phase.kind === "idle" && (
              <div className="space-y-3 text-[13px] text-slate-600">
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  {liveStatus === "checking"
                    ? "Checking the extraction server…"
                    : liveStatus === null
                      ? "The extraction API is not reachable. Live upload needs `npm run dev` or `npm run preview` (the Gemini proxy runs inside the Vite server)."
                      : "Uploading needs a Gemini API key on the server. The two sample policies work without one."}
                </p>
                <ol className="list-decimal space-y-1 pl-5 text-[13px] text-slate-600">
                  <li>
                    Get a free key at <span className="font-medium text-slate-900">aistudio.google.com</span>
                  </li>
                  <li>
                    Copy <code className="text-slate-900">.env.example</code> to <code className="text-slate-900">.env</code> and set <code className="text-slate-900">GEMINI_API_KEY</code>
                  </li>
                  <li>
                    Restart <code className="text-slate-900">npm run dev</code>
                  </li>
                </ol>
              </div>
            )}

            {configured && phase.kind === "idle" && (
              <>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
                    dragging ? "border-slate-900 bg-slate-50" : "border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  <Upload className="size-6 text-slate-400" aria-hidden />
                  <span className="text-[14px] font-medium text-slate-900">Drop the policy PDF here, or click to choose</span>
                  <span className="text-xs text-slate-500">PDF up to 20 MB, or a PNG/JPEG photo of the benefits table</span>
                </button>
                <p className="mt-3 text-xs text-slate-500">
                  The file goes to your local server, which sends it to {(liveStatus as { model: string }).model}. Your API key stays on the server.
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void run(file);
                  }}
                />
              </>
            )}

            {phase.kind === "running" && (
              <div>
                <p className="mb-4 truncate text-[13px] text-slate-500">{phase.fileName}</p>
                <ol className="space-y-3">
                  {STAGES.map((s) => {
                    const idx = STAGES.findIndex((x) => x.id === phase.stage);
                    const mine = STAGES.findIndex((x) => x.id === s.id);
                    const state = mine < idx ? "done" : mine === idx ? "active" : "todo";
                    return (
                      <li key={s.id} className="flex items-center gap-2.5 text-[13px]">
                        {state === "done" ? (
                          <CircleCheck className="size-4 text-emerald-600" aria-hidden />
                        ) : state === "active" ? (
                          <LoaderCircle className="size-4 animate-spin text-slate-900" aria-hidden />
                        ) : (
                          <span className="size-4 rounded-full border border-slate-300" aria-hidden />
                        )}
                        <span className={state === "todo" ? "text-slate-400" : "text-slate-800"}>{s.label}</span>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-5 text-xs text-slate-500">Long policies can take 20–60 seconds.</p>
              </div>
            )}

            {phase.kind === "error" && (
              <div className="space-y-3">
                <p className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-800">
                  <CircleExclamationPoint className="mt-0.5 size-4 shrink-0" aria-hidden /> {phase.message}
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-lg px-3 py-2 text-[13px] text-slate-600 transition-colors hover:bg-slate-100">
                    Keep using samples
                  </button>
                  <button type="button" onClick={() => setPhase({ kind: "idle" })} className="rounded-lg bg-slate-900 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-slate-700">
                    Try another file
                  </button>
                </div>
              </div>
            )}

            {phase.kind === "done" && (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-[13px] text-emerald-700">
                  <CircleCheck className="size-4" aria-hidden /> Read <span className="font-semibold text-slate-900">{phase.report.profile.rules.policyName}</span>
                </p>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <Metric label="Clauses located" value={`${phase.report.grounded}/${phase.report.totalCitations}`} />
                  <Metric label="Treatment caps" value={String(phase.report.profile.rules.subLimits.length)} />
                  <Metric label="Read time" value={`${(phase.report.latencyMs / 1000).toFixed(1)}s`} />
                </dl>
                {phase.report.warnings.length > 0 && (
                  <ul className="pane-scroll max-h-32 space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    {phase.report.warnings.map((w) => (
                      <li key={w}>• {w}</li>
                    ))}
                  </ul>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      onExtracted(phase.report);
                      setPhase({ kind: "idle" });
                    }}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-slate-700"
                  >
                    Check this policy
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-slate-50 px-2 py-2.5">
      <dd className="text-[15px] font-semibold text-slate-900">{value}</dd>
      <dt className="text-[11px] text-slate-500">{label}</dt>
    </div>
  );
}
