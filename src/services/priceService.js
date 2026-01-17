import { getSession } from './sessionService.js';
import { getCachedPrices, setCachedPrices } from './priceCache.js';
import { acquireSlot, releaseSlot } from '../worker/rateLimiter.js';
import * as uberEatsAgent from '../worker/agents/uberEatsAgent.js';
import * as doordashAgent from '../worker/agents/doordashAgent.js';

export async function searchItemPrices(itemName, stores = ['ubereats', 'doordash']) {
  const results = [];

  for (const platform of stores) {
    // Check cache first
    const cached = getCachedPrices(platform, 'search', itemName);
    if (cached) {
      results.push(...cached.map(item => ({ ...item, platform, cached: true })));
      continue;
    }

    const session = await getSession(platform);
    if (!session) {
      continue;
    }

    const slot = await acquireSlot(platform);
    if (!slot.allowed) {
      continue;
    }

    try {
      const storageState = typeof session.storageState === 'string'
        ? JSON.parse(session.storageState)
        : session.storageState;

      let searchResult;
      if (platform === 'ubereats') {
        searchResult = await uberEatsAgent.searchStore(storageState, itemName);
      } else {
        searchResult = await doordashAgent.searchStore(storageState, itemName);
      }

      if (searchResult.error) {
        releaseSlot(platform, false, true);
      } else {
        releaseSlot(platform, true, false);

        // Filter items that match the search term
        const matchingItems = searchResult.items
          .filter(item => itemMatchesSearch(item.name, itemName))
          .slice(0, 5); // Top 5 matches per platform

        setCachedPrices(platform, 'search', itemName, matchingItems);
        results.push(...matchingItems.map(item => ({ ...item, platform, cached: false })));
      }
    } catch (err) {
      releaseSlot(platform, false, false);
      console.error(`Price search error for ${platform}:`, err.message);
    }
  }

  // Sort by price
  return results.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
}

function itemMatchesSearch(itemName, searchTerm) {
  const itemLower = itemName.toLowerCase();
  const searchLower = searchTerm.toLowerCase();
  const searchWords = searchLower.split(/\s+/);

  // Check if all search words appear in the item name
  return searchWords.every(word => itemLower.includes(word));
}

export async function searchMultipleItems(items, platforms = ['ubereats', 'doordash']) {
  const results = new Map();

  for (const item of items) {
    const prices = await searchItemPrices(item.name, platforms);
    results.set(item.name, {
      ...item,
      prices,
      bestPrice: prices[0] || null,
    });

    // Add delay between items to be respectful
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return results;
}
