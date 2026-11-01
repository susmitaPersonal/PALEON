import { useState } from "react";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { ComparisonView } from "../components/ComparisonView";
import { ErrorNotice, Loading } from "../components/Feedback";

export function ComparePage() {
  const scripts = useApi(api.scripts, "scripts");
  const [first, setFirst] = useState("brahmi");
  const [second, setSecond] = useState("kharosthi");
  return (
    <div className="page">
      <h1>Compare scripts</h1>
      <p className="lead">Compares stored, sourced characteristics. Gaps are shown as missing evidence, and nothing is inferred.</p>
      {scripts.loading && <Loading label="Loading scripts" />}
      {scripts.error && <ErrorNotice message={scripts.error} onRetry={scripts.retry} />}
      {scripts.data && (
        <>
          <div className="compare-controls">
            {([["First script", first, setFirst], ["Second script", second, setSecond]] as const).map(([label, value, set]) => (
              <label className="field" key={label}>
                <span>{label}</span>
                <select value={value} onChange={(event) => set(event.target.value)}>
                  {scripts.data!.map((script) => <option key={script.id} value={script.id}>{script.name}</option>)}
                </select>
              </label>
            ))}
          </div>
          {first === second ? <p className="notice">Choose two different scripts.</p> : <ComparisonView first={first} second={second} heading="h2" />}
        </>
      )}
    </div>
  );
}
