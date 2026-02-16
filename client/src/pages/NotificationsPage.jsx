import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TiltCard from '../components/TiltCard.jsx';
import { formatDateTime } from '../utils/dateTime.js';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '../services/notificationService.js';

const NOTIFICATIONS_UNREAD_UPDATE_EVENT = 'pinboard:notifications-unread-update';

function buildNotificationDestination(notification) {
  if (notification.threadId) {
    return `/threads/${notification.threadId}`;
  }
  if (notification.entityType === 'thread' && notification.entityId) {
    return `/threads/${notification.entityId}`;
  }
  if (notification.entityType === 'user' && notification.entityId) {
    return `/users/${notification.entityId}`;
  }
  return null;
}

function NotificationsPage({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState(null);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(NOTIFICATIONS_UNREAD_UPDATE_EVENT, {
        detail: {
          total: user ? unreadCount : 0
        }
      })
    );
  }, [user, unreadCount]);

  useEffect(() => {
    let active = true;
    let intervalId = null;

    async function loadNotifications({ silent = false } = {}) {
      if (!user) {
        if (active) {
          setNotifications([]);
          setUnreadCount(0);
          setError('');
          setLoading(false);
        }
        return;
      }

      if (!silent) {
        setLoading(true);
      }
      setError('');

      try {
        const data = await fetchNotifications({ limit: 80 });
        if (!active) {
          return;
        }
        setNotifications(data.notifications || []);
        setUnreadCount(Number(data.unreadCount || 0));
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'Could not load notifications');
        }
      } finally {
        if (active && !silent) {
          setLoading(false);
        }
      }
    }

    loadNotifications();
    if (user) {
      intervalId = window.setInterval(() => {
        loadNotifications({ silent: true });
      }, 9000);
    }

    return () => {
      active = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [user]);

  async function onMarkRead(notificationId) {
    if (markingId !== null) {
      return;
    }

    setMarkingId(notificationId);
    setError('');
    try {
      const data = await markNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, readAt: notification.readAt || new Date().toISOString() }
            : notification
        )
      );
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (markError) {
      setError(markError.message || 'Could not update notification');
    } finally {
      setMarkingId(null);
    }
  }

  async function onMarkAllRead() {
    if (markingAll) {
      return;
    }

    setMarkingAll(true);
    setError('');
    try {
      const data = await markAllNotificationsRead();
      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          readAt: notification.readAt || new Date().toISOString()
        }))
      );
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (markError) {
      setError(markError.message || 'Could not update notifications');
    } finally {
      setMarkingAll(false);
    }
  }

  if (!user) {
    return (
      <article className="card">
        <h1 className="page-title">Notifications</h1>
        <p className="muted">
          <Link to="/login">Login</Link> to view your notifications.
        </p>
      </article>
    );
  }

  return (
    <TiltCard as="section" className="card">
      <div className="notifications-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="muted">Unread: {unreadCount}</p>
        </div>
        <button className="btn btn--secondary" type="button" onClick={onMarkAllRead} disabled={markingAll || unreadCount === 0}>
          {markingAll ? 'Marking...' : 'Mark all as read'}
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p className="muted">Loading notifications...</p> : null}
      {!loading && notifications.length === 0 ? <p className="muted">No notifications yet.</p> : null}

      <ul className="notification-list">
        {notifications.map((notification) => {
          const destination = buildNotificationDestination(notification);
          const isUnread = !notification.readAt;
          return (
            <li key={notification.id} className={`notification-item ${isUnread ? 'is-unread' : ''}`}>
              <div className="notification-item__body">
                <p>{notification.message}</p>
                <p className="muted notification-item__meta">
                  {notification.actorName ? `${notification.actorName} • ` : ''}
                  {formatDateTime(notification.createdAt, user?.timezone)}
                </p>
              </div>
              <div className="notification-item__actions">
                {destination ? (
                  <Link
                    className="btn btn--secondary"
                    to={destination}
                    onClick={() => {
                      if (isUnread) {
                        onMarkRead(notification.id);
                      }
                    }}
                  >
                    Open
                  </Link>
                ) : null}
                {isUnread ? (
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={() => onMarkRead(notification.id)}
                    disabled={markingId === notification.id}
                  >
                    {markingId === notification.id ? 'Saving...' : 'Mark read'}
                  </button>
                ) : (
                  <span className="muted">Read</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </TiltCard>
  );
}

export default NotificationsPage;
