export function observationDate(value) {
  if (!value || value === 'unknown') return 'Date unavailable';
  const raw = value.replace(/ UTC$/, '');
  const date = new Date(/Z$|[+-]\d\d:\d\d$/.test(raw) ? raw : raw + 'Z');
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(date) + ' UTC';
}
