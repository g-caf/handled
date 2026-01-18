import { Router } from 'express';
import { getSession, saveSession } from '../services/sessionService.js';
import { acquireSlot, releaseSlot } from '../worker/rateLimiter.js';
import { fetchUberEatsOrderHistory, fetchDoorDashOrderHistory, extractUniqueItemsFromOrders } from '../worker/agents/orderHistoryAgent.js';
import { addToUberEatsCart, addToDoorDashCart } from '../worker/agents/addToCartAgent.js';
import * as instacartAgent from '../worker/agents/instacartAgent.js';

const router = Router();

// In-memory store for user's shopping state
const userState = new Map();

function getOrCreateUserState(sessionId) {
  if (!userState.has(sessionId)) {
    userState.set(sessionId, {
      suggestions: [],
      orders: [],
      lastFetched: null,
    });
  }
  return userState.get(sessionId);
}

router.get('/shop', async (req, res) => {
  const state = getOrCreateUserState(req.session.id);

  // Check if any platforms are connected
  let hasConnectedPlatforms = false;
  for (const platform of ['ubereats', 'doordash', 'instacart']) {
    try {
      const session = await getSession(platform);
      if (session) {
        hasConnectedPlatforms = true;
        break;
      }
    } catch {
      // Table might not exist yet
    }
  }

  // If no platforms connected, redirect to connect flow
  if (!hasConnectedPlatforms) {
    return res.redirect('/connect');
  }

  // Auto-import if we haven't fetched yet
  if (!state.lastFetched) {
    return res.redirect('/shop/auto-import');
  }

  res.render('shop', {
    title: 'Your Groceries',
    suggestions: state.suggestions,
    lastFetched: state.lastFetched,
    error: null,
    message: null,
  });
});

// Auto-import route that fetches and redirects
router.get('/shop/auto-import', async (req, res) => {
  const state = getOrCreateUserState(req.session.id);
  const errors = [];
  const allOrders = [];

  for (const platform of ['ubereats', 'doordash', 'instacart']) {
    let session;
    try {
      session = await getSession(platform);
    } catch {
      continue;
    }
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

      let result;
      if (platform === 'ubereats') {
        result = await fetchUberEatsOrderHistory(storageState);
      } else if (platform === 'doordash') {
        result = await fetchDoorDashOrderHistory(storageState);
      } else {
        result = await instacartAgent.fetchOrderHistory(storageState);
      }

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
    title: 'Your Groceries',
    suggestions: state.suggestions,
    lastFetched: state.lastFetched,
    error: errors.length > 0 ? errors.join('; ') : null,
    message: allOrders.length > 0 ? `Found ${state.suggestions.length} items from your order history` : null,
  });
});

router.post('/shop/fetch-history', async (req, res) => {
  const state = getOrCreateUserState(req.session.id);
  const errors = [];
  const allOrders = [];

  for (const platform of ['ubereats', 'doordash', 'instacart']) {
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

      let result;
      if (platform === 'ubereats') {
        result = await fetchUberEatsOrderHistory(storageState);
      } else if (platform === 'doordash') {
        result = await fetchDoorDashOrderHistory(storageState);
      } else {
        result = await instacartAgent.fetchOrderHistory(storageState);
      }

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

  // Extract items with price info (lowestPrice and highestPrice included)
  state.suggestions = extractUniqueItemsFromOrders(allOrders);
  
  state.orders = allOrders;
  state.lastFetched = new Date().toISOString();

  res.render('shop', {
    title: 'Your Groceries',
    suggestions: state.suggestions,
    lastFetched: state.lastFetched,
    error: errors.length > 0 ? errors.join('; ') : null,
    message: `Found ${state.suggestions.length} items from ${allOrders.length} orders`,
  });
});

router.post('/shop/add-to-cart', async (req, res) => {
  const state = getOrCreateUserState(req.session.id);
  const { itemName, quantity, platform, storeUrl } = req.body;

  if (!itemName) {
    return res.redirect('/shop');
  }

  const qty = parseInt(quantity) || 1;

  // If we have platform and storeUrl, add directly to that platform
  if (platform && storeUrl) {
    const session = await getSession(platform);
    if (!session) {
      return renderShop(req, res, state, {
        error: `Not connected to ${platform}. Please connect first.`,
      });
    }

    const slot = await acquireSlot(platform);
    if (!slot.allowed) {
      return renderShop(req, res, state, { error: slot.reason });
    }

    try {
      const storageState = typeof session.storageState === 'string'
        ? JSON.parse(session.storageState)
        : session.storageState;

      const items = [{ name: itemName, quantity: qty }];

      let result;
      if (platform === 'ubereats') {
        result = await addToUberEatsCart(storageState, storeUrl, items);
      } else if (platform === 'doordash') {
        result = await addToDoorDashCart(storageState, storeUrl, items);
      } else {
        result = await instacartAgent.addToCart(storageState, storeUrl, items);
      }

      releaseSlot(platform, !result.error, !!result.error);

      if (result.updatedStorageState) {
        await saveSession(platform, result.updatedStorageState);
      }

      const platformName = platform === 'ubereats' ? 'Uber Eats' : 
                          platform === 'doordash' ? 'DoorDash' : 'Instacart';

      if (result.addedItems?.length) {
        return renderShop(req, res, state, {
          message: `Added ${qty}× ${itemName} to ${platformName} cart`,
        });
      } else {
        return renderShop(req, res, state, {
          error: result.error || `Could not find "${itemName}" at this store`,
        });
      }
    } catch (err) {
      releaseSlot(platform, false, false);
      return renderShop(req, res, state, { error: err.message });
    }
  }

  // No platform specified - show store selection or use default
  return renderShop(req, res, state, {
    error: 'Please connect an account first to add items to cart.',
  });
});

function renderShop(req, res, state, options = {}) {
  res.render('shop', {
    title: 'Your Groceries',
    suggestions: state.suggestions,
    lastFetched: state.lastFetched,
    error: options.error || null,
    message: options.message || null,
  });
}

export default router;
