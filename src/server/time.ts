/** Business days are Cairo days: "today", overdue and due-today are evaluated in Africa/Cairo. */
const cairoDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Cairo as YYYY-MM-DD. */
export function todayInCairo(now = new Date()): string {
  return cairoDate.format(now);
}
