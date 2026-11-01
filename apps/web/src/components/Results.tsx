import { useState } from "react";
import { Link } from "react-router-dom";
import type { AnalysisResult, CandidateResult, DirectionCheck, EvidenceStrength, InferenceMode, ModelObservations } from "@scriptecho/contracts";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { ComparisonView } from "./ComparisonView";
import { ErrorNotice, Hint, Loading } from "./Feedback";
import { ScriptFacts } from "./ScriptReference";
import { SourceList } from "./Sources";

const HEADLINES: Record<AnalysisResult["status"], string> = {
  candidates: "Candidate scripts found",
  insufficient_evidence: "Not enough evidence to identify a script",
  out_of_scope: "Outside the supported scripts",
  no_writing: "No writing detected",
};
const MODE_TEXT: Record<InferenceMode, string> = {
  simulated: "Simulated fixture, not AI inference",
  local: "Genuine local model inference, on this computer",
  external: "Third-party model inference",
};
const RESULT_KICKER: Record<InferenceMode, string> = { simulated: "Simulated result", local: "Local model result", external: "Third-party model result" };
const STRENGTH_TEXT: Record<EvidenceStrength, string> = { strong: "Strong evidence", moderate: "Moderate evidence", weak: "Weak evidence" };
const DIRECTION_TEXT: Record<ModelObservations["direction"], string> = {
  left_to_right: "Left to right", right_to_left: "Right to left", boustrophedon: "Alternating (boustrophedon)", vertical: "Vertical", unclear: "Unclear",
};

function EvidenceList({ title, items, empty, level: Heading = "h4" }: { title: string; items: string[]; empty: string; level?: "h3" | "h4" }) {
  return (
    <div>
      <Heading className="evidence-heading">{title}</Heading>
      {items.length === 0 ? <p className="unknown">{empty}</p> : <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>}
    </div>
  );
}

const DIRECTION_CHECK_TEXT: Record<DirectionCheck, string> = {
  consistent: "Observed direction agrees with the sourced record. Other scripts share this direction, so this does not identify the script.",
  conflict: "Observed direction conflicts with the sourced record, so this candidate is rated weak. Some inscriptions break the usual direction.",
  not_checkable: "Direction could not be checked against a sourced record.",
};

function CandidateCard({ candidate }: { candidate: CandidateResult }) {
  return (
    <article className="candidate">
      <header>
        <span className="candidate-rank" aria-label={`Rank ${candidate.rank}`}>{candidate.rank}</span>
        <h3><Link to={`/scripts/${candidate.scriptId}`}>{candidate.scriptName}</Link></h3>
        <span className={`strength strength-${candidate.evidenceStrength}`}>{STRENGTH_TEXT[candidate.evidenceStrength]}</span>
      </header>
      <div className="evidence-columns">
        <EvidenceList title="Evidence for" items={candidate.supportingEvidence} empty="None given." />
        <EvidenceList title="Evidence against" items={candidate.contradictingEvidence} empty="None given." />
      </div>
      <p className="section-note">{DIRECTION_CHECK_TEXT[candidate.directionCheck]}</p>
    </article>
  );
}

function Observations({ observations }: { observations: ModelObservations }) {
  return (
    <section className="panel panel-ai" aria-labelledby="observed-heading">
      <p className="panel-kicker">AI observation, not verified</p>
      <h2 id="observed-heading">Seen in the image</h2>
      <dl className="facts">
        <div className="fact-row"><dt>Image quality</dt><dd>{observations.imageQuality}</dd></div>
        <div className="fact-row"><dt>Direction</dt><dd>{DIRECTION_TEXT[observations.direction]}{observations.directionBasis ? `. ${observations.directionBasis}` : ""}</dd></div>
      </dl>
      <div className="evidence-columns">
        <EvidenceList level="h3" title="Visual features" items={observations.visualFeatures} empty="None reported." />
        <EvidenceList level="h3" title="Character shapes" items={observations.characterShapes} empty="None reported." />
      </div>
      <div className="evidence-columns">
        <EvidenceList level="h3" title="Limitations" items={observations.limitations} empty="None reported." />
        <EvidenceList level="h3" title="Ambiguities" items={observations.ambiguities} empty="None reported." />
      </div>
    </section>
  );
}

function CandidateReference({ candidate }: { candidate: CandidateResult }) {
  const detail = useApi(() => api.script(candidate.scriptId), candidate.scriptId);
  return (
    <section className="panel panel-source" aria-labelledby={`reference-${candidate.scriptId}`}>
      <p className="panel-kicker">From the sources</p>
      <h2 id={`reference-${candidate.scriptId}`}>{candidate.scriptName}: reference record</h2>
      {detail.loading && <Loading label="Loading reference record" />}
      {detail.error && <ErrorNotice message={detail.error} onRetry={detail.retry} />}
      {detail.data && (
        <>
          <ScriptFacts detail={detail.data} />
          <h3>Sources</h3>
          <SourceList sources={detail.data.sources} />
        </>
      )}
    </section>
  );
}

