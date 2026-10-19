const TAU = Math.PI * 2;
const BEATS_PER_SECOND = 8;

export function updateHands(parts, { smooth = true, date = new Date() } = {}) {
  const ms = date.getMilliseconds();
  const seconds = date.getSeconds() + (smooth ? Math.floor((ms / 1000) * BEATS_PER_SECOND) / BEATS_PER_SECOND : 0);
  const minutes = date.getMinutes() + seconds / 60;
  const hours = (date.getHours() % 12) + minutes / 60;

  if (parts.secondHand) parts.secondHand.rotation.z = -(seconds / 60) * TAU;
  if (parts.minuteHand) parts.minuteHand.rotation.z = -(minutes / 60) * TAU;
  if (parts.hourHand) parts.hourHand.rotation.z = -(hours / 12) * TAU;
}
