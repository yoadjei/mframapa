/** Mirrors mobile/src/utils/formatters.ts formatRelativeTime — same shape,
 *  same (deliberately un-translated) short units, so "Updated Xm ago" reads
 *  identically on both platforms. */
export function formatRelativeTime(isoDate) {
  if (!isoDate) return "Unknown";
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
