import { Router } from 'express';
import { getSession, saveSession } from '../services/sessionService.js';
import { acquireSlot, releaseSlot } from '../worker/rateLimiter.js';
import { fetchUberEatsOrderHistory, fetchDoorDashOrderHistory, extractUniqueItemsFromOrders } from '../worker/agents/orderHistoryAgent.js';
import { addToUberEatsCart, addToDoorDashCart } from '../worker/agents/addToCartAgent.js';

const router = Router();

// In-memory store for user's shopping state
const userState = new Map();

function getOrCreateUserState(sessionId) {
  if (!userState.has(sessionId)) {
    userState.set(sessionId, {
      suggestions: [],
      orders: [],
      selectedItems: new Map(), // itemName -> { quantity, platform, storeUrl }
      lastFetched: null,
    });
  }
  return userState.get(sessionId);
}

router.get('/shop', async (req, res) => {
  const state = getOrCreateUserState(req.session.id);

  res.render('shop', {
    title: 'Shop',
    suggestions: state.suggestions,
    selectedItems: Array.from(state.selectedItems.entries()).map(([name, data]) => ({ name, ...data })),
    lastFetched: state.lastFetched,
    error: null,
    message: null,
  });
});

router.post('/shop/fetch-history', async (req, res) => {
  const state = getOrCreateUserState(req.session.id);
  const errors = [];
  const allOrders = [];

  for (const platform of ['ubereats', 'doordash']) {
    const session = await getSession(platform);
    if (!session) continue;

    const slot = await acquireSlot(platform);
    if (!slot.allowed) {
      errors.push(`${platform}: ${slot.reason}`);
      continue;
    }

    try {
      const storageState = typeof session.storageState === 'string'
        ? JSON.parse(session.storageState)
        : session.storageState;

      const result = platform === 'ubereats'
        ? await fetchUberEatsOrderHistory(storageState)
        : await fetchDoorDashOrderHistory(storageState);

      if (result.error) {
        releaseSlot(platform, false, true);
        errors.push(`${platform}: ${result.error}`);
      } else {
        releaseSlot(platform, true, false);
        allOrders.push(...result.orders);
        if (result.updatedStorageState) {
          await saveSession(platform, result.updatedStorageState);
        }
      }
    } catch (err) {
      releaseSlot(platform, false, false);
      errors.push(`${platform}: ${err.message}`);
    }
  }

  state.suggestions = extractUniqueItemsFromOrders(allOrders);
  state.orders = allOrders;
  state.lastFetched = new Date().toISOString();

  res.render('shop', {
    title: 'Shop',
    suggestions: state.suggestions,
    selectedItems: Array.from(state.selectedItems.entries()).map(([name, data]) => ({ name, ...data })),
    lastFetched: state.lastFetched,
    error: errors.length > 0 ? errors.join('; ') : null,
    message: `Found ${state.suggestions.length} items from ${allOrders.length} orders`,
  });
});

router.post('/shop/select', async (req, res) => {
  const state = getOrCreateUserState(req.session.id);
  const { itemName, quantity, platform, storeUrl } = req.body;

  if (itemName) {
    state.selectedItems.set(itemName, {
      quantity: parseInt(quantity) || 1,
      platform: platform || null,
      storeUrl: storeUrl || null,
    });
  }

  res.redirect('/shop');
});

router.post('/shop/remove', async (req, res) => {
  const state = getOrCreateUserState(req.session.id);
  const { itemName } = req.body;

  if (itemName) {
    state.selectedItems.delete(itemName);
  }

  res.redirect('/shop');
});

router.post('/shop/update-quantity', async (req, res) => {
  const state = getOrCreateUserState(req.session.id);
  const { itemName, quantity } = req.body;

  if (itemName && state.selectedItems.has(itemName)) {
    const item = state.selectedItems.get(itemName);
    item.quantity = parseInt(quantity) || 1;
  }

  res.redirect('/shop');
});

router.post('/shop/checkout/:platform', async (req, res) => {
  const state = getOrCreateUserState(req.session.id);
  const { platform } = req.params;
  const { storeUrl } = req.body;

  if (!['ubereats', 'doordash'].includes(platform)) {
    return res.status(400).send('Invalid platform');
  }

  const session = await getSession(platform);
  if (!session) {
    return res.render('shop', {
      title: 'Shop',
      suggestions: state.suggestions,
      selectedItems: Array.from(state.selectedItems.entries()).map(([name, data]) => ({ name, ...data })),
      lastFetched: state.lastFetched,
      error: `No session for ${platform}. Please connect it first.`,
      message: null,
    });
  }

  const slot = await acquireSlot(platform);
  if (!slot.allowed) {
    return res.render('shop', {
      title: 'Shop',
      suggestions: state.suggestions,
      selectedItems: Array.from(state.selectedItems.entries()).map(([name, data]) => ({ name, ...data })),
      lastFetched: state.lastFetched,
      error: slot.reason,
      message: null,
    });
  }

  try {
    const storageState = typeof session.storageState === 'string'
      ? JSON.parse(session.storageState)
      : session.storageState;

    const items = Array.from(state.selectedItems.entries()).map(([name, data]) => ({
      name,
      quantity: data.quantity,
    }));

    let result;
    if (platform === 'ubereats') {
      result = await addToUberEatsCart(storageState, storeUrl, items);
    } else {
      result = await addToDoorDashCart(storageState, storeUrl, items);
    }

    releaseSlot(platform, !result.error, !!result.error);

    if (result.updatedStorageState) {
      await saveSession(platform, result.updatedStorageState);
    }

    // Clear successfully added items
    for (const itemName of result.addedItems || []) {
      state.selectedItems.delete(itemName);
    }

    const message = result.addedItems?.length
      ? `Added ${result.addedItems.length} items to ${platform} cart`
      : null;
    const error = result.failedItems?.length
      ? `Failed to add: ${result.failedItems.join(', ')}`
      : result.error || null;

    res.render('shop', {
      title: 'Shop',
      suggestions: state.suggestions,
      selectedItems: Array.from(state.selectedItems.entries()).map(([name, data]) => ({ name, ...data })),
      lastFetched: state.lastFetched,
      error,
      message,
    });
  } catch (err) {
    releaseSlot(platform, false, false);
    res.render('shop', {
      title: 'Shop',
      suggestions: state.suggestions,
      selectedItems: Array.from(state.selectedItems.entries()).map(([name, data]) => ({ name, ...data })),
      lastFetched: state.lastFetched,
      error: err.message,
      message: null,
    });
  }
});

export default router;
