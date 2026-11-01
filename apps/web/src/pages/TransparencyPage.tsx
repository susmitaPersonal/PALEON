import type { InferenceMode } from "@scriptecho/contracts";
import { ErrorNotice, Loading } from "../components/Feedback";
import { useApp } from "../state/AppContext";

const MODE_TEXT: Record<InferenceMode, string> = {
  simulated: "Demo mode: simulated fixtures",
  local: "Genuine inference by a local model on this computer",
  external: "Third-party model inference",
};

export function TransparencyPage() {
  const { runtime } = useApp();
  return (
    <div className="page page-narrow">
      <h1>Research transparency</h1>
      <p className="lead">What PALEON knows, how it knows it, and what has not been tested.</p>

      <section aria-labelledby="runtime-heading">
        <h2 id="runtime-heading">Current configuration</h2>
        {runtime.loading && <Loading label="Loading configuration" />}
        {runtime.error && <ErrorNotice message={runtime.error} onRetry={runtime.retry} />}
        {runtime.data && (
          <dl className="facts">
            <div className="fact-row"><dt>Mode</dt><dd>{MODE_TEXT[runtime.data.inferenceMode]}</dd></div>
            <div className="fact-row"><dt>Provider</dt><dd>{runtime.data.provider}</dd></div>
            <div className="fact-row"><dt>Model</dt><dd>{runtime.data.modelId}</dd></div>
            {runtime.data.modelDetails && <div className="fact-row"><dt>Model details</dt><dd>{[runtime.data.modelDetails.family, runtime.data.modelDetails.parameterSize, runtime.data.modelDetails.quantization].filter(Boolean).join(", ")}</dd></div>}
            <div className="fact-row"><dt>Prompt version</dt><dd>{runtime.data.promptVersion}</dd></div>
            <div className="fact-row"><dt>Reference version</dt><dd>{runtime.data.referenceVersion}</dd></div>
            <div className="fact-row"><dt>External inference</dt><dd>{runtime.data.externalInferenceEnabled ? "Enabled" : "Disabled. No image leaves this machine"}</dd></div>
          </dl>
        )}
      </section>

      <section aria-labelledby="demo-heading">
        <h2 id="demo-heading">What demo mode means</h2>
        <p>In demo mode, PALEON does not examine your image. It returns one of a few fixed example responses, so that the interface can be explored without a paid service. The same image always gets the same example. These are not findings about your image.</p>
      </section>

      <section aria-labelledby="sources-heading">
        <h2 id="sources-heading">Observations and sources</h2>
        <ul>
          <li><strong>AI observations</strong> describe an image, and they are not verified.</li>
          <li><strong>Reference records</strong> come from stored sources that were read directly. They were checked by a non-specialist, and no epigrapher has reviewed them.</li>
          <li>Displayed history comes only from stored records, because a model has no field for it. Its free text is filtered: statements that look like dates, links, or citations are removed, and evidence must describe something visible. These filters are a backstop and can miss a historical claim, so all model text stays labelled as an unverified AI observation.</li>
        </ul>
      </section>

      <section aria-labelledby="evaluation-heading">
        <h2 id="evaluation-heading">Evaluation status</h2>
        <p><strong>No real model has been evaluated, so PALEON makes no accuracy claim.</strong> A development dataset of 34 accepted images and an offline harness exist. The dataset is a small convenience sample, it is not representative of historical writing systems worldwide, and most images come from one museum.</p>
      </section>

      <section aria-labelledby="capabilities-heading">
        <h2 id="capabilities-heading">Separate capabilities</h2>
        <p>Identifying a script is not reading it. A script does not determine a language. The quick analysis does not transcribe, transliterate, or translate. In a research case, a person confirms each reading, rules produce the transliteration, and a sourced word list offers glosses. No model reads the text, and the glosses are not a translation.</p>
      </section>

      <section aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">Your images</h2>
        <p>The quick analysis processes uploads in memory and does not store them, and its results disappear when you leave or reload the page. A research case is different: when you create one, its image and readings are saved on this machine until you delete them.</p>
      </section>
    </div>
  );
}
