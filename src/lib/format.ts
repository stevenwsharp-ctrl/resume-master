// "40" -> "40 hrs/week"; anything already worded is left alone.
export function hoursLabel(hours: string) {
  return /^\d+(\.\d+)?$/.test(hours.trim()) ? `${hours.trim()} hrs/week` : hours
}
