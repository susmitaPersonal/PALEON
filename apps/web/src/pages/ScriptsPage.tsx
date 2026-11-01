import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { ErrorNotice, Loading } from "../components/Feedback";

export function ScriptsPage() {
  const scripts = useApi(api.scripts, "scripts");
  return (
    <div className="page">
      <h1>Script reference</h1>
      <p className="lead">Each record states only what a stored source says. Fields without a sourced claim stay empty.</p>
      {scripts.loading && <Loading label="Loading scripts" />}
      {scripts.error && <ErrorNotice message={scripts.error} onRetry={scripts.retry} />}
      {scripts.data?.length === 0 && <p>No scripts are in the reference collection yet.</p>}
      {scripts.data && (
        <ul className="script-grid">
          {scripts.data.map((script) => (
            <li key={script.id}>
              <Link to={`/scripts/${script.id}`}>
                <h2>{script.name}</h2>
                {script.alternativeNames.length > 0 && <p>Also: {script.alternativeNames.join(", ")}</p>}
                <p className="source-meta">{script.incompleteFields.length > 0 ? `Incomplete: ${script.incompleteFields.join(", ").toLowerCase()}` : "All core fields sourced"}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
