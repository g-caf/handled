import { pool } from '../config/db.js';

// Default office ID - will be created on first use
let defaultOfficeId = null;

async function getDefaultOfficeId() {
  if (defaultOfficeId) return defaultOfficeId;

  // Check if a default office exists
  const existing = await pool.query(
    "SELECT id FROM offices WHERE name = 'Default Office' LIMIT 1"
  );

  if (existing.rows.length > 0) {
    defaultOfficeId = existing.rows[0].id;
    return defaultOfficeId;
  }

  // Create default office
  const result = await pool.query(
    "INSERT INTO offices (id, name, created_at) VALUES (gen_random_uuid(), 'Default Office', NOW()) RETURNING id"
  );
  defaultOfficeId = result.rows[0].id;
  return defaultOfficeId;
}

export async function getSession(platform) {
  const officeId = await getDefaultOfficeId();
  
  const result = await pool.query(
    `SELECT storage_state_enc, updated_at 
     FROM platform_sessions 
     WHERE office_id = $1 AND platform = $2 AND is_valid = true 
     ORDER BY updated_at DESC LIMIT 1`,
    [officeId, platform]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    storageState: result.rows[0].storage_state_enc,
    updatedAt: result.rows[0].updated_at,
  };
}

export async function saveSession(platform, storageState) {
  const officeId = await getDefaultOfficeId();
  
  const storageStateStr = typeof storageState === 'string' 
    ? storageState 
    : JSON.stringify(storageState);

  // Check if a session exists for this office/platform
  const existing = await pool.query(
    'SELECT id FROM platform_sessions WHERE office_id = $1 AND platform = $2 LIMIT 1',
    [officeId, platform]
  );

  if (existing.rows.length > 0) {
    // Update existing
    await pool.query(
      `UPDATE platform_sessions 
       SET storage_state_enc = $1, updated_at = NOW(), is_valid = true 
       WHERE office_id = $2 AND platform = $3`,
      [storageStateStr, officeId, platform]
    );
  } else {
    // Insert new
    await pool.query(
      `INSERT INTO platform_sessions (id, office_id, platform, storage_state_enc, is_valid, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, true, NOW(), NOW())`,
      [officeId, platform, storageStateStr]
    );
  }
}

export async function deleteSession(platform) {
  const officeId = await getDefaultOfficeId();
  
  await pool.query(
    'UPDATE platform_sessions SET is_valid = false WHERE office_id = $1 AND platform = $2',
    [officeId, platform]
  );
}

export async function listSessions() {
  const officeId = await getDefaultOfficeId();
  
  const result = await pool.query(
    'SELECT platform, updated_at FROM platform_sessions WHERE office_id = $1 AND is_valid = true ORDER BY platform',
    [officeId]
  );

  return result.rows.map(row => ({
    platform: row.platform,
    updatedAt: row.updated_at,
    hasSession: true,
  }));
}
