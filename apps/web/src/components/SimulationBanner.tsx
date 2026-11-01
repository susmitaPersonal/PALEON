import { Link } from "react-router-dom";
import { useApp } from "../state/AppContext";

export function SimulationBanner() {
  const { runtime } = useApp();
  if (runtime.data?.inferenceMode === "local") {
    return (
      <div className="simulation-banner" role="note">
        <strong>Local model.</strong> Your image is analysed on this computer by {runtime.data.modelId}. Results are unverified AI observations.{" "}
        <Link to="/transparency">What this means</Link>
      </div>
    );
  }
  if (!runtime.data?.simulated) return null;
  return (
    <div className="simulation-banner" role="note">
      <strong>Demo mode.</strong> Results are simulated fixtures, not AI inference. Your image is not examined.{" "}
      <Link to="/transparency">What this means</Link>
    </div>
  );
}
