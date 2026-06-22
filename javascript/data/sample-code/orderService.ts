import { z } from 'zod';
import { query, getClient } from './db';
import { AppError } from './errors';
import { logger } from './logger';

export const createOrderSchema = z.object({
  customerId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1, 'Order must contain at least one item'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  totalCents: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: Date;
}

/**
 * Creates a new order for the given customer.
 * Looks up current prices from the products table, calculates total,
 * and inserts the order and its line items atomically.
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Fetch product prices in a single query
    const productIds = input.items.map((i) => i.productId);
    const { rows: products } = await client.query<{ id: string; price_cents: number; name: string }>(
      'SELECT id, price_cents, name FROM products WHERE id = ANY($1)',
      [productIds],
    );

    if (products.length !== productIds.length) {
      const foundIds = new Set(products.map((p) => p.id));
      const missing = productIds.find((id) => !foundIds.has(id));
      throw new AppError('PRODUCT_NOT_FOUND', 404, `Product ${missing} not found`);
    }

    const priceMap = new Map(products.map((p) => [p.id, p.price_cents]));

    const orderItems: OrderItem[] = input.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPriceCents: priceMap.get(item.productId)!,
    }));

    const totalCents = orderItems.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity,
      0,
    );

    const { rows: [order] } = await client.query<{ id: string; created_at: Date }>(
      `INSERT INTO orders (customer_id, total_cents, status)
       VALUES ($1, $2, 'pending')
       RETURNING id, created_at`,
      [input.customerId, totalCents],
    );

    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
         VALUES ($1, $2, $3, $4)`,
        [order.id, item.productId, item.quantity, item.unitPriceCents],
      );
    }

    await client.query('COMMIT');

    logger.info({ orderId: order.id, customerId: input.customerId, totalCents }, 'Order created');

    return {
      id: order.id,
      customerId: input.customerId,
      items: orderItems,
      totalCents,
      status: 'pending',
      createdAt: order.created_at,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
