import { getRate } from "../src/rates/getRate";
import { httpGet } from "../src/http";
import { rateCache } from "../src/rates/rateCache";

jest.mock("../src/http");

describe("getRate", () => {
  beforeEach(() => rateCache.clear());

  it("returns the rate from the API and caches it", async () => {
    (httpGet as jest.Mock).mockResolvedValue({ status: 200, body: { rate: 1350.5 } });

    await expect(getRate("USD")).resolves.toBe(1350.5);
    expect(rateCache.get("USD")).toBe(1350.5);
  });
});
