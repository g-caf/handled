import { Router } from 'express';
import * as cartService from '../services/cartService.js';

const router = Router();

router.get('/cart', async (req, res) => {
  const items = await cartService.getCart();
  res.render('cart', { title: 'Cart', items });
});

router.post('/cart/items', async (req, res) => {
  const { name, quantity, search_terms } = req.body;
  await cartService.addItem({ name, quantity: parseInt(quantity) || 1, search_terms });
  res.redirect('/cart');
});

router.delete('/cart/items/:id', async (req, res) => {
  await cartService.removeItem(req.params.id);
  res.json({ success: true });
});

router.post('/cart/items/:id/delete', async (req, res) => {
  await cartService.removeItem(req.params.id);
  res.redirect('/cart');
});

export default router;
