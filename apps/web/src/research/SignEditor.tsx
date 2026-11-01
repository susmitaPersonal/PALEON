import { useMemo } from "react";
import type { SignInventory, SignToken, SuggestionReport, TokenStatus } from "@scriptecho/contracts";
import { ORIGIN_LABELS } from "./tokens";

const STATUSES: [TokenStatus, string][] = [["unread", "Not read yet"], ["certain", "Certain"], ["uncertain", "Uncertain"], ["damaged", "Damaged"],
  ["illegible", "Illegible"], ["lost", "Lost"], ["unknown_sign", "Unknown sign"]];
const TAKES_READING = new Set<TokenStatus>(["certain", "uncertain", "damaged"]);

type Props = {
  token: SignToken;
  inventory: SignInventory | null;
  suggestions: SuggestionReport["tokens"][number]["suggestions"];
  onChange: (change: Partial<SignToken>) => void;
};

/** Edits one sign. Each reading is a list of signs, so one mark can hold a ligature or stand beside alternatives. */
export function SignEditor({ token, inventory, suggestions, onChange }: Props) {
  const options = useMemo(() => inventory?.signs.map((sign) => <option key={sign.id} value={sign.id}>{sign.character} {sign.values.join(" / ")}</option>), [inventory]);
  const setStatus = (status: TokenStatus) => onChange({ status, readings: TAKES_READING.has(status) ? token.readings.slice(0, status === "certain" ? 1 : undefined) : [] });
  const setReading = (index: number, signId: string) => {
    const readings = token.readings.map((reading, position) => (position === index ? { ...reading, signIds: [signId] } : reading));
    onChange({ readings });
  };
  const accept = (signId: string) => onChange({ readings: [{ signIds: [signId], note: null }], status: "uncertain" });
  const addReading = () => {
    const first = inventory?.signs[0]?.id;
    if (first) onChange({ readings: [...token.readings, { signIds: [first], note: null }], status: token.status === "certain" || token.status === "unread" ? "uncertain" : token.status });
  };

  return (
    <div className="sign-editor">
      <p className="source-meta">Sign {token.id} · {ORIGIN_LABELS[token.origin]}{token.segmentationUncertain ? " · box needs checking" : ""}</p>
      <label className="field">Status
        <select value={token.status} onChange={(event) => setStatus(event.target.value as TokenStatus)}>
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {!inventory && <p>Set a script before entering readings.</p>}
      {inventory && token.readings.map((reading, index) => (
        <label className="field" key={index}>Reading {index + 1}
          <select value={reading.signIds[0]} onChange={(event) => setReading(index, event.target.value)}>{options}</select>
        </label>
      ))}
      {inventory && TAKES_READING.has(token.status) && token.readings.length > 1 && <p className="source-meta">Every reading stays live. Order does not rank them.</p>}
      {inventory && <button className="button button-quiet" type="button" onClick={addReading}>Add reading</button>}
      {suggestions.length > 0 && (
        <div>
          <h4>Similar approved signs</h4>
          <p className="source-meta">Shape overlap, not a probability. Accepting one marks the sign uncertain until you confirm it.</p>
          <div className="actions">
            {suggestions.map((item) => <button key={item.signId} className="button button-quiet" type="button" onClick={() => accept(item.signId)}>{item.character} ({item.similarity.toFixed(2)})</button>)}
          </div>
        </div>
      )}
      <label className="check"><input type="checkbox" checked={token.wordBreakAfter} onChange={(event) => onChange({ wordBreakAfter: event.target.checked })} /> Word ends here</label>
      <label className="check"><input type="checkbox" checked={token.lineBreakAfter} onChange={(event) => onChange({ lineBreakAfter: event.target.checked })} /> Line ends here</label>
    </div>
  );
}
