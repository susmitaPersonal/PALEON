import { useEffect, useState } from "react";
import type { ResearchCase, SignInventory } from "@scriptecho/contracts";
import { research } from "../api/client";
import { useApi } from "../api/useApi";
import { ErrorNotice, Loading } from "../components/Feedback";

const STATE_LABELS = { matched: "One lexical match", ambiguous: "Several lexical matches", no_lexical_match: "No lexical match", unreadable: "Not readable", too_many_alternatives: "Too many alternatives" };

export function ReadingPanels({ record, inventory }: { record: ResearchCase; inventory: SignInventory }) {
  const [scheme, setScheme] = useState("conventional");
  useEffect(() => setScheme("conventional"), [inventory.scriptId]);
  const key = `${record.id}:${record.revision}`;
  const reading = useApi(() => research.transliteration(record.id, scheme), `${key}:${scheme}`);
  const hypothesis = useApi(() => research.translation(record.id), key);

  return (
    <>
      <section className="panel" aria-labelledby="reading-heading">
        <p className="panel-kicker">Rule-based</p>
        <h2 id="reading-heading">Transliteration</h2>
        <label className="field">Notation
          <select value={scheme} onChange={(event) => setScheme(event.target.value)}>
            {inventory.schemes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        {reading.loading && <Loading label="Building transliteration" />}
        {reading.error && <ErrorNotice message={reading.error} onRetry={reading.retry} />}
        {reading.data && (
          <>
            <pre className="reading">{reading.data.text || "No signs yet."}</pre>
            <p className="source-meta">{reading.data.notation}</p>
            <p className="source-meta">Signs not read with certainty: {reading.data.unresolvedTokens}</p>
          </>
        )}
      </section>
      <section className="panel panel-source" aria-labelledby="gloss-heading">
        <p className="panel-kicker">Source-derived, unverified</p>
        <h2 id="gloss-heading">Translation hypotheses</h2>
        {hypothesis.loading && <Loading label="Looking up words" />}
        {hypothesis.error && <ErrorNotice message={hypothesis.error} onRetry={hypothesis.retry} />}
        {hypothesis.data && (
          <>
            <p>{hypothesis.data.status === "language_not_established" ? "No language is set, so nothing is translated." : `Words with a lexical match: ${hypothesis.data.matchedWords}. Without one: ${hypothesis.data.unmatchedWords}.`}</p>
            <ul className="word-list">
              {hypothesis.data.words.map((word) => (
                <li key={word.tokenIds.join("-") || word.transliteration}>
                  <strong>{word.transliteration}</strong> <span className="source-meta">{STATE_LABELS[word.state]}</span>
                  {word.matches.length > 0 && <ul>{word.matches.map((match) => <li key={match.entryId}>{match.lemma} ({match.partOfSpeech}): {match.gloss} <span className="source-meta">{match.locator}</span></li>)}</ul>}
                </li>
              ))}
            </ul>
            <ul>{hypothesis.data.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul>
            {hypothesis.data.sources.map((source) => <p className="source-meta" key={source.id}><a href={source.url} rel="noreferrer">{source.title}</a>. {source.reuseNote}</p>)}
          </>
        )}
      </section>
    </>
  );
}
