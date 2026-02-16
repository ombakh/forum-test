const express = require('express');
const { getDb } = require('../../db');
const requireAuth = require('../../middlewares/requireAuth');
const requireAdmin = require('../../middlewares/requireAdmin');
const { TOKEN_COOKIE_NAME, verifyUserToken } = require('../../auth/token');
const { NOTIFICATION_TYPES, createNotification } = require('../notifications/notifications.service');

const router = express.Router();
const OM_OVERRIDE_NAME = 'om bakhshi';
const OM_OVERRIDE_EMAIL = 'ombakh28@gmail.com';
const MAX_PROFILE_IMAGE_BYTES = 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

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

function normalizeProfileImageDataUrl(value) {
  if (value == null) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error('Profile photo must be a valid image upload');
  }

  const mimeType = String(match[1] || '').toLowerCase();
  if (!ALLOWED_PROFILE_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error('Profile photo must be PNG, JPG, WEBP, or GIF');
  }

  const base64Data = String(match[2] || '').replace(/\s+/g, '');
  const byteLength = Buffer.byteLength(base64Data, 'base64');
  if (!Number.isFinite(byteLength) || byteLength <= 0) {
    throw new Error('Profile photo appears invalid');
  }
  if (byteLength > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('Profile photo must be 1MB or smaller');
  }

  return `data:${mimeType};base64,${base64Data}`;
}

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

function getViewerId(req) {
  const token = req.cookies[TOKEN_COOKIE_NAME];
  if (!token) {
    return null;
  }

  try {
    const payload = verifyUserToken(token);
    return Number(payload.sub) || null;
  } catch (_error) {
    return null;
  }
}

function loadFollowStats(db, targetUserId, viewerId = null) {
  const row = db
    .prepare(
      `SELECT
        (
          SELECT COUNT(*)
          FROM user_follows
          WHERE following_user_id = ?
        ) AS followerCount,
        (
          SELECT COUNT(*)
          FROM user_follows
          WHERE follower_user_id = ?
        ) AS followingCount,
        CASE
          WHEN ? IS NOT NULL AND EXISTS (
            SELECT 1
            FROM user_follows
            WHERE follower_user_id = ?
              AND following_user_id = ?
          )
          THEN 1
          ELSE 0
        END AS isFollowing`
    )
    .get(targetUserId, targetUserId, viewerId, viewerId, targetUserId);

  return {
    followerCount: Number(row.followerCount),
    followingCount: Number(row.followingCount),
    isFollowing: Boolean(row.isFollowing),
    isSelf: viewerId === targetUserId
  };
}

