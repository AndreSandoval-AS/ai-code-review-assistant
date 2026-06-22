import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from './db';
import { AppError } from './errors';

const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().optional(),
});

export async function listProducts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = listProductsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new AppError('VALIDATION_ERROR', 400, 'Invalid query parameters'));
      return;
    }

    const { page, limit, category } = parsed.data;
    const offset = (page - 1) * limit;

    const params: unknown[] = [limit, offset];
    let whereClause = '';
    if (category) {
      params.push(category);
      whereClause = `WHERE category = $${params.length}`;
    }

    const { rows } = await query<{ id: string; name: string; price_cents: number; category: string }>(
      `SELECT id, name, price_cents, category FROM products ${whereClause} ORDER BY name LIMIT $1 OFFSET $2`,
      params,
    );

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM products ${whereClause}`,
      category ? [category] : [],
    );

    res.json({
      data: rows,
      meta: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count, 10),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { rows } = await query<{ id: string; name: string; price_cents: number; category: string; description: string }>(
      'SELECT id, name, price_cents, category, description FROM products WHERE id = $1',
      [id],
    );

    if (rows.length === 0) {
      next(new AppError('PRODUCT_NOT_FOUND', 404, `Product ${id} not found`));
      return;
    }

    res.json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
}
