export function formatCurrentTime(locale = "it-IT") {
  return new Date().toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
