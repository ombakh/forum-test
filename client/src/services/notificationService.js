const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export async function fetchNotifications(options = {}) {
  const params = new URLSearchParams();
  if (options.unreadOnly) {
    params.set('unread', '1');
  }
  if (Number.isInteger(options.limit) && options.limit > 0) {
    params.set('limit', String(options.limit));
  }

  const response = await fetch(
    `${API_BASE_URL}/notifications${params.toString() ? `?${params.toString()}` : ''}`,
    {
      credentials: 'include'
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to load notifications');
  }

  const data = await response.json();
  return {
    notifications: data.notifications || [],
    unreadCount: Number(data.unreadCount || 0)
  };
}

export async function fetchUnreadNotificationCount() {
  const response = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to load unread notifications');
  }

  const data = await response.json();
  return Number(data.unreadCount || 0);
}

export async function markNotificationRead(notificationId) {
  const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
    method: 'POST',
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to mark notification as read');
  }

  return response.json();
}

export async function markAllNotificationsRead() {
  const response = await fetch(`${API_BASE_URL}/notifications/read-all`, {
    method: 'POST',
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to mark notifications as read');
  }

  return response.json();
}
