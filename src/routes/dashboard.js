import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

router.get('/dashboard', async (req, res) => {
  const result = await pool.query(`
    SELECT 
      ci.id as cart_item_id,
      ci.name as item_name,
      ci.quantity,
      pr.id as result_id,
      pr.store,
      pr.product_name,
      pr.price,
      pr.unit_price,
      pr.url,
      pr.checked_at
    FROM cart_items ci
    LEFT JOIN price_results pr ON ci.id = pr.cart_item_id
    ORDER BY ci.name, pr.price ASC NULLS LAST
  `);

  const itemsMap = new Map();
  for (const row of result.rows) {
    if (!itemsMap.has(row.cart_item_id)) {
      itemsMap.set(row.cart_item_id, {
        id: row.cart_item_id,
        name: row.item_name,
        quantity: row.quantity,
        results: []
      });
    }
    if (row.result_id) {
      itemsMap.get(row.cart_item_id).results.push({
        store: row.store,
        product_name: row.product_name,
        price: row.price,
        unit_price: row.unit_price,
        url: row.url,
        checked_at: row.checked_at
      });
    }
  }

  const items = Array.from(itemsMap.values());
  res.render('dashboard', { title: 'Dashboard', items });
});

export default router;
