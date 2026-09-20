import type { BranchSummary } from "@handshake/shared";
import { relativeTime } from "../lib/format.js";
import { EmptyState } from "./EmptyState.js";
import { InboxIcon } from "./icons.js";

export function Branches({
  branches,
  nowMs,
}: {
  branches: BranchSummary[];
  nowMs: number;
}) {
  return (
    <section className="panel" aria-labelledby="branches-title">
      <header className="panel-head">
        <div className="panel-heading">
          <p className="label">Reporting now</p>
          <h2 id="branches-title" className="panel-title">
            Branches
          </h2>
        </div>
        <span className="panel-count mono">{branches.length}</span>
      </header>
      <div className="panel-body">
        {branches.length === 0 ? (
          <EmptyState
            icon={<InboxIcon />}
            title="No branches reporting"
            hint="Run the CLI publish from a working tree and its branch shows up here."
          />
        ) : (
          <ul className="branch-list">
            {branches.map((b) => (
              <li
                key={b.branch}
                className={`branch ${b.status === "dormant" ? "is-dormant" : "is-active"}`}
              >
                <span className={`dot dot-${b.status}`} aria-hidden={true} />
                <div className="branch-main">
                  <span className="branch-name mono">{b.branch}</span>
                  <span className="branch-owner">{b.owner}</span>
                </div>
                <div className="branch-meta">
                  <span className="branch-count">
                    <strong>{b.contract_count}</strong>{" "}
                    {b.contract_count === 1 ? "contract" : "contracts"}
                  </span>
                  <span className={`branch-status label-${b.status}`}>
                    {b.status === "active" ? "active" : "not reporting"}
                  </span>
                  <span className="branch-time">{relativeTime(b.last_reported, nowMs)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
