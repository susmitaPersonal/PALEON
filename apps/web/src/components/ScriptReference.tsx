import type { Claim, ReferenceCharacter, ScriptDetail } from "@scriptecho/contracts";
import { SourceRefs } from "./Sources";

function ClaimRow({ label, claim, detail }: { label: string; claim: Claim | null; detail: ScriptDetail }) {
  return (
    <div className="fact-row">
      <dt>{label}</dt>
      <dd>
        {claim
          ? <>{claim.text} <SourceRefs ids={claim.sourceIds} sources={detail.sources} locator={claim.locator} /></>
          : <span className="unknown">No sourced claim is stored.</span>}
      </dd>
    </div>
  );
}

export function Characters({ characters }: { characters: ReferenceCharacter[] }) {
  return (
    <ul className="character-grid">
      {characters.map((item) => (
        <li key={item.codePoint}>
          <span className="glyph" lang="und" aria-hidden="true">{item.character}</span>
          <span className="glyph-name">{item.name}</span>
          <code>{item.codePoint}</code>
        </li>
      ))}
    </ul>
  );
}

export function ScriptFacts({ detail }: { detail: ScriptDetail }) {
  const { script } = detail;
  return (
    <>
      <dl className="facts">
        <ClaimRow label="Historical period" claim={script.historicalPeriod} detail={detail} />
        <ClaimRow label="Geographic distribution" claim={script.geographicDistribution} detail={detail} />
        <ClaimRow label="Directionality" claim={script.directionality} detail={detail} />
        {script.characteristics.map((claim) => <ClaimRow key={claim.id} label="Characteristic" claim={claim} detail={detail} />)}
        {script.relationships.map((claim) => <ClaimRow key={claim.id} label="Relationship" claim={claim} detail={detail} />)}
      </dl>
      <p className="caveat">A stated relationship comes from its source. Visual similarity alone does not establish descent.</p>
    </>
  );
}
