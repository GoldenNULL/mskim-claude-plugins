/** Formats a KRW amount for display, e.g. 12000 -> "12,000원". */
export function formatKRW(amount: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(Math.round(amount))}원`;
}