router.get('/me', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const user = db
      .prepare(
        `SELECT id, name, handle, email, bio, profile_image_url AS profileImageUrl, timezone, is_admin AS isAdmin, is_moderator AS isModerator, banned_at AS bannedAt, ban_reason AS banReason, suspended_until AS suspendedUntil, suspension_reason AS suspensionReason, created_at AS createdAt
         FROM users
         WHERE id = ?`
      )
      .get(req.authUser.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const followStats = loadFollowStats(db, req.authUser.id, req.authUser.id);

    return res.json({
      user: {
        ...user,
        isAdmin: Boolean(user.isAdmin),
        isModerator: Boolean(user.isModerator),
        ...followStats
      }
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load user profile' });
  }
});

router.patch('/me', requireAuth, (req, res) => {
  const hasName = Object.prototype.hasOwnProperty.call(req.body, 'name');
  const hasHandle = Object.prototype.hasOwnProperty.call(req.body, 'handle');
  const hasBio = Object.prototype.hasOwnProperty.call(req.body, 'bio');
  const hasTimezone = Object.prototype.hasOwnProperty.call(req.body, 'timezone');
  const hasProfileImageUrl = Object.prototype.hasOwnProperty.call(req.body, 'profileImageUrl');

  const name = hasName ? String(req.body.name || '').trim() : null;
  const handle = hasHandle ? normalizeHandle(req.body.handle) : null;
  const bio = hasBio ? String(req.body.bio || '').trim() : null;
  const timezoneInput = hasTimezone ? String(req.body.timezone || '').trim() : null;
  const timezone = hasTimezone && !timezoneInput ? null : timezoneInput;
  let profileImageUrl = null;

  if (hasProfileImageUrl) {
    try {
      profileImageUrl = normalizeProfileImageDataUrl(req.body.profileImageUrl);
    } catch (error) {
      return res.status(400).json({ message: error.message || 'Invalid profile photo upload' });
    }
  }

  if (hasName && !name) {
    return res.status(400).json({ message: 'Name cannot be empty' });
  }

  const canUseShortOm = canUseOmOverride(req.authUser.name, req.authUser.email);
  if (hasHandle && !/^[a-z0-9_]{3,20}$/.test(handle) && !(canUseShortOm && handle === 'om')) {
    return res
      .status(400)
      .json({ message: 'Handle must be 3-20 characters using only letters, numbers, or underscores' });
  }

  if (hasBio && bio.length > 280) {
    return res.status(400).json({ message: 'Bio must be 280 characters or fewer' });
  }
  if (hasTimezone && timezone && !isValidTimeZone(timezone)) {
    return res.status(400).json({ message: 'Invalid timezone' });
  }

  try {
    const db = getDb();
    const current = db
      .prepare(
        `SELECT id, name, handle, bio, timezone, profile_image_url AS profileImageUrl
         FROM users
         WHERE id = ?`
      )
      .get(req.authUser.id);

    if (!current) {
      return res.status(404).json({ message: 'User not found' });
    }

    const nextName = hasName ? name : current.name;
    const nextHandle = hasHandle ? handle : current.handle;
    const nextBio = hasBio ? (bio || null) : current.bio;
    const nextTimezone = hasTimezone ? timezone : current.timezone;
    const nextProfileImageUrl = hasProfileImageUrl ? profileImageUrl : current.profileImageUrl;

    if (!nextName || !nextHandle) {
      return res.status(400).json({ message: 'Name and handle are required' });
    }

    if (nextHandle !== current.handle) {
      const existingHandle = db.prepare('SELECT id FROM users WHERE handle = ? AND id != ?').get(nextHandle, req.authUser.id);
      if (existingHandle) {
        return res.status(409).json({ message: 'Handle already in use' });
      }
    }

    db.prepare(
      `UPDATE users
       SET name = ?,
           handle = ?,
           bio = ?,
           timezone = ?,
           profile_image_url = ?
       WHERE id = ?`
    ).run(nextName, nextHandle, nextBio, nextTimezone, nextProfileImageUrl, req.authUser.id);

    const updated = db
      .prepare(
        `SELECT id, name, handle, email, bio, profile_image_url AS profileImageUrl, timezone, is_admin AS isAdmin, is_moderator AS isModerator, banned_at AS bannedAt, ban_reason AS banReason, suspended_until AS suspendedUntil, suspension_reason AS suspensionReason, created_at AS createdAt
         FROM users
         WHERE id = ?`
      )
      .get(req.authUser.id);

    const followStats = loadFollowStats(db, req.authUser.id, req.authUser.id);

    return res.json({
      user: {
        ...updated,
        isAdmin: Boolean(updated.isAdmin),
        isModerator: Boolean(updated.isModerator),
        ...followStats
      }
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not update profile' });
  }
});

router.get('/me/threads', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const threads = db
      .prepare(
        `SELECT
          t.id,
          t.title,
          t.body,
          t.author_name AS authorName,
          t.created_at AS createdAt,
          t.author_user_id AS authorUserId,
          COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
          COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
          MAX(CASE WHEN v.user_id = ? THEN v.vote ELSE 0 END) AS userVote
         FROM threads t
         LEFT JOIN thread_votes v ON v.thread_id = t.id
         WHERE t.author_user_id = ?
         GROUP BY t.id
         ORDER BY datetime(t.created_at) DESC`
      )
      .all(req.authUser.id, req.authUser.id)
      .map((thread) => ({
        ...thread,
        upvotes: Number(thread.upvotes),
        downvotes: Number(thread.downvotes),
        userVote: Number(thread.userVote)
      }));

    return res.json({ threads });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load user threads' });
  }
});

router.get('/me/following/threads', requireAuth, (req, res) => {
  const search = String(req.query.search || '').trim();
  const sort = String(req.query.sort || 'new');

  try {
    const db = getDb();
    const whereParts = ['uf.follower_user_id = ?'];
    const params = [req.authUser.id, req.authUser.id];

    if (search) {
      whereParts.push('(t.title LIKE ? OR t.body LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    let orderClause = 'datetime(t.created_at) DESC';
    if (sort === 'top') {
      orderClause = '(upvotes - downvotes) DESC, datetime(t.created_at) DESC';
    } else if (sort === 'active') {
      orderClause = 'datetime(latestActivityAt) DESC';
    } else if (sort === 'discussed') {
      orderClause = 'responseCount DESC, datetime(t.created_at) DESC';
    }

    const threads = db
      .prepare(
        `SELECT
          t.id,
          t.title,
          t.body,
          t.board_id AS boardId,
          b.name AS boardName,
          b.slug AS boardSlug,
          t.author_name AS authorName,
          t.created_at AS createdAt,
          t.author_user_id AS authorUserId,
          (
            SELECT COUNT(*)
            FROM thread_responses tr
            WHERE tr.thread_id = t.id
          ) AS responseCount,
          COALESCE(
            (
              SELECT MAX(tr.created_at)
              FROM thread_responses tr
              WHERE tr.thread_id = t.id
            ),
            t.created_at
          ) AS latestActivityAt,
          COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
          COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
          MAX(CASE WHEN v.user_id = ? THEN v.vote ELSE 0 END) AS userVote
         FROM threads t
         JOIN user_follows uf ON uf.following_user_id = t.author_user_id
         LEFT JOIN boards b ON b.id = t.board_id
         LEFT JOIN thread_votes v ON v.thread_id = t.id
         WHERE ${whereParts.join(' AND ')}
         GROUP BY t.id
         ORDER BY ${orderClause}`
      )
      .all(...params)
      .map((thread) => ({
        ...thread,
        boardId: thread.boardId ? Number(thread.boardId) : null,
        responseCount: Number(thread.responseCount),
        upvotes: Number(thread.upvotes),
        downvotes: Number(thread.downvotes),
        userVote: Number(thread.userVote)
      }));

    return res.json({ threads });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load following feed' });
  }
});

router.post('/:userId/follow', requireAuth, (req, res) => {
  const targetUserId = Number(req.params.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  if (targetUserId === req.authUser.id) {
    return res.status(400).json({ message: 'You cannot follow yourself' });
  }

  try {
    const db = getDb();
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }

    const followResult = db.prepare(
      `INSERT INTO user_follows (follower_user_id, following_user_id)
       VALUES (?, ?)
       ON CONFLICT(follower_user_id, following_user_id) DO NOTHING`
    ).run(req.authUser.id, targetUserId);

    if (Number(followResult.changes || 0) > 0) {
      createNotification(db, {
        userId: targetUserId,
        actorUserId: req.authUser.id,
        type: NOTIFICATION_TYPES.FOLLOW,
        entityType: 'user',
        entityId: req.authUser.id,
        message: `${req.authUser.name || 'Someone'} started following you`
      });
    }

    const stats = loadFollowStats(db, targetUserId, req.authUser.id);
    return res.json({ following: true, stats });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not follow user' });
  }
});

router.delete('/:userId/follow', requireAuth, (req, res) => {
  const targetUserId = Number(req.params.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  if (targetUserId === req.authUser.id) {
    return res.status(400).json({ message: 'You cannot unfollow yourself' });
  }

  try {
    const db = getDb();
    db.prepare(
      `DELETE FROM user_follows
       WHERE follower_user_id = ?
         AND following_user_id = ?`
    ).run(req.authUser.id, targetUserId);

    const stats = loadFollowStats(db, targetUserId, req.authUser.id);
    return res.json({ following: false, stats });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not unfollow user' });
  }
});

router.get('/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  try {
    const db = getDb();
    const user = db
      .prepare(
        `SELECT
          id,
          name,
          handle,
          bio,
          profile_image_url AS profileImageUrl,
          created_at AS createdAt
         FROM users
         WHERE id = ?`
      )
      .get(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const posts = db
      .prepare(
        `SELECT
          t.id,
          t.title,
          t.body,
          t.created_at AS createdAt,
          t.board_id AS boardId,
          b.slug AS boardSlug,
          b.name AS boardName
         FROM threads t
         LEFT JOIN boards b ON b.id = t.board_id
         WHERE t.author_user_id = ?
         ORDER BY datetime(t.created_at) DESC`
      )
      .all(userId)
      .map((post) => ({
        ...post,
        boardId: post.boardId ? Number(post.boardId) : null
      }));

    const comments = db
      .prepare(
        `SELECT
          r.id,
          r.body,
          r.created_at AS createdAt,
          r.thread_id AS threadId,
          t.title AS threadTitle,
          t.board_id AS boardId,
          b.slug AS boardSlug,
          b.name AS boardName
         FROM thread_responses r
         LEFT JOIN threads t ON t.id = r.thread_id
         LEFT JOIN boards b ON b.id = t.board_id
         WHERE r.user_id = ?
         ORDER BY datetime(r.created_at) DESC`
      )
      .all(userId)
      .map((comment) => ({
        ...comment,
        boardId: comment.boardId ? Number(comment.boardId) : null
      }));

    const voteTotals = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN votes.vote = 1 THEN 1 ELSE 0 END), 0) AS upvotesReceived,
          COALESCE(SUM(CASE WHEN votes.vote = -1 THEN 1 ELSE 0 END), 0) AS downvotesReceived
         FROM (
           SELECT tv.vote
           FROM thread_votes tv
           JOIN threads t ON t.id = tv.thread_id
           WHERE t.author_user_id = ?
             AND tv.user_id != t.author_user_id
           UNION ALL
           SELECT rv.vote
           FROM response_votes rv
           JOIN thread_responses r ON r.id = rv.response_id
           WHERE r.user_id = ?
             AND rv.user_id != r.user_id
         ) votes`
      )
      .get(userId, userId);

    const viewerId = getViewerId(req);
    const followStats = loadFollowStats(db, userId, viewerId);

    return res.json({
      user: {
        ...user,
        ...followStats
      },
      posts,
      comments,
      stats: {
        upvotesReceived: Number(voteTotals.upvotesReceived),
        downvotesReceived: Number(voteTotals.downvotesReceived),
        score: Number(voteTotals.upvotesReceived) - Number(voteTotals.downvotesReceived)
      }
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load user profile' });
  }
});

router.get('/', requireAuth, requireAdmin, (_req, res) => {
  try {
    const db = getDb();
    const users = db
      .prepare(
        `SELECT
          id,
          name,
          handle,
          email,
          bio,
          is_admin AS isAdmin,
          is_moderator AS isModerator,
          banned_at AS bannedAt,
          ban_reason AS banReason,
          suspended_until AS suspendedUntil,
          suspension_reason AS suspensionReason,
          created_at AS createdAt
         FROM users
         ORDER BY datetime(created_at) DESC`
      )
      .all()
      .map((user) => ({
        ...user,
        isAdmin: Boolean(user.isAdmin),
        isModerator: Boolean(user.isModerator),
        isSuspended: isSuspensionActive(user.suspendedUntil)
      }));

    return res.json({ users });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load users' });
  }
});

router.post('/:userId/moderator', requireAuth, requireAdmin, (req, res) => {
  const targetUserId = Number(req.params.userId);
  const moderator = req.body.moderator !== false;

  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  try {
    const db = getDb();
    const target = db
      .prepare(
        `SELECT
          id,
          is_admin AS isAdmin,
          is_moderator AS isModerator
         FROM users
         WHERE id = ?`
      )
      .get(targetUserId);

    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (target.isAdmin) {
      return res.status(403).json({ message: 'Admin accounts already have full moderation access' });
    }

    db.prepare('UPDATE users SET is_moderator = ? WHERE id = ?').run(moderator ? 1 : 0, targetUserId);

    const updated = db
      .prepare(
        `SELECT
          id,
          name,
          handle,
          email,
          bio,
          is_admin AS isAdmin,
          is_moderator AS isModerator,
          banned_at AS bannedAt,
          ban_reason AS banReason,
          suspended_until AS suspendedUntil,
          suspension_reason AS suspensionReason,
          created_at AS createdAt
         FROM users
         WHERE id = ?`
      )
      .get(targetUserId);

    return res.json({
      user: {
        ...updated,
        isAdmin: Boolean(updated.isAdmin),
        isModerator: Boolean(updated.isModerator),
        isSuspended: isSuspensionActive(updated.suspendedUntil)
      }
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not update moderator status' });
  }
});

router.post('/:userId/ban', requireAuth, requireAdmin, (req, res) => {
  const targetUserId = Number(req.params.userId);
  const ban = req.body.ban !== false;
  const reason = (req.body.reason || '').trim() || null;

  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  if (targetUserId === req.authUser.id) {
    return res.status(400).json({ message: 'You cannot ban your own account' });
  }

  try {
    const db = getDb();
    const target = db
      .prepare(
        'SELECT id, name, handle, email, bio, is_admin, is_moderator, banned_at, ban_reason, suspended_until, suspension_reason, created_at FROM users WHERE id = ?'
      )
      .get(targetUserId);

    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (target.is_admin) {
      return res.status(403).json({ message: 'Cannot ban another admin account' });
    }

    if (ban) {
      db.prepare(
        `UPDATE users
         SET banned_at = CURRENT_TIMESTAMP,
             ban_reason = ?
         WHERE id = ?`
      ).run(reason, targetUserId);
    } else {
      db.prepare(
        `UPDATE users
         SET banned_at = NULL,
             ban_reason = NULL
         WHERE id = ?`
      ).run(targetUserId);
    }

    const updated = db
      .prepare(
        `SELECT
          id,
          name,
          handle,
          email,
          bio,
          is_admin AS isAdmin,
          is_moderator AS isModerator,
          banned_at AS bannedAt,
          ban_reason AS banReason,
          suspended_until AS suspendedUntil,
          suspension_reason AS suspensionReason,
          created_at AS createdAt
         FROM users
         WHERE id = ?`
      )
      .get(targetUserId);

    return res.json({
      user: {
        ...updated,
        isAdmin: Boolean(updated.isAdmin),
        isModerator: Boolean(updated.isModerator)
      }
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not update ban status' });
  }
});

router.post('/:userId/suspend', requireAuth, requireAdmin, (req, res) => {
  const targetUserId = Number(req.params.userId);
  const clear = req.body.clear === true;
  const durationHours = Number(req.body.durationHours);
  const reason = (req.body.reason || '').trim() || null;

  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  if (targetUserId === req.authUser.id) {
    return res.status(400).json({ message: 'You cannot suspend your own account' });
  }

  if (!clear && (!Number.isFinite(durationHours) || durationHours <= 0 || durationHours > 24 * 365)) {
    return res.status(400).json({ message: 'Duration must be a number of hours between 0 and 8760' });
  }

  try {
    const db = getDb();
    const target = db
      .prepare('SELECT id, is_admin AS isAdmin FROM users WHERE id = ?')
      .get(targetUserId);

    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (target.isAdmin) {
      return res.status(403).json({ message: 'Cannot suspend another admin account' });
    }

    if (clear) {
      db.prepare(
        `UPDATE users
         SET suspended_until = NULL,
             suspension_reason = NULL
         WHERE id = ?`
      ).run(targetUserId);
    } else {
      const normalizedDurationHours = Math.round(durationHours * 100) / 100;
      db.prepare(
        `UPDATE users
         SET suspended_until = datetime('now', ?),
             suspension_reason = ?
         WHERE id = ?`
      ).run(`+${normalizedDurationHours} hours`, reason, targetUserId);
    }

    const updated = db
      .prepare(
        `SELECT
          id,
          name,
          handle,
          email,
          bio,
          is_admin AS isAdmin,
          is_moderator AS isModerator,
          banned_at AS bannedAt,
          ban_reason AS banReason,
          suspended_until AS suspendedUntil,
          suspension_reason AS suspensionReason,
          created_at AS createdAt
         FROM users
         WHERE id = ?`
      )
      .get(targetUserId);

    return res.json({
      user: {
        ...updated,
        isAdmin: Boolean(updated.isAdmin),
        isModerator: Boolean(updated.isModerator),
        isSuspended: isSuspensionActive(updated.suspendedUntil)
      }
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not update suspension status' });
  }
});

module.exports = router;
