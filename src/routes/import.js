import { Router } from 'express';
import { getSession, saveSession } from '../services/sessionService.js';
import { addItem } from '../services/cartService.js';
import { acquireSlot, releaseSlot } from '../worker/rateLimiter.js';
import { fetchUberEatsOrderHistory, fetchDoorDashOrderHistory, extractUniqueItemsFromOrders } from '../worker/agents/orderHistoryAgent.js';

const router = Router();

// Store fetched suggestions in memory (per session)
const suggestionsCache = new Map();

router.get('/import', async (req, res) => {
  const sessionId = req.session.id;
  const cached = suggestionsCache.get(sessionId);

  res.render('import', {
    title: 'Import Past Orders',
    suggestions: cached?.suggestions || [],
    orders: cached?.orders || [],
    lastFetched: cached?.fetchedAt || null,
    error: null,
  });
});

router.post('/import/fetch', async (req, res) => {
  const { platform } = req.body;
  const sessionId = req.session.id;

  if (!['ubereats', 'doordash', 'both'].includes(platform)) {
    return res.status(400).send('Invalid platform');
  }

  try {
    const allOrders = [];
    const errors = [];

    const platformsToFetch = platform === 'both'
      ? ['ubereats', 'doordash']
      : [platform];

    for (const p of platformsToFetch) {
      const session = await getSession(p);
      if (!session) {
        errors.push(`No session for ${p}. Please connect it first.`);
        continue;
      }

      const slot = await acquireSlot(p);
      if (!slot.allowed) {
        errors.push(`${p}: ${slot.reason}`);
        continue;
      }

      try {
        const storageState = typeof session.storageState === 'string'
          ? JSON.parse(session.storageState)
          : session.storageState;

        let result;
        if (p === 'ubereats') {
          result = await fetchUberEatsOrderHistory(storageState);
        } else {
          result = await fetchDoorDashOrderHistory(storageState);
        }

        if (result.error) {
          releaseSlot(p, false, true);
          errors.push(`${p}: ${result.error}`);
        } else {
          releaseSlot(p, true, false);
          allOrders.push(...result.orders);

          if (result.updatedStorageState) {
            await saveSession(p, result.updatedStorageState);
          }
        }
      } catch (err) {
        releaseSlot(p, false, false);
        errors.push(`${p}: ${err.message}`);
      }
    }

    const suggestions = extractUniqueItemsFromOrders(allOrders);

    suggestionsCache.set(sessionId, {
      suggestions,
      orders: allOrders,
      fetchedAt: new Date().toISOString(),
    });

    res.render('import', {
      title: 'Import Past Orders',
      suggestions,
      orders: allOrders,
      lastFetched: new Date().toISOString(),
      error: errors.length > 0 ? errors.join('; ') : null,
    });
  } catch (err) {
    console.error('Import fetch error:', err);
    res.render('import', {
      title: 'Import Past Orders',
      suggestions: [],
      orders: [],
      lastFetched: null,
      error: err.message,
    });
  }
});

router.post('/import/add', async (req, res) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).send('No items selected');
  }

  try {
    for (const itemName of items) {
      if (itemName && typeof itemName === 'string') {
        await addItem({ name: itemName.trim(), quantity: 1, search_terms: null });
      }
    }

    res.redirect('/cart');
  } catch (err) {
    console.error('Import add error:', err);
    res.status(500).send('Error adding items');
  }
});

export default router;
