import { Link } from "react-router-dom";
import { Results } from "../components/Results";
import { useApp } from "../state/AppContext";

export function ResultsPage() {
  const { investigation } = useApp();
  if (!investigation) {
    return (
      <div className="page page-narrow">
        <h1>No result to show</h1>
        <p>Results stay in this tab only, and they are not stored. Start an investigation to see one.</p>
        <Link className="button" to="/investigate">Start an investigation</Link>
      </div>
    );
  }
  return (
    <div className="page">
      <Results {...investigation} />
      <p className="actions"><Link className="button button-quiet" to="/investigate">Start another investigation</Link></p>
    </div>
  );
}
