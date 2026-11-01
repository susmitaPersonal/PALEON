import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AnalysisResult, RuntimeInfo } from "@scriptecho/contracts";
import { api } from "../api/client";
import { useApi, type Loadable } from "../api/useApi";

type Investigation = { result: AnalysisResult; previewUrl: string; fileName: string };

type AppState = {
  runtime: Loadable<RuntimeInfo>;
  investigation: Investigation | null;
  setInvestigation: (value: Investigation | null) => void;
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const runtime = useApi(api.runtime, "runtime");
  const [investigation, setInvestigation] = useState<Investigation | null>(null);

  // Images stay in this tab's memory. Revoking the old preview also releases it.
  useEffect(() => () => { if (investigation) URL.revokeObjectURL(investigation.previewUrl); }, [investigation]);

  const value = useMemo(() => ({ runtime, investigation, setInvestigation }), [runtime, investigation]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
