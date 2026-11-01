import type { Comparison } from "@scriptecho/contracts";
import { api } from "../api/client";
import { useApi } from "../api/useApi";
import { ErrorNotice, Loading } from "./Feedback";
import { Characters } from "./ScriptReference";
import { SourceList, SourceRefs } from "./Sources";

type Heading = "h2" | "h3";

function Points({ title, points, comparison, empty, heading: Title }: { title: string; points: Comparison["shared"]; comparison: Comparison; empty: string; heading: Heading }) {
  return (
    <section>
      <Title>{title}</Title>
      {points.length === 0 ? <p className="unknown">{empty}</p> : (
        <div className="table-scroll" tabIndex={0} role="region" aria-label={title}>
          <table>
            <thead><tr><th scope="col">Topic</th><th scope="col">{comparison.first.name}</th><th scope="col">{comparison.second.name}</th><th scope="col">Sources</th></tr></thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.topic}>
                  <th scope="row">{point.topic}</th><td>{point.first}</td><td>{point.second}</td>
                  <td><SourceRefs ids={point.sourceIds} sources={comparison.sources} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ComparisonView({ first, second, heading: Title = "h3" }: { first: string; second: string; heading?: Heading }) {
  const comparison = useApi(() => api.compare(first, second), `${first}:${second}`);
  if (comparison.loading) return <Loading label="Loading comparison" />;
  if (comparison.error) return <ErrorNotice message={comparison.error} onRetry={comparison.retry} />;
  const data = comparison.data!;
  return (
    <div className="comparison">
      <Points title="Shared characteristics" points={data.shared} comparison={data} empty="No shared characteristic is recorded." heading={Title} />
      <Points title="Differences" points={data.differences} comparison={data} empty="No difference is recorded." heading={Title} />
      <section>
        <Title>Missing evidence</Title>
        {data.missingEvidence.length === 0 ? <p>No gaps were found in the compared fields.</p>
          : <ul>{data.missingEvidence.map((item) => <li key={item}>{item}</li>)}</ul>}
      </section>
      <section className="comparison-characters">
        <div><Title>{data.first.name} reference characters</Title><Characters characters={data.referenceCharacters.first} /></div>
        <div><Title>{data.second.name} reference characters</Title><Characters characters={data.referenceCharacters.second} /></div>
      </section>
      <p className="caveat">{data.caveat}</p>
      {data.sources.length > 0 && <section><Title>Sources</Title><SourceList sources={data.sources} /></section>}
    </div>
  );
}
