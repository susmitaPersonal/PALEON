import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { ErrorNotice, Loading } from "../components/Feedback";
import { useApp } from "../state/AppContext";

export function HomePage() {
  const scripts = useApi(api.scripts, "scripts");
  const { runtime } = useApp();
  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Evidence before explanation</p>
        <h1>Investigate an unfamiliar inscription</h1>
        <p className="lead">ScriptEcho reports what is visible in an image, names up to three candidate writing systems with the evidence for and against each, and links them to sourced reference records. When an image does not support a conclusion, it says so.</p>
        <Link className="button" to="/investigate">Start an investigation</Link>
      </section>

      <div className="two-column">
        <section>
          <h2>Research scope</h2>
          {scripts.loading && <Loading label="Loading scripts" />}
          {scripts.error && <ErrorNotice message={scripts.error} onRetry={scripts.retry} />}
          {scripts.data && <ul className="script-chips">{scripts.data.map((script) => <li key={script.id}><Link to={`/scripts/${script.id}`}>{script.name}</Link></li>)}</ul>}
          {runtime.data && <p>Planned evaluation also checks that a model declines: {runtime.data.rejectionClasses.join(", ")}.</p>}
          <p>This is an initial research scope, and new writing systems are added as reviewed records.</p>
        </section>
        <section>
          <h2>What it does not do</h2>
          <ul>
            <li>It does not transcribe, transliterate, or translate.</li>
            <li>It does not identify the language of a text.</li>
            <li>It shows no percentages, because model confidence is not a calibrated probability.</li>
            <li>It has not been evaluated on a real model, so no accuracy is claimed.</li>
            <li>It does not authenticate, date, or value objects.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
