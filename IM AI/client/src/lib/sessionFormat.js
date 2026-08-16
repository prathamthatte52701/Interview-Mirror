export function formatLabel(value, fallback = 'Not available') {
  if (!value) return fallback;
  return String(value).replaceAll('-', ' ');
}

export function formatDateTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  const formatted = date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
  return `${formatted} IST`;
}

export function sessionScore(item) {
  return item?.summary?.averageMetrics?.overall ?? null;
}

export function sessionTitle(item) {
  if (!item) return 'Interview session';
  const role = formatLabel(item.role, 'Interview');
  return item.candidateName ? `${item.candidateName} - ${role}` : role;
}
