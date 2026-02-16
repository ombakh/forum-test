const express = require('express');
const { getDb } = require('../../db');
const requireAuth = require('../../middlewares/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const viewerId = req.authUser.id;
    const search = String(req.query.search || '').trim().toLowerCase();

    const users = db
      .prepare(
        `SELECT
          u.id,
          u.name,
          (
            SELECT dm.body
            FROM direct_messages dm
            WHERE (
              (dm.sender_user_id = ? AND dm.recipient_user_id = u.id)
              OR (dm.sender_user_id = u.id AND dm.recipient_user_id = ?)
            )
            ORDER BY datetime(dm.created_at) DESC, dm.id DESC
            LIMIT 1
          ) AS lastMessage,
          (
            SELECT dm.created_at
            FROM direct_messages dm
            WHERE (
              (dm.sender_user_id = ? AND dm.recipient_user_id = u.id)
              OR (dm.sender_user_id = u.id AND dm.recipient_user_id = ?)
            )
            ORDER BY datetime(dm.created_at) DESC, dm.id DESC
            LIMIT 1
          ) AS lastMessageAt,
          (
            SELECT COUNT(*)
            FROM direct_messages dm
            WHERE dm.sender_user_id = u.id
              AND dm.recipient_user_id = ?
              AND dm.read_at IS NULL
         ) AS unreadCount
         FROM users u
         WHERE u.id != ?
           AND (? = '' OR lower(u.name) LIKE '%' || ? || '%')
         ORDER BY
           CASE WHEN lastMessageAt IS NULL THEN 1 ELSE 0 END,
           datetime(lastMessageAt) DESC,
           lower(u.name) ASC`
      )
      .all(viewerId, viewerId, viewerId, viewerId, viewerId, viewerId, search, search)
      .map((user) => ({
        ...user,
        unreadCount: Number(user.unreadCount)
      }));

    return res.json({ users });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load chats' });
  }
});

router.get('/:userId', (req, res) => {
  const otherUserId = Number(req.params.userId);
  if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  if (otherUserId === req.authUser.id) {
    return res.status(400).json({ message: 'Cannot open a chat with yourself' });
  }

  try {
    const db = getDb();
    const otherUser = db.prepare('SELECT id, name FROM users WHERE id = ?').get(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    db.prepare(
      `UPDATE direct_messages
       SET read_at = CURRENT_TIMESTAMP
       WHERE sender_user_id = ?
         AND recipient_user_id = ?
         AND read_at IS NULL`
    ).run(otherUserId, req.authUser.id);

    const messages = db
      .prepare(
        `SELECT
          id,
          sender_user_id AS senderUserId,
          recipient_user_id AS recipientUserId,
          body,
          created_at AS createdAt,
          read_at AS readAt
         FROM direct_messages
         WHERE (
           (sender_user_id = ? AND recipient_user_id = ?)
           OR (sender_user_id = ? AND recipient_user_id = ?)
         )
         ORDER BY datetime(created_at) ASC, id ASC`
      )
      .all(req.authUser.id, otherUserId, otherUserId, req.authUser.id)
      .map((message) => ({
        ...message,
        senderUserId: Number(message.senderUserId),
        recipientUserId: Number(message.recipientUserId)
      }));

    return res.json({
      user: {
        id: Number(otherUser.id),
        name: otherUser.name
      },
      messages
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load messages' });
  }
});

router.post('/:userId', (req, res) => {
  const otherUserId = Number(req.params.userId);
  const body = (req.body.body || '').trim();

  if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  if (otherUserId === req.authUser.id) {
    return res.status(400).json({ message: 'Cannot message yourself' });
  }

  if (!body) {
    return res.status(400).json({ message: 'Message body is required' });
  }

  if (body.length > 2000) {
    return res.status(400).json({ message: 'Message body must be 2000 characters or fewer' });
  }

  try {
    const db = getDb();
    const otherUser = db.prepare('SELECT id FROM users WHERE id = ?').get(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const result = db
      .prepare(
        `INSERT INTO direct_messages (sender_user_id, recipient_user_id, body)
         VALUES (?, ?, ?)`
      )
      .run(req.authUser.id, otherUserId, body);

    const message = db
      .prepare(
        `SELECT
          id,
          sender_user_id AS senderUserId,
          recipient_user_id AS recipientUserId,
          body,
          created_at AS createdAt,
          read_at AS readAt
         FROM direct_messages
         WHERE id = ?`
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({
      message: {
        ...message,
        senderUserId: Number(message.senderUserId),
        recipientUserId: Number(message.recipientUserId)
      }
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not send message' });
  }
});

module.exports = router;
