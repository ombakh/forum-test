export function parseServerTimestamp(value) {
  if (value == null || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const sqliteDateTimePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  const sqliteDateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

  let normalized = raw;
  if (sqliteDateTimePattern.test(raw)) {
    normalized = raw.replace(' ', 'T') + 'Z';
  } else if (sqliteDateOnlyPattern.test(raw)) {
    normalized = `${raw}T00:00:00Z`;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isValidTimeZone(timeZone) {
  if (!timeZone) {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch (_error) {
    return false;
  }
}

export function getBrowserTimeZone() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimeZone(zone) ? zone : '';
}

export function resolveTimeZone(preferredTimeZone) {
  if (isValidTimeZone(preferredTimeZone)) {
    return preferredTimeZone;
  }
  return getBrowserTimeZone() || undefined;
}

export function formatDateTime(value, preferredTimeZone, options = {}) {
  const date = parseServerTimestamp(value);
  if (!date) {
    return '—';
  }

  const timeZone = resolveTimeZone(preferredTimeZone);
  const formatOptions = {
    ...options,
    ...(timeZone ? { timeZone } : {})
  };

  return date.toLocaleString(undefined, formatOptions);
}

export function formatDate(value, preferredTimeZone, options = {}) {
  const date = parseServerTimestamp(value);
  if (!date) {
    return '—';
  }

  const timeZone = resolveTimeZone(preferredTimeZone);
  const formatOptions = {
    ...options,
    ...(timeZone ? { timeZone } : {})
  };

  return date.toLocaleDateString(undefined, formatOptions);
}
