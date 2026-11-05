import { OS_STATUS, type OsStatus } from "../lib/types";

export function StatusBadge({ status }: { status: OsStatus }) {
  const s = OS_STATUS[status];
  return <span className={`badge badge-${s.tone}`}>{s.label}</span>;
}