function CandidateComparison({ candidates }: { candidates: CandidateResult[] }) {
  const pairs = candidates.flatMap((first, index) => candidates.slice(index + 1).map((second) => [first, second] as const));
  const [selected, setSelected] = useState(0);
  const pair = pairs[selected] ?? pairs[0]!;
  return (
    <section className="panel" aria-labelledby="compare-heading">
      <p className="panel-kicker">From the sources</p>
      <h2 id="compare-heading">Compare candidates</h2>
      {pairs.length > 1 && (
        <label className="field">
          <span>Pair to compare</span>
          <select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
            {pairs.map(([first, second], index) => <option key={index} value={index}>{first.scriptName} and {second.scriptName}</option>)}
          </select>
        </label>
      )}
      <ComparisonView first={pair[0].scriptId} second={pair[1].scriptId} />
    </section>
  );
}

function exportReport(result: AnalysisResult) {
  const report = { generatedBy: "PALEON", notice: "AI observations are unverified. No historical claim here comes from the model.", result };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `paleon-${result.analysisId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function Provenance({ result }: { result: AnalysisResult }) {
  const { provenance } = result;
  const rows: [string, string][] = [
    ["Mode", MODE_TEXT[provenance.inferenceMode]],
    ["Provider", provenance.provider], ["Model", provenance.modelId], ["Model version", provenance.modelVersion ?? "Not reported"],
    ["Prompt version", provenance.promptVersion], ["Reference version", provenance.referenceVersion],
    ["Analysed at", new Date(provenance.analyzedAt).toLocaleString()], ["Attempts", String(provenance.attempts)],
    ["Tokens", provenance.inputTokens === null ? "Not reported" : `${provenance.inputTokens} in, ${provenance.outputTokens} out`],
    ["Processed image", `${result.image.width} × ${result.image.height}, from ${result.image.format}`],
  ];
  return (
    <section className="panel" aria-labelledby="provenance-heading">
      <h2 id="provenance-heading">How this result was produced</h2>
      <button type="button" className="button button-quiet" onClick={() => exportReport(result)}>Download report (JSON)</button>
      <dl className="facts">{rows.map(([label, value]) => <div className="fact-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <h3>Not attempted</h3>
      <p>PALEON does not identify language, transcribe, transliterate, or translate. These are separate tasks, and each needs its own evidence.</p>
    </section>
  );
}

export function Results({ result, previewUrl, fileName }: { result: AnalysisResult; previewUrl: string; fileName: string }) {
  const { candidates } = result;
  return (
    <div className="results">
      <section className="result-head" aria-labelledby="result-heading">
        <img src={previewUrl} alt={`Uploaded image: ${fileName}`} />
        <div>
          <p className="panel-kicker">{RESULT_KICKER[result.provenance.inferenceMode]}</p>
          <h1 id="result-heading" tabIndex={-1}>{HEADLINES[result.status]}</h1>
          {result.statusReason && <p>{result.statusReason}</p>}
          {result.recommendExpertReview && (
            <p className="notice notice-warning"><strong>Expert review recommended.</strong> Treat this as a lead, not an identification.</p>
          )}
          {result.observations.imageQuality === "poor" && (
            <p className="notice notice-warning"><strong>Poor image quality.</strong> Marks may be lost or misread.</p>
          )}
          {result.unsupportedScriptIds.length > 0 && <p>Suggested outside the supported scripts, with no reference record: {result.unsupportedScriptIds.join(", ")}.</p>}
          {result.removedStatements > 0 && <p>{result.removedStatements} statement(s) were removed, because they were not visual observations, repeated another statement, or looked like a historical claim.</p>}
          <Hint label="No percentages are shown. Why?">
            Model confidence is not a calibrated probability. Evidence strength is a fixed rule. The model's own text can reach moderate at most. Strong needs two checks against sourced records, and the current records allow only one, so no result can be strong yet.
          </Hint>
        </div>
      </section>

      {candidates.length > 0 && (
        <section aria-labelledby="candidates-heading">
          <h2 id="candidates-heading">Ranked candidates</h2>
          <p className="section-note">AI interpretation of the image, not verified.</p>
          <div className="candidates">{candidates.map((candidate) => <CandidateCard key={candidate.scriptId} candidate={candidate} />)}</div>
        </section>
      )}

      <Observations observations={result.observations} />
      {candidates.map((candidate) => <CandidateReference key={candidate.scriptId} candidate={candidate} />)}
      {candidates.length > 1 && <CandidateComparison candidates={candidates} />}
      <Provenance result={result} />
    </div>
  );
}
