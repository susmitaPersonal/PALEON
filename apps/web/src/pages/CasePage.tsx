import { useEffect, useState, type PointerEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ResearchCase, Reviewer, SignToken, SuggestionReport } from "@scriptecho/contracts";
import { api, ApiClientError, research } from "../api/client";
import { useApi } from "../api/useApi";
import { ErrorNotice, Loading } from "../components/Feedback";
import { ReadingPanels } from "../research/ReadingPanels";
import { ReviewPanel } from "../research/ReviewPanel";
import { SignEditor } from "../research/SignEditor";
import { addBox, insertGap, mergeWithNext, moveToken, removeToken, replaceToken, splitToken } from "../research/tokens";

export function CasePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const loaded = useApi(() => research.get(id), id);
  const scripts = useApi(api.scripts, "scripts");
  const languages = useApi(research.languages, "languages");
  const [record, setRecord] = useState<ResearchCase | null>(null);
  const [tokens, setTokens] = useState<SignToken[]>([]);
  const [selected, setSelected] = useState(0);
  const [reviewer, setReviewer] = useState<Reviewer>({ name: "", role: "researcher" });
  const [suggestions, setSuggestions] = useState<SuggestionReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drag, setDrag] = useState<{ from: [number, number]; to: [number, number] } | null>(null);
  const inventory = useApi(() => (record?.scriptId ? research.inventory(record.scriptId) : Promise.resolve(null)), record?.scriptId ?? "none");

  const adopt = (next: ResearchCase) => { setRecord(next); setTokens(next.tokens); };
  useEffect(() => { if (loaded.data) adopt(loaded.data); }, [loaded.data]);

  const act = async <T,>(label: string, work: () => Promise<T>, done: (value: T) => void) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      done(await work());
    } catch (failure) {
      setError(failure instanceof ApiClientError ? failure.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  if (loaded.loading) return <div className="page"><Loading label="Loading case" /></div>;
  if (loaded.error) return <div className="page"><ErrorNotice message={loaded.error} onRetry={loaded.retry} /></div>;
  if (!record) return null;

  const token = tokens[selected];
  const unsaved = JSON.stringify(tokens) !== JSON.stringify(record.tokens);
  const named = reviewer.name.trim().length > 0;
  const packs = languages.data?.filter((item) => record.scriptId && item.scriptIds.includes(record.scriptId)) ?? [];
  const change = (next: SignToken[]) => { setTokens(next); setSelected((value) => Math.min(value, Math.max(0, next.length - 1))); };
  const update = (body: { scriptId?: string | null; languageId?: string | null }) =>
    act("Saving", () => research.update(record.id, { expectedRevision: record.revision, ...body }), adopt);
  const reload = () => act("Reloading", () => research.get(record.id), adopt);
  const save = () => act("Saving readings", () => research.saveTokens(record.id, record.revision, tokens, reviewer, null), adopt);
  const pointer = (event: PointerEvent<SVGSVGElement>): [number, number] => {
    const frame = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - frame.left) * record.image.width / frame.width, (event.clientY - frame.top) * record.image.height / frame.height];
  };
  const finishBox = () => {
    if (drag) {
      const next = addBox(tokens, drag.from, drag.to, record.image);
      setTokens(next);
      setSelected(next.length - 1);
    }
    setDrag(null);
  };
  const textured = tokens.length > 0 && tokens.every((item) => item.segmentationUncertain);
  const remove = () => {
    if (window.confirm("Delete this case, its image, and any examples taught from it? This cannot be undone.")) {
      void act("Deleting", () => research.remove(record.id), () => navigate("/cases"));
    }
  };

  return (
    <div className="page">
      <h1>{record.title}</h1>
      <p className="source-meta">Revision {record.revision} · {record.provenance.rights || "Rights not recorded"}</p>
      {busy && <p role="status">{busy}…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <ErrorNotice message={error} />}

      <section className="panel case-controls" aria-label="Case settings">
        <label className="field">Script for reading
          <select value={record.scriptId ?? ""} onChange={(event) => update({ scriptId: event.target.value || null })}>
            <option value="">Not set</option>
            {scripts.data?.map((script) => <option key={script.id} value={script.id}>{script.name}</option>)}
          </select>
        </label>
        <label className="field">Language
          <select value={record.languageId ?? ""} disabled={packs.length === 0} onChange={(event) => update({ languageId: event.target.value || null })}>
            <option value="">Not established</option>
            {packs.map((pack) => <option key={pack.id} value={pack.id}>{pack.name} ({pack.entryCount} entries)</option>)}
          </select>
        </label>
        <label className="field">Your name<input value={reviewer.name} onChange={(event) => setReviewer({ ...reviewer, name: event.target.value })} /></label>
        <label className="field">Your role
          <select value={reviewer.role} onChange={(event) => setReviewer({ ...reviewer, role: event.target.value as Reviewer["role"] })}>
            <option value="researcher">Researcher</option>
            <option value="qualified_expert">Qualified expert</option>
          </select>
        </label>
      </section>

      {record.quality && (
        <p className="source-meta">Rule-based image measures: contrast {record.quality.contrast}, sharpness {record.quality.sharpness}, lines {record.quality.lineOrientation}{record.quality.flags.length > 0 ? `. Flags: ${record.quality.flags.join(", ").replaceAll("_", " ")}` : ""}.</p>
      )}

      <div className="actions">
        <button className="button" type="button" disabled={!!busy} onClick={() => act("Identifying the script", () => research.identify(record.id), () => void reload())}>Identify script</button>
        <button className="button button-quiet" type="button" disabled={!!busy || unsaved} onClick={() => act("Finding signs", () => research.segment(record.id, record.revision), adopt)}>Find signs</button>
        <button className="button button-quiet" type="button" disabled={!!busy || !record.scriptId} onClick={() => act("Comparing signs", () => research.suggestions(record.id), setSuggestions)}>Suggest readings</button>
      </div>

      {record.analysis && (
        <section className="panel panel-ai" aria-label="Script identification">
          <p className="panel-kicker">{record.analysis.provenance.simulated ? "Simulated demo output" : "AI-generated, unverified"}</p>
          <h2>Script candidates</h2>
          {record.analysis.candidates.length === 0 ? <p>{record.analysis.statusReason ?? "No candidates."}</p>
            : <ol>{record.analysis.candidates.map((candidate) => <li key={candidate.scriptId}>{candidate.scriptName}, {candidate.evidenceStrength} evidence</li>)}</ol>}
          <p className="source-meta">A candidate never sets the script. Choose it yourself above once you have checked it.</p>
        </section>
      )}

      <div className="workspace">
        <figure className="inscription">
          <svg viewBox={`0 0 ${record.image.width} ${record.image.height}`} role="img" aria-label={`${record.title}, with ${tokens.length} sign boxes`} className={drawing ? "drawing" : undefined}
            onPointerDown={drawing ? (event) => { const at = pointer(event); setDrag({ from: at, to: at }); } : undefined}
            onPointerMove={drag ? (event) => setDrag({ ...drag, to: pointer(event) }) : undefined}
            onPointerUp={drag ? finishBox : undefined}>
            <image href={research.imageUrl(record.id)} width={record.image.width} height={record.image.height} />
            {tokens.map((item, index) => item.box && (
              <rect key={item.id} className={index === selected ? "box box-selected" : `box box-${item.status}`} x={item.box.x} y={item.box.y} width={item.box.width} height={item.box.height} onClick={() => setSelected(index)} />
            ))}
            {drag && <rect className="box box-selected" x={Math.min(drag.from[0], drag.to[0])} y={Math.min(drag.from[1], drag.to[1])} width={Math.abs(drag.to[0] - drag.from[0])} height={Math.abs(drag.to[1] - drag.from[1])} />}
          </svg>
        </figure>
        <section className="panel" aria-labelledby="signs-heading">
          <h2 id="signs-heading">Signs ({tokens.length})</h2>
          {tokens.length === 0 && <p>No signs yet. Use Find signs to propose boxes, or draw them on the image.</p>}
          {textured && <p className="notice notice-warning">These boxes look like surface texture, not signs. Clear them and draw boxes by hand.</p>}
          <div className="actions">
            <button className="button button-quiet" type="button" aria-pressed={drawing} onClick={() => setDrawing(!drawing)}>{drawing ? "Stop drawing" : "Draw boxes"}</button>
            {tokens.length > 0 && <button className="button button-quiet" type="button" onClick={() => { setTokens([]); setSelected(0); }}>Clear all boxes</button>}
          </div>
          {tokens.length > 0 && (
            <label className="field">Selected sign
              <select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
                {tokens.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.id} ({item.status.replace("_", " ")})</option>)}
              </select>
            </label>
          )}
          {token && (
            <>
              <SignEditor token={token} inventory={inventory.data} suggestions={suggestions?.tokens.find((item) => item.tokenId === token.id)?.suggestions ?? []}
                onChange={(next) => setTokens(replaceToken(tokens, selected, next))} />
              <div className="actions">
                <button className="button button-quiet" type="button" onClick={() => { setTokens(moveToken(tokens, selected, -1)); setSelected(Math.max(0, selected - 1)); }}>Move earlier</button>
                <button className="button button-quiet" type="button" onClick={() => { setTokens(moveToken(tokens, selected, 1)); setSelected(Math.min(tokens.length - 1, selected + 1)); }}>Move later</button>
                <button className="button button-quiet" type="button" onClick={() => change(mergeWithNext(tokens, selected))}>Merge with next</button>
                <button className="button button-quiet" type="button" onClick={() => change(splitToken(tokens, selected))}>Split box</button>
                <button className="button button-quiet" type="button" onClick={() => change(insertGap(tokens, selected))}>Add gap after</button>
                <button className="button button-quiet" type="button" onClick={() => change(removeToken(tokens, selected))}>Remove</button>
              </div>
            </>
          )}
          {(tokens.length > 0 || unsaved) && (
            <div className="actions">
              <button className="button" type="button" disabled={!!busy || !unsaved || !named} onClick={save}>Save readings</button>
              <button className="button button-quiet" type="button" disabled={!!busy || unsaved || !named || !token} onClick={() => act("Teaching", () => research.teach(record.id, token!.id, reviewer), () => setNotice("Added as an approved example of this sign."))}>Teach PALEON this sign</button>
            </div>
          )}
          {!named && (tokens.length > 0 || unsaved) && <p className="source-meta">Enter your name above to save or teach. Corrections are recorded under it.</p>}
        </section>
      </div>

      {inventory.data ? <ReadingPanels record={record} inventory={inventory.data} /> : <p>Set a script to see a transliteration.</p>}
      <ReviewPanel record={record} reviewer={reviewer} run={(work) => void act("Saving", work, adopt)} />

      <div className="actions">
        <a className="button button-quiet" href={research.reportUrl(record.id, "markdown")}>Export report (Markdown)</a>
        <a className="button button-quiet" href={research.reportUrl(record.id, "json")}>Export report (JSON)</a>
        <button className="button button-quiet" type="button" onClick={remove}>Delete case</button>
      </div>
    </div>
  );
}
