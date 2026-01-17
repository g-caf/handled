const domainState = new Map();

const CONFIG = {
  ubereats: {
    minDelayMs: 5000,
    maxConcurrent: 1,
    cooldownMs: 30 * 60 * 1000, // 30 min cooldown on block
    maxFailures: 3,
  },
  doordash: {
    minDelayMs: 5000,
    maxConcurrent: 1,
    cooldownMs: 30 * 60 * 1000,
    maxFailures: 3,
  },
  instacart: {
    minDelayMs: 5000,
    maxConcurrent: 1,
    cooldownMs: 30 * 60 * 1000,
    maxFailures: 3,
  },
};

function getState(platform) {
  if (!domainState.has(platform)) {
    domainState.set(platform, {
      lastRequestAt: 0,
      activeRequests: 0,
      consecutiveFailures: 0,
      cooldownUntil: 0,
    });
  }
  return domainState.get(platform);
}

export async function acquireSlot(platform) {
  const config = CONFIG[platform];
  if (!config) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  const state = getState(platform);

  // Check cooldown
  if (Date.now() < state.cooldownUntil) {
    const remainingMs = state.cooldownUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    return {
      allowed: false,
      reason: `Platform in cooldown for ${remainingMin} more minutes`,
      retryAfterMs: remainingMs,
    };
  }

  // Check concurrency
  if (state.activeRequests >= config.maxConcurrent) {
    return {
      allowed: false,
      reason: 'Max concurrent requests reached',
      retryAfterMs: 1000,
    };
  }

  // Check rate limit
  const timeSinceLastRequest = Date.now() - state.lastRequestAt;
  if (timeSinceLastRequest < config.minDelayMs) {
    const waitTime = config.minDelayMs - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  state.activeRequests++;
  state.lastRequestAt = Date.now();

  return { allowed: true };
}

export function releaseSlot(platform, success = true, blocked = false) {
  const config = CONFIG[platform];
  const state = getState(platform);

  state.activeRequests = Math.max(0, state.activeRequests - 1);

  if (blocked) {
    state.consecutiveFailures++;
    if (state.consecutiveFailures >= config.maxFailures) {
      state.cooldownUntil = Date.now() + config.cooldownMs;
      console.log(`Platform ${platform} entering cooldown until ${new Date(state.cooldownUntil).toISOString()}`);
    }
  } else if (success) {
    state.consecutiveFailures = 0;
  }
}

export function getPlatformStatus(platform) {
  const config = CONFIG[platform];
  const state = getState(platform);

  return {
    platform,
    activeRequests: state.activeRequests,
    maxConcurrent: config?.maxConcurrent || 0,
    consecutiveFailures: state.consecutiveFailures,
    inCooldown: Date.now() < state.cooldownUntil,
    cooldownEndsAt: state.cooldownUntil > Date.now() ? new Date(state.cooldownUntil).toISOString() : null,
  };
}

export function getAllPlatformStatus() {
  return Object.keys(CONFIG).map(getPlatformStatus);
}
