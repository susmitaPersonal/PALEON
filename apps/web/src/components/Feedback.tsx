import type { ReactNode } from "react";

export function Loading({ label }: { label: string }) {
  return <p className="status-line" role="status">{label}</p>;
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice notice-error" role="alert">
      <p>{message}</p>
      {onRetry && <button type="button" className="button button-quiet" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="hint">
      <summary>{label}</summary>
      <p>{children}</p>
    </details>
  );
}
