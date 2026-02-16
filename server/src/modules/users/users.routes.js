const express = require('express');
const { getDb } = require('../../db');
const requireAuth = require('../../middlewares/requireAuth');
const requireAdmin = require('../../middlewares/requireAdmin');

const router = express.Router();

router.get('/me', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const user = db
      .prepare(
        `SELECT id, name, email, is_admin AS isAdmin, banned_at AS bannedAt, ban_reason AS banReason, created_at AS createdAt
         FROM users
         WHERE id = ?`
      )
      .get(req.authUser.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isAdmin = Boolean(user.isAdmin);
    return res.json({ user });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load user profile' });
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
          COALESCE(SUM(CASE WHEN v.vote = 1 AND v.user_id != t.author_user_id THEN 1 ELSE 0 END), 0) AS upvotes,
          COALESCE(SUM(CASE WHEN v.vote = -1 AND v.user_id != t.author_user_id THEN 1 ELSE 0 END), 0) AS downvotes,
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

    return res.json({
      user,
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
          email,
          is_admin AS isAdmin,
          banned_at AS bannedAt,
          ban_reason AS banReason,
          created_at AS createdAt
         FROM users
         ORDER BY datetime(created_at) DESC`
      )
      .all()
      .map((user) => ({
        ...user,
        isAdmin: Boolean(user.isAdmin)
      }));

    return res.json({ users });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load users' });
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
      .prepare('SELECT id, name, email, is_admin, banned_at, ban_reason, created_at FROM users WHERE id = ?')
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
          email,
          is_admin AS isAdmin,
          banned_at AS bannedAt,
          ban_reason AS banReason,
          created_at AS createdAt
         FROM users
         WHERE id = ?`
      )
      .get(targetUserId);

    return res.json({
      user: {
        ...updated,
        isAdmin: Boolean(updated.isAdmin)
      }
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not update ban status' });
  }
});

module.exports = router;
