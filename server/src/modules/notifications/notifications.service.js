const NOTIFICATION_TYPES = Object.freeze({
  MENTION: 'mention',
  THREAD_RESPONSE: 'thread_response',
  DIRECT_MESSAGE: 'direct_message',
  FOLLOW: 'follow'
});

function extractMentionHandles(value) {
  const source = String(value || '');
  const regex = /(^|[^a-z0-9_])@([a-z0-9_]{2,20})\b/gi;
  const handles = new Set();

  let match;
  while ((match = regex.exec(source)) !== null) {
    handles.add(String(match[2]).toLowerCase());
  }

  return [...handles];
}

function findUsersByHandles(db, handles) {
  if (!Array.isArray(handles) || handles.length === 0) {
    return [];
  }

  const placeholders = handles.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT id, name, handle
       FROM users
       WHERE handle IN (${placeholders})`
    )
    .all(...handles)
    .map((row) => ({
      id: Number(row.id),
      name: row.name,
      handle: row.handle
    }));
}

function createNotification(db, payload) {
  const userId = Number(payload?.userId);
  const actorUserId = payload?.actorUserId == null ? null : Number(payload.actorUserId);
  const type = String(payload?.type || '').trim();
  const entityType = payload?.entityType == null ? null : String(payload.entityType);
  const entityId = payload?.entityId == null ? null : Number(payload.entityId);
  const threadId = payload?.threadId == null ? null : Number(payload.threadId);
  const message = String(payload?.message || '').trim().slice(0, 280);

  if (!Number.isInteger(userId) || userId <= 0 || !type || !message) {
    return null;
  }

  const result = db
    .prepare(
      `INSERT INTO notifications (
         user_id,
         actor_user_id,
         type,
         entity_type,
         entity_id,
         thread_id,
         message
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
      type,
      entityType,
      Number.isInteger(entityId) && entityId > 0 ? entityId : null,
      Number.isInteger(threadId) && threadId > 0 ? threadId : null,
      message
    );

  return Number(result.lastInsertRowid);
}

function createMentionNotifications({
  db,
  text,
  actorUserId,
  actorName,
  entityType,
  entityId,
  threadId = null,
  excludeUserIds = [],
  contextLabel = 'a post'
}) {
  const handles = extractMentionHandles(text);
  if (handles.length === 0) {
    return [];
  }

  const mentionedUsers = findUsersByHandles(db, handles);
  const excluded = new Set((excludeUserIds || []).map((value) => Number(value)).filter(Boolean));
  const normalizedActorId = Number(actorUserId);
  const actorLabel = String(actorName || 'Someone').trim() || 'Someone';

  const notifiedUserIds = [];
  for (const mentionedUser of mentionedUsers) {
    if (!mentionedUser || !Number.isInteger(mentionedUser.id) || mentionedUser.id <= 0) {
      continue;
    }
    if (mentionedUser.id === normalizedActorId || excluded.has(mentionedUser.id)) {
      continue;
    }

    createNotification(db, {
      userId: mentionedUser.id,
      actorUserId: normalizedActorId,
      type: NOTIFICATION_TYPES.MENTION,
      entityType,
      entityId,
      threadId,
      message: `${actorLabel} mentioned you in ${contextLabel}`
    });

    notifiedUserIds.push(mentionedUser.id);
  }

  return notifiedUserIds;
}

function getUnreadNotificationCount(db, userId, options = {}) {
  const normalizedUserId = Number(userId);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    return 0;
  }

  const includeDirectMessages = Boolean(options.includeDirectMessages);
  const params = [normalizedUserId];
  const whereParts = ['user_id = ?', 'read_at IS NULL'];

  if (!includeDirectMessages) {
    whereParts.push('type != ?');
    params.push(NOTIFICATION_TYPES.DIRECT_MESSAGE);
  }

  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM notifications
       WHERE ${whereParts.join(' AND ')}`
    )
    .get(...params);

  return Number(row?.count || 0);
}

module.exports = {
  NOTIFICATION_TYPES,
  extractMentionHandles,
  findUsersByHandles,
  createNotification,
  createMentionNotifications,
  getUnreadNotificationCount
};
