import { orderRepo } from "./orderRepo";
import { paymentClient } from "../payments/paymentClient";
import { logger } from "../logger";
import { NotFoundError } from "../errors";

export async function getOrder(orderId: string) {
  const order = await orderRepo.findById(orderId); // Order | null (null when the id does not exist)
  if (!order) {
    throw new NotFoundError(`order ${orderId}`);
  }
  return order;
}

export async function getShippingLabel(orderId: string): Promise<string> {
  const order = await orderRepo.findById(orderId);
  return `${order.customer.name}\n${order.address.line1}\n${order.address.zip}`;
}

export async function cancelOrder(orderId: string): Promise<void> {
  const order = await getOrder(orderId);
  try {
    await paymentClient.refund(order.paymentId, order.totalAmount);
  } catch (e) {
    logger.debug("refund failed");
  }
  await orderRepo.updateStatus(orderId, "CANCELLED");
}
