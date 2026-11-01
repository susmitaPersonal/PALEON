import { useState, type FormEvent } from "react";
import type { ResearchCase, Reviewer, ReviewState } from "@scriptecho/contracts";
import { research } from "../api/client";

const STATES: [ReviewState, string][] = [["in_review", "In review"], ["disputed", "Disputed"], ["unresolved", "Unresolved"], ["approved_by_expert", "Approved by a qualified expert"]];

type Props = { record: ResearchCase; reviewer: Reviewer; run: (work: () => Promise<ResearchCase>) => void };

export function ReviewPanel({ record, reviewer, run }: Props) {
  const [state, setState] = useState<ReviewState>("in_review");
  const [evidence, setEvidence] = useState("");
  const [attests, setAttests] = useState(false);
  const [note, setNote] = useState("");
  const [citation, setCitation] = useState("");
  const approving = state === "approved_by_expert";
  const expert = reviewer.role === "qualified_expert";

  const review = (event: FormEvent) => {
    event.preventDefault();
    run(() => research.review(record.id, { expectedRevision: record.revision, state, reviewer, evidence, attestsQualified: attests }));
    setEvidence("");
    setAttests(false);
  };

  return (
    <section className="panel" aria-labelledby="review-heading">
      <h2 id="review-heading">Notes and review</h2>
      <p>Current state: <strong>{record.reviewState.replaceAll("_", " ")}</strong></p>
      <label className="field">Research note<textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} /></label>
      <button className="button button-quiet" type="button" disabled={!note.trim() || !reviewer.name.trim()} onClick={() => { run(() => research.addNote(record.id, record.revision, reviewer.name, note)); setNote(""); }}>Add note</button>
      <label className="field">Citation<input value={citation} maxLength={2000} onChange={(event) => setCitation(event.target.value)} /></label>
      <button className="button button-quiet" type="button" disabled={!citation.trim()} onClick={() => { run(() => research.addCitation(record.id, record.revision, citation, null)); setCitation(""); }}>Add citation</button>
      {record.notes.length > 0 && <ul>{record.notes.map((item) => <li key={item.id}>{item.author}: {item.text}</li>)}</ul>}
      {record.citations.length > 0 && <ul>{record.citations.map((item) => <li key={item.id}>{item.text}</li>)}</ul>}
      <form onSubmit={review}>
        <label className="field">Set review state
          <select value={state} onChange={(event) => setState(event.target.value as ReviewState)}>{STATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <label className="field">Evidence<textarea required value={evidence} maxLength={2000} onChange={(event) => setEvidence(event.target.value)} /></label>
        {approving && <label className="check"><input type="checkbox" checked={attests} onChange={(event) => setAttests(event.target.checked)} /> I am qualified to review this script, and I reviewed this reading myself</label>}
        {approving && !expert && <p className="source-meta">Only a person acting as a qualified expert can approve.</p>}
        <button className="button" type="submit" disabled={!reviewer.name.trim() || (approving && !(expert && attests))}>Record review</button>
      </form>
      <details className="hint">
        <summary>Revision history ({record.history.length})</summary>
        <ol>{record.history.map((item) => <li key={item.revision}>{item.at.slice(0, 16).replace("T", " ")}: {item.action}{item.reviewer ? `, ${item.reviewer.name}` : ""}{item.evidence ? `. ${item.evidence}` : ""}</li>)}</ol>
      </details>
    </section>
  );
}
