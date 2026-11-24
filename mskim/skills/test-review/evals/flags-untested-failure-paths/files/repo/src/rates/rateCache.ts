const store = new Map<string, number>();

export const rateCache = {
  get: (currency: string) => store.get(currency),
  set: (currency: string, rate: number) => void store.set(currency, rate),
  clear: () => store.clear(),
};
