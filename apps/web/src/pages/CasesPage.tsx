import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiClientError, research } from "../api/client";
import { useApi } from "../api/useApi";
import { ErrorNotice, Loading } from "../components/Feedback";

export function CasesPage() {
  const cases = useApi(research.cases, "cases");
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await research.create(new FormData(event.currentTarget));
      navigate(`/cases/${created.id}`);
    } catch (failure) {
      setError(failure instanceof ApiClientError ? failure.message : "The case could not be created.");
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1>Research cases</h1>
      <p className="lead">A case keeps one inscription, its signs, your corrections, and its history. Cases and images stay on this machine.</p>
      <form className="panel case-form" onSubmit={create}>
        <h2>New case</h2>
        <label className="field">Inscription image<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
        <label className="field">Title<input name="title" required maxLength={200} /></label>
        <label className="field">Where the image came from<input name="sourceDescription" maxLength={1000} /></label>
        <label className="field">Rights and licence<input name="rights" maxLength={1000} /></label>
        <button className="button" type="submit" disabled={busy}>{busy ? "Saving" : "Create case"}</button>
        {error && <ErrorNotice message={error} />}
      </form>
      <h2 className="section-space">Your cases</h2>
      {cases.loading && <Loading label="Loading cases" />}
      {cases.error && <ErrorNotice message={cases.error} onRetry={cases.retry} />}
      {cases.data?.length === 0 && <p>No cases yet.</p>}
      {cases.data && cases.data.length > 0 && (
        <ul className="script-grid">
          {cases.data.map((item) => (
            <li key={item.id}>
              <Link to={`/cases/${item.id}`}>
                <h3>{item.title}</h3>
                <p className="source-meta">{item.tokens} signs · {item.reviewState.replaceAll("_", " ")}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
