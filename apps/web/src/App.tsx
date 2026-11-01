import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { CasePage } from "./pages/CasePage";
import { CasesPage } from "./pages/CasesPage";
import { ComparePage } from "./pages/ComparePage";
import { HomePage } from "./pages/HomePage";
import { InvestigatePage } from "./pages/InvestigatePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ResultsPage } from "./pages/ResultsPage";
import { ScriptDetailPage } from "./pages/ScriptDetailPage";
import { ScriptsPage } from "./pages/ScriptsPage";
import { TransparencyPage } from "./pages/TransparencyPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="investigate" element={<InvestigatePage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="cases" element={<CasesPage />} />
        <Route path="cases/:id" element={<CasePage />} />
        <Route path="scripts" element={<ScriptsPage />} />
        <Route path="scripts/:id" element={<ScriptDetailPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="transparency" element={<TransparencyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
