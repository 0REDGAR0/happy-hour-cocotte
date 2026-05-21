export async function apiGet(path: string): Promise<unknown> {
  const response = await fetch(path);
  return response.json();
}
