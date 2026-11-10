import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PdfEvidenceCanvas } from "./components/PdfEvidenceCanvas";
import { RulesStrip } from "./components/RulesStrip";
import { Simulator, type SimulatorAutoFlags, type SimulatorState } from "./components/Simulator";
import { TopBar } from "./components/TopBar";
import { TrapCards } from "./components/TrapCards";
import { UploadModal } from "./components/UploadModal";
import { WaterfallReceipt } from "./components/WaterfallReceipt";
import type { CitationFocus, FocusCitation } from "./components/focus";
import { runAdversarialTraps, type TrapResult } from "./engine/adversarialTraps";
import { estimateConsumables, estimateExemptCosts, simulateHospitalClaim } from "./engine/claimSimulator";
import { checkLiveExtraction } from "./extraction/extractPolicy";
import { loadSampleProfiles } from "./samples";
import type { PolicyProfile } from "./types/policy";
import type { ClaimScenario } from "./types/simulation";

const INITIAL_SCENARIO: ClaimScenario = {
  procedureType: "General Hospitalization",
  isPreExisting: false,
  policyAgeMonths: 30,
  daysInRoom: 4,
  actualDailyRoomRentINR: 9000,
  totalHospitalBillINR: 350000,
  consumablesBillINR: 28000,
  exemptMedicalCostsINR: 105000,
  patientAgeYears: 35,
  treatedInHigherZone: false,
};

export default function App() {
  const [profiles, setProfiles] = useState<PolicyProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sim, setSim] = useState<SimulatorState>({ scenario: INITIAL_SCENARIO, consumablesAuto: true, exemptAuto: true });
  const [focus, setFocus] = useState<CitationFocus | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState<{ geminiConfigured: boolean; model: string } | null | "checking">("checking");
  const simRef = useRef<HTMLDivElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSampleProfiles()
      .then((p) => {
        setProfiles(p);
        setActiveId(p[0]?.id ?? null);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
    void checkLiveExtraction().then(setLiveStatus);
  }, []);

  const profile = profiles.find((p) => p.id === activeId) ?? null;
  const rules = profile?.rules ?? null;

  // When "auto", consumables track the bill at the policy's estimate, and medicines /
  // implants / tests track it at the procedure's typical share.
  const scenario = useMemo<ClaimScenario>(() => {
    const s = sim.scenario;
    return {
      ...s,
      ...(rules && sim.consumablesAuto ? { consumablesBillINR: estimateConsumables(rules, s.totalHospitalBillINR) } : {}),
      ...(sim.exemptAuto ? { exemptMedicalCostsINR: estimateExemptCosts(s.procedureType, s.totalHospitalBillINR) } : {}),
    };
  }, [rules, sim]);
  const breakdown = useMemo(() => (rules ? simulateHospitalClaim(rules, scenario) : null), [rules, scenario]);
  const traps = useMemo(() => (rules ? runAdversarialTraps(rules) : []), [rules]);

  const focusCitation = useCallback<FocusCitation>((citation, context, impactINR) => {
    setFocus({ citation, context, impactINR, nonce: Date.now() });
  }, []);

  const onScenarioChange = useCallback((patch: Partial<ClaimScenario>, opts?: SimulatorAutoFlags) => {
    setSim((s) => ({
      scenario: { ...s.scenario, ...patch },
      consumablesAuto: opts?.consumablesAuto ?? s.consumablesAuto,
      exemptAuto: opts?.exemptAuto ?? s.exemptAuto,
    }));
  }, []);

  const loadTrap = useCallback(
    (trap: TrapResult) => {
      setSim({ scenario: trap.scenario, consumablesAuto: true, exemptAuto: true });
      setHighlight((h) => h + 1);
      focusCitation(trap.citation, `Trap #${trap.rank}: ${trap.title}`, trap.headlineINR);
      simRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [focusCitation],
  );

  const selectProfile = (id: string) => {
    setActiveId(id);
    setFocus(null);
    leftPaneRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loadError) {
    return <div className="grid h-full place-items-center p-6 text-red-700">Could not load the sample policies: {loadError}</div>;
  }
  if (!profile || !rules || !breakdown) {
    return (
      <div className="grid h-full place-items-center text-[13px] text-slate-500">
        <span className="flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin text-slate-400" aria-hidden /> Loading sample policies…
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <TopBar
        profiles={profiles}
        activeId={activeId}
        onSelect={selectProfile}
        onUploadClick={() => setUploadOpen(true)}
        liveStatus={liveStatus}
      />

      <main className="grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-[55fr_45fr]">
        <div ref={leftPaneRef} className="pane-scroll border-line lg:min-h-0 lg:overflow-y-auto lg:border-r">
          <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
            <RulesStrip rules={rules} onFocus={focusCitation} />
            <TrapCards traps={traps} onLoad={loadTrap} onFocus={focusCitation} />
            <div ref={simRef} className="scroll-mt-4">
              <Simulator rules={rules} state={{ scenario, consumablesAuto: sim.consumablesAuto, exemptAuto: sim.exemptAuto }} onChange={onScenarioChange} highlight={highlight} />
            </div>
            <WaterfallReceipt breakdown={breakdown} onFocus={focusCitation} focus={focus} />
            <p className="pb-2 text-center text-[11px] leading-relaxed text-slate-400">
              Educational simulator. Sample policies and insurers are fictional. Real claim outcomes depend on the full policy wording, hospital billing and TPA decisions.
            </p>
          </div>
        </div>

        <div className="h-[85vh] min-h-0 border-t border-line lg:h-auto lg:border-t-0">
          <PdfEvidenceCanvas profile={profile} focus={focus} onClearFocus={() => setFocus(null)} />
        </div>
      </main>

      <UploadModal
        open={uploadOpen}
        liveStatus={liveStatus}
        onClose={() => setUploadOpen(false)}
        onExtracted={(report) => {
          setProfiles((p) => [...p.filter((x) => x.source === "sample"), report.profile]);
          setActiveId(report.profile.id);
          setFocus(null);
          setUploadOpen(false);
        }}
      />
    </div>
  );
}
