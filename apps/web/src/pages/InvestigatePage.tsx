import { useEffect, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { DEMO_SCENARIOS, type DemoScenario } from "@scriptecho/contracts";
import { api, ApiClientError } from "../api/client";
import { ErrorNotice } from "../components/Feedback";
import { useApp } from "../state/AppContext";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SCENARIO_LABELS: Record<DemoScenario, string> = {
  auto: "Automatic (chosen from the image bytes)", clear_candidate: "One clear candidate", ambiguous_candidates: "Three ambiguous candidates",
  out_of_scope: "Outside the supported scripts", no_writing: "No writing", insufficient_evidence: "Insufficient evidence", provider_failure: "Provider failure",
};

type Chosen = { file: File; previewUrl: string };

export function InvestigatePage() {
  const { runtime, setInvestigation } = useApp();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [working, setWorking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scenario, setScenario] = useState<DemoScenario>("auto");
  const kept = useRef(false);
  const maxBytes = runtime.data?.maxUploadBytes ?? 8 * 1024 * 1024;

  useEffect(() => () => { if (chosen && !kept.current) URL.revokeObjectURL(chosen.previewUrl); }, [chosen]);

  const choose = (file: File | undefined) => {
    setRetryable(false);
    if (!file) return;
    // These checks only give fast feedback. The server validates the file content itself.
    if (!ACCEPTED_TYPES.includes(file.type)) { setChosen(null); setError("Choose a JPEG, PNG, or WebP image."); return; }
    if (file.size > maxBytes) { setChosen(null); setError(`Choose an image under ${Math.round(maxBytes / 1024 / 1024)} MB.`); return; }
    setError(null);
    setChosen({ file, previewUrl: URL.createObjectURL(file) });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  };

  const submit = async () => {
    if (!chosen) return;
    setWorking(true);
    setError(null);
    try {
      const result = await api.analyze(chosen.file, runtime.data?.simulated ? scenario : undefined);
      kept.current = true;
      setInvestigation({ result, previewUrl: chosen.previewUrl, fileName: chosen.file.name });
      navigate("/results");
    } catch (failure) {
      setError(failure instanceof ApiClientError ? failure.message : "Something went wrong.");
      setRetryable(failure instanceof ApiClientError && failure.error.retryable);
      setWorking(false);
    }
  };

  return (
    <div className="page page-narrow">
      <h1>New investigation</h1>
      <p className="lead">Upload a clear photograph, cropped as close to the writing as you can.</p>
      {runtime.data && !runtime.data.simulated && (
        <p className="notice notice-warning">Your image will be sent to a third-party model provider. Do not upload private or sensitive material.</p>
      )}

      <label className={`dropzone${dragging ? " dropzone-active" : ""}`} onDrop={onDrop}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}>
        <input ref={input} type="file" accept={ACCEPTED_TYPES.join(",")} className="visually-hidden" aria-describedby="file-rules"
          onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />
        <span className="dropzone-title">Choose an image, or drop one here</span>
        <span id="file-rules">JPEG, PNG, or WebP, up to {Math.round(maxBytes / 1024 / 1024)} MB. Metadata such as GPS is removed.</span>
      </label>

      {chosen && (
        <figure className="preview">
          <img src={chosen.previewUrl} alt={`Preview of ${chosen.file.name}`} />
          <figcaption>{chosen.file.name}, {(chosen.file.size / 1024).toFixed(0)} KB</figcaption>
        </figure>
      )}

      {runtime.data?.simulated && (
        <label className="field">
          <span>Simulated scenario (demo mode only)</span>
          <select value={scenario} onChange={(event) => setScenario(event.target.value as DemoScenario)}>
            {DEMO_SCENARIOS.map((value) => <option key={value} value={value}>{SCENARIO_LABELS[value]}</option>)}
          </select>
        </label>
      )}

      {error && <ErrorNotice message={error} onRetry={retryable ? submit : undefined} />}
      {working && <p className="status-line" role="status">Validating the image and running the analysis</p>}

      <div className="actions">
        <button type="button" className="button" disabled={!chosen || working} onClick={submit}>{working ? "Analysing" : "Analyse image"}</button>
        {chosen && !working && <button type="button" className="button button-quiet" onClick={() => { setChosen(null); setError(null); input.current?.focus(); }}>Remove image</button>}
      </div>
    </div>
  );
}
