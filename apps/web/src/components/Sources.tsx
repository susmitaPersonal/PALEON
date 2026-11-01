import type { SourceRecord } from "@scriptecho/contracts";

export function SourceList({ sources }: { sources: SourceRecord[] }) {
  return (
    <ol className="source-list">
      {sources.map((source) => (
        <li key={source.id} id={`source-${source.id}`}>
          <cite>{source.title}</cite>. {source.publisher}, {source.year}.{" "}
          <a href={source.url} target="_blank" rel="noreferrer noopener">View source<span className="visually-hidden"> (opens in a new tab)</span></a>
          <span className="source-meta"> Accessed {source.accessedOn}.</span>
        </li>
      ))}
    </ol>
  );
}

export function SourceRefs({ ids, sources, locator }: { ids: string[]; sources: SourceRecord[]; locator?: string }) {
  return (
    <span className="source-ref">
      {ids.map((id) => {
        const index = sources.findIndex((source) => source.id === id);
        return <a key={id} href={`#source-${id}`} aria-label={`Source ${index + 1}`}>[{index + 1}]</a>;
      })}
      {locator && <span className="source-meta"> {locator}</span>}
    </span>
  );
}
