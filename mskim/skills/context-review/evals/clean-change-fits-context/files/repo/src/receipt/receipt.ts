import { formatKRW } from "../utils/money";

export interface Receipt {
  subtotal: number;
  shippingFee: number;
}

export function receiptLines(r: Receipt): string[] {
  return [
    `상품 금액  ${formatKRW(r.subtotal)}`,
    `배송비    ${formatKRW(r.shippingFee)}`,
    `합계     ${formatKRW(r.subtotal + r.shippingFee)}`,
  ];
}
