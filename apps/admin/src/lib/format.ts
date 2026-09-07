/** Format an ISO-8601 date string to a human-readable short date. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format an ISO-8601 date string to a human-readable datetime. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
