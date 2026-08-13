export function formatLabel(value, fallback = 'Not available') {
  if (!value) return fallback;
  return String(value).replaceAll('-', ' ');
}

export function formatDateTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString();
}

export function sessionScore(item) {
  return item?.summary?.averageMetrics?.overall ?? null;
}

export function sessionTitle(item) {
  if (!item) return 'Interview session';
  const role = formatLabel(item.role, 'Interview');
  return item.candidateName ? `${item.candidateName} - ${role}` : role;
}
