/** Wall-clock parts of an instant in an IANA time zone. */
function parts(instant: number, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  return values;
}
function offset(instant: number, timeZone: string): number {
  const wall = parts(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}
const pad = (value: number) => String(value).padStart(2, '0');

/** An instant as a `datetime-local` value in the organisation's zone. */
export function toZonedInput(iso: string, timeZone: string): string {
  const wall = parts(Date.parse(iso), timeZone);
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}

/**
 * A `datetime-local` value read as wall time in the organisation's zone. Two passes settle
 * daylight-saving edges; a skipped wall time resolves to the instant just after the gap.
 */
export function fromZonedInput(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const first = wall - offset(wall, timeZone);
  return new Date(wall - offset(first, timeZone)).toISOString();
}

/** Midnight at the start of the instant's day in the organisation's zone. */
export function startOfZonedDay(instant: Date, timeZone: string): Date {
  const wall = parts(instant.getTime(), timeZone);
  return new Date(
    fromZonedInput(`${wall.year}-${pad(wall.month)}-${pad(wall.day)}T00:00`, timeZone)!,
  );
}

export function formatZoned(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone }).format(Date.parse(iso));
}
