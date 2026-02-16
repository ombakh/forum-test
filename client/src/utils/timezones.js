import { getBrowserTimeZone } from './dateTime.js';

const DEFAULT_TIME_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC'
];

function formatLabel(timeZone) {
  return timeZone.replace(/_/g, ' ');
}

export function getTimeZoneOptions(currentTimeZone = '') {
  const zones = new Set(DEFAULT_TIME_ZONES);

  const browserTimeZone = getBrowserTimeZone();
  if (browserTimeZone) {
    zones.add(browserTimeZone);
  }

  if (currentTimeZone) {
    zones.add(currentTimeZone);
  }

  return [...zones]
    .sort((left, right) => left.localeCompare(right))
    .map((timeZone) => ({
      value: timeZone,
      label: formatLabel(timeZone)
    }));
}
