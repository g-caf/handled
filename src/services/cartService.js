import { pool } from '../config/db.js';

export async function getCart() {
  const result = await pool.query(
    'SELECT * FROM cart_items ORDER BY created_at DESC'
  );
  return result.rows;
}

export async function addItem({ name, quantity, search_terms }) {
  const result = await pool.query(
    `INSERT INTO cart_items (name, quantity, search_terms)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, quantity || 1, search_terms || null]
  );
  return result.rows[0];
}

export async function removeItem(id) {
  const result = await pool.query(
    'DELETE FROM cart_items WHERE id = $1 RETURNING *',
    [id]
  );
  return result.rows[0];
}
