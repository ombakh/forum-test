const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../../db');
const {
  clearAuthCookie,
  setAuthCookie,
  signUserToken,
  TOKEN_COOKIE_NAME,
  verifyUserToken
} = require('../../auth/token');

const router = express.Router();
const OM_OVERRIDE_NAME = 'om bakhshi';
const OM_OVERRIDE_EMAIL = 'ombakh28@gmail.com';

function parseSqliteTimestamp(value) {
  if (!value) {
    return null;
  }
  const normalized = String(value).replace(' ', 'T');
  const withTimezone = normalized.endsWith('Z') ? normalized : `${normalized}Z`;
  const date = new Date(withTimezone);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSuspensionActive(suspendedUntil) {
  const untilDate = parseSqliteTimestamp(suspendedUntil);
  return Boolean(untilDate && untilDate.getTime() > Date.now());
}

function normalizeHandle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '');
}

function canUseOmOverride(name, email) {
  return (
    String(email || '').trim().toLowerCase() === OM_OVERRIDE_EMAIL ||
    String(name || '').trim().toLowerCase() === OM_OVERRIDE_NAME
  );
}

function isValidTimeZone(timeZone) {
  if (!timeZone) {
    return false;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch (_error) {
    return false;
  }
}

router.post('/register', (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const handle = normalizeHandle(req.body.handle);
  const timezoneInput = String(req.body.timezone || '').trim();
  const timezone = timezoneInput || null;

  if (!name || !email || !password || password.length < 8 || !handle) {
    return res
      .status(400)
      .json({ message: 'Name, handle, email, and a password with at least 8 characters are required' });
  }

  const handleIsValid =
    /^[a-z0-9_]{3,20}$/.test(handle) || (handle === 'om' && canUseOmOverride(name, email));
  if (!handleIsValid) {
    return res
      .status(400)
      .json({ message: 'Handle must be 3-20 characters using only letters, numbers, or underscores' });
  }
  if (timezone && !isValidTimeZone(timezone)) {
    return res.status(400).json({ message: 'Invalid timezone' });
  }

  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

    if (existing) {
      return res.status(409).json({ message: 'Email already in use' });
    }
    const existingHandle = db.prepare('SELECT id FROM users WHERE handle = ?').get(handle);
    if (existingHandle) {
      return res.status(409).json({ message: 'Handle already in use' });
    }

    const passwordHash = bcrypt.hashSync(password, 12);
    const insert = db
      .prepare(
        `INSERT INTO users (name, handle, email, password_hash, timezone)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(name, handle, email, passwordHash, timezone);

    const user = db
      .prepare(
        `SELECT id, name, handle, email, bio, profile_image_url AS profileImageUrl, timezone, is_admin AS isAdmin, is_moderator AS isModerator, banned_at AS bannedAt, ban_reason AS banReason, suspended_until AS suspendedUntil, suspension_reason AS suspensionReason, created_at AS createdAt
         FROM users
         WHERE id = ?`
      )
      .get(insert.lastInsertRowid);

    user.isAdmin = Boolean(user.isAdmin);
    user.isModerator = Boolean(user.isModerator);

    const token = signUserToken(user);
    setAuthCookie(res, token);

    return res.status(201).json({ user });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not register user' });
  }
});

router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.banned_at) {
      return res.status(403).json({ message: `User is banned${user.ban_reason ? `: ${user.ban_reason}` : ''}` });
    }

    if (isSuspensionActive(user.suspended_until)) {
      return res.status(403).json({
        message: `User is suspended until ${user.suspended_until}${user.suspension_reason ? `: ${user.suspension_reason}` : ''}`
      });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      handle: user.handle,
      email: user.email,
      bio: user.bio,
      profileImageUrl: user.profile_image_url,
      timezone: user.timezone,
      isAdmin: Boolean(user.is_admin),
      isModerator: Boolean(user.is_moderator),
      bannedAt: user.banned_at,
      banReason: user.ban_reason,
      suspendedUntil: user.suspended_until,
      suspensionReason: user.suspension_reason,
      createdAt: user.created_at
    };
    const token = signUserToken(safeUser);
    setAuthCookie(res, token);

    return res.json({ user: safeUser });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not login' });
  }
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  return res.status(204).send();
});

router.get('/me', (req, res) => {
  try {
    const token = req.cookies[TOKEN_COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const payload = verifyUserToken(token);
    const db = getDb();
    const user = db
      .prepare(
        `SELECT id, name, handle, email, bio, profile_image_url AS profileImageUrl, timezone, is_admin AS isAdmin, is_moderator AS isModerator, banned_at AS bannedAt, ban_reason AS banReason, suspended_until AS suspendedUntil, suspension_reason AS suspensionReason, created_at AS createdAt
         FROM users
         WHERE id = ?`
      )
      .get(payload.sub);

    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (user.bannedAt) {
      clearAuthCookie(res);
      return res.status(403).json({ message: `User is banned${user.banReason ? `: ${user.banReason}` : ''}` });
    }

    if (isSuspensionActive(user.suspendedUntil)) {
      clearAuthCookie(res);
      return res.status(403).json({
        message: `User is suspended until ${user.suspendedUntil}${user.suspensionReason ? `: ${user.suspensionReason}` : ''}`
      });
    }

    user.isAdmin = Boolean(user.isAdmin);
    user.isModerator = Boolean(user.isModerator);
    return res.json({ user });
  } catch (_error) {
    clearAuthCookie(res);
    return res.status(401).json({ message: 'Unauthorized' });
  }
});

module.exports = router;
