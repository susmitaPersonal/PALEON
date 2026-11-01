import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { ErrorNotice, Loading } from "../components/Feedback";
import { Characters, ScriptFacts } from "../components/ScriptReference";
import { SourceList } from "../components/Sources";

export function ScriptDetailPage() {
  const { id = "" } = useParams();
  const detail = useApi(() => api.script(id), id);
  return (
    <div className="page">
      <p><Link to="/scripts">All scripts</Link></p>
      {detail.loading && <Loading label="Loading record" />}
      {detail.error && <ErrorNotice message={detail.error} onRetry={detail.retry} />}
      {detail.data && (
        <>
          <h1>{detail.data.script.name}</h1>
          {detail.data.script.alternativeNames.length > 0 && <p className="lead">Also: {detail.data.script.alternativeNames.join(", ")}</p>}
          <p className="notice">Sources checked by a non-specialist. Not reviewed by an epigrapher.</p>
          {detail.data.incompleteFields.length > 0 && <p className="notice notice-warning">Incomplete record: no sourced claim is stored for {detail.data.incompleteFields.join(", ").toLowerCase()}.</p>}
          <section className="panel panel-source" aria-labelledby="facts-heading">
            <p className="panel-kicker">From the sources</p>
            <h2 id="facts-heading">Reference record</h2>
            <ScriptFacts detail={detail.data} />
          </section>
          <section className="panel" aria-labelledby="characters-heading">
            <h2 id="characters-heading">Reference characters</h2>
            <p>{detail.data.characterNote}</p>
            <Characters characters={detail.data.script.referenceCharacters} />
          </section>
          <section className="panel" aria-labelledby="limits-heading">
            <h2 id="limits-heading">Limitations of this record</h2>
            <ul>{detail.data.script.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section className="panel" aria-labelledby="sources-heading">
            <h2 id="sources-heading">Sources</h2>
            <SourceList sources={detail.data.sources} />
          </section>
        </>
      )}
    </div>
  );
}
