import type { Cart } from "./cart";

function formatPrice(amount: number): string {
  return amount.toLocaleString() + "원";
}

export function checkoutSummary(cart: Cart): string[] {
  return [
    `상품 금액: ${formatPrice(cart.subtotal)}`,
    `배송비: ${formatPrice(cart.shippingFee)}`,
    `결제 금액: ${formatPrice(cart.subtotal + cart.shippingFee)}`,
  ];
}
