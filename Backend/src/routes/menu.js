const express = require('express');
const { pool } = require('../db');
const { asyncHandler } = require('../middleware/error');
const { toPaise, toRupees } = require('../money');
const { z, id, parse } = require('../validate');

const router = express.Router();

const shapeItem = r => ({
  foodItemId: r.food_item_id,
  categoryId: r.category_id,
  categoryName: r.category_name,
  name: r.name,
  unitPrice: r.unit_price, // tax exclusive, as displayed on the menu
  gstRate: r.gst_rate,
  priceInclGst: toRupees(toPaise(r.unit_price) + Math.round((toPaise(r.unit_price) * toPaise(r.gst_rate)) / 10000)),
  stockQuantity: r.stock_quantity,
  inStock: r.stock_quantity > 0,
});

router.get('/categories', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT c.category_id, c.name, COUNT(f.food_item_id) AS item_count
       FROM categories c LEFT JOIN food_items f ON f.category_id = c.category_id
      GROUP BY c.category_id, c.name ORDER BY c.category_id`
  );
  res.json({ categories: rows.map(r => ({ categoryId: r.category_id, name: r.name, itemCount: Number(r.item_count) })) });
}));

/** Menu grouped by category. Optional filters: ?categoryId=2  ?q=paneer  ?inStock=true */
router.get('/', asyncHandler(async (req, res) => {
  const q = parse(z.object({
    categoryId: id.optional(),
    q: z.string().trim().max(60).optional(),
    inStock: z.enum(['true', 'false']).optional(),
  }), req.query);

  const where = [];
  const params = [];
  if (q.categoryId) { where.push('f.category_id = ?'); params.push(q.categoryId); }
  if (q.q) { where.push('f.name LIKE ?'); params.push(`%${q.q.replace(/[%_\\]/g, '\\$&')}%`); }
  if (q.inStock === 'true') where.push('f.stock_quantity > 0');

  const [rows] = await pool.query(
    `SELECT f.*, c.name AS category_name
       FROM food_items f JOIN categories c ON c.category_id = f.category_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY f.category_id, f.food_item_id`,
    params
  );
  const items = rows.map(shapeItem);
  const groups = new Map();
  for (const it of items) {
    if (!groups.has(it.categoryId)) groups.set(it.categoryId, { categoryId: it.categoryId, name: it.categoryName, items: [] });
    groups.get(it.categoryId).items.push(it);
  }
  res.set('Cache-Control', 'no-store');
  res.json({ items, categories: [...groups.values()] });
}));

module.exports = router;
