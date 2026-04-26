export async function getJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(details || `HTTP ${response.status}`);
  }

  return response.json();
}
