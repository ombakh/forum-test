const express = require('express');
const { getDb } = require('../../db');
const requireAuth = require('../../middlewares/requireAuth');
const { NOTIFICATION_TYPES, getUnreadNotificationCount } = require('./notifications.service');

const router = express.Router();

router.use(requireAuth);

router.get('/unread-count', (req, res) => {
  try {
    const db = getDb();
    const unreadCount = getUnreadNotificationCount(db, req.authUser.id);
    return res.json({ unreadCount });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load unread notifications' });
  }
});

router.get('/', (req, res) => {
  const rawLimit = Number(req.query.limit);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
  const unreadOnly = String(req.query.unread || '') === '1' || String(req.query.unread || '') === 'true';

  try {
    const db = getDb();
    const params = [req.authUser.id, NOTIFICATION_TYPES.DIRECT_MESSAGE];
    const whereParts = ['n.user_id = ?', 'n.type != ?'];

    if (unreadOnly) {
      whereParts.push('n.read_at IS NULL');
    }

    const notifications = db
      .prepare(
        `SELECT
          n.id,
          n.user_id AS userId,
          n.actor_user_id AS actorUserId,
          n.type,
          n.entity_type AS entityType,
          n.entity_id AS entityId,
          n.thread_id AS threadId,
          n.message,
          n.read_at AS readAt,
          n.created_at AS createdAt,
          actor.name AS actorName,
          actor.handle AS actorHandle
         FROM notifications n
         LEFT JOIN users actor ON actor.id = n.actor_user_id
         WHERE ${whereParts.join(' AND ')}
         ORDER BY datetime(n.created_at) DESC, n.id DESC
         LIMIT ?`
      )
      .all(...params, limit)
      .map((notification) => ({
        ...notification,
        id: Number(notification.id),
        userId: Number(notification.userId),
        actorUserId: notification.actorUserId ? Number(notification.actorUserId) : null,
        entityId: notification.entityId ? Number(notification.entityId) : null,
        threadId: notification.threadId ? Number(notification.threadId) : null
      }));

    return res.json({
      notifications,
      unreadCount: getUnreadNotificationCount(db, req.authUser.id)
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not load notifications' });
  }
});

router.post('/read-all', (req, res) => {
  try {
    const db = getDb();
    const result = db
      .prepare(
        `UPDATE notifications
         SET read_at = CURRENT_TIMESTAMP
         WHERE user_id = ?
           AND type != ?
           AND read_at IS NULL`
      )
      .run(req.authUser.id, NOTIFICATION_TYPES.DIRECT_MESSAGE);

    return res.json({
      markedRead: Number(result.changes || 0),
      unreadCount: getUnreadNotificationCount(db, req.authUser.id)
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not update notifications' });
  }
});

router.post('/:notificationId/read', (req, res) => {
  const notificationId = Number(req.params.notificationId);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return res.status(400).json({ message: 'Invalid notification id' });
  }

  try {
    const db = getDb();
    const result = db
      .prepare(
        `UPDATE notifications
         SET read_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND user_id = ?
           AND type != ?
           AND read_at IS NULL`
      )
      .run(notificationId, req.authUser.id, NOTIFICATION_TYPES.DIRECT_MESSAGE);

    return res.json({
      markedRead: Number(result.changes || 0) > 0,
      unreadCount: getUnreadNotificationCount(db, req.authUser.id)
    });
  } catch (_error) {
    return res.status(500).json({ message: 'Could not update notification' });
  }
});

module.exports = router;
