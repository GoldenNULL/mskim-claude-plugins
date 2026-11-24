import { httpGet } from "../http";
import { rateCache } from "./rateCache";

export class RateUnavailableError extends Error {}

export async function getRate(currency: string): Promise<number> {
  try {
    const res = await httpGet(`/rates/${currency}`);
    if (res.status !== 200) {
      throw new RateUnavailableError(`status ${res.status}`);
    }
    rateCache.set(currency, res.body.rate);
    return res.body.rate;
  } catch (e) {
    const cached = rateCache.get(currency);
    if (cached !== undefined) {
      return cached;
    }
    throw e instanceof RateUnavailableError ? e : new RateUnavailableError(String(e));
  }
}
