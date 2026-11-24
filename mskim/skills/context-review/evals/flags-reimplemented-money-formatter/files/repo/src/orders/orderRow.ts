import { formatKRW } from "../utils/money";

export function orderRow(order: { id: string; total: number }): string {
  return `${order.id}  ${formatKRW(order.total)}`;
}
