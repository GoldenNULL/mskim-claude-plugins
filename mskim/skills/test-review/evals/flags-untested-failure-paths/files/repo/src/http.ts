export async function httpGet(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`https://rates.internal${path}`);
  return { status: res.status, body: await res.json() };
}
