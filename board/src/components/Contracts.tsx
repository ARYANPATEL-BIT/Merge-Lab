import type { ReactNode } from "react";
import type { Contract } from "@mergelab/shared";
import { originLabel, shapeInline, statusClassName } from "../lib/format.js";
import { EmptyState } from "./EmptyState.js";
import { InboxIcon } from "./icons.js";

function groupByBranch(contracts: Contract[]): Array<[string, Contract[]]> {
  const map = new Map<string, Contract[]>();
  for (const c of contracts) {
    const bucket = map.get(c.branch);
    if (bucket) bucket.push(c);
    else map.set(c.branch, [c]);
  }
  return [...map.entries()];
}

export function Contracts({
  contracts,
  emptyTitle,
  emptyHint,
}: {
  contracts: Contract[];
  emptyTitle?: string;
  emptyHint?: ReactNode;
}) {
  const groups = groupByBranch(contracts);
  return (
    <section className="panel" aria-labelledby="contracts-title">
      <header className="panel-head">
        <div className="panel-heading">
          <p className="label">Grouped by branch</p>
          <h2 id="contracts-title" className="panel-title">
            Contracts
          </h2>
        </div>
        <span className="panel-count mono">{contracts.length}</span>
      </header>
      <div className="panel-body">
        {contracts.length === 0 ? (
          <EmptyState
            icon={<InboxIcon />}
            title={emptyTitle || "No contracts declared"}
            hint={
              emptyHint ||
              "Contracts appear as teammates publish their working-tree declarations."
            }
          />
        ) : (
          groups.map(([branch, items]) => (
            <div className="contract-group" key={branch}>
              <h3 className="group-head mono">{branch}</h3>
              <ul className="contract-list">
                {items.map((c) => (
                  <li className="contract" key={c.contract_id}>
                    <div className="contract-top">
                      <span className="kind-tag">{c.kind}</span>
                      <span className="contract-symbol mono">{c.symbol}</span>
                      <span className={`status-badge ${statusClassName(c.status)}`}>
                        {c.status}
                      </span>
                    </div>
                    {c.signature ? (
                      <code className="contract-sig mono">{c.signature}</code>
                    ) : null}
                    {c.shape ? (
                      <code className="contract-shape mono">{shapeInline(c.shape)}</code>
                    ) : null}
                    <div className="contract-foot">
                      <span className="version mono">v{c.version}</span>
                      <span
                        className={`origin origin-${c.origin === "working_tree" ? "wt" : "inf"}`}
                      >
                        {originLabel(c.origin)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
