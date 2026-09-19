import type { Finding } from "@handshake/shared";
import { severityMeta } from "../lib/format.js";
import { EmptyState } from "./EmptyState.js";
import { SeverityIcon, ShieldCheck } from "./icons.js";

export function DriftFeed({ findings }: { findings: Finding[] }) {
  return (
    <section className="panel panel-drift" aria-labelledby="drift-title">
      <header className="panel-head">
        <div className="panel-heading">
          <p className="label">Newest first</p>
          <h2 id="drift-title" className="panel-title">
            Drift feed
          </h2>
        </div>
        <span className="panel-count mono">{findings.length}</span>
      </header>
      <div className="panel-body">
        {findings.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck />}
            title="No drift detected"
            hint="Every branch's contracts agree. New conflicts appear here, newest first."
          />
        ) : (
          <ul className="drift-list">
            {findings.map((f, i) => {
              const sev = severityMeta(f.severity);
              return (
                <li className={`finding ${sev.className}`} key={`${f.rule}-${i}`}>
                  <div className="finding-head">
                    <span className="sev-badge">
                      <SeverityIcon severity={f.severity} />
                      {sev.label}
                    </span>
                    <span className="rule-name mono">{f.rule}</span>
                  </div>
                  <p className="finding-reason">{f.reason}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
