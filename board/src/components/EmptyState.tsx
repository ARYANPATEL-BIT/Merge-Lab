import type { ReactNode } from "react";

/** Says what is missing, never a blank region. */
export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <p className="empty-title">{title}</p>
      <div className="empty-hint">{hint}</div>
    </div>
  );
}
