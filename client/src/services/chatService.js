const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export async function fetchChatUsers(search = '') {
  const params = new URLSearchParams();
  if (search.trim()) {
    params.set('search', search.trim());
  }

  const response = await fetch(`${API_BASE_URL}/messages/users${params.toString() ? `?${params.toString()}` : ''}`, {
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to load chats');
  }

  const data = await response.json();
  return data.users || [];
}

export async function fetchConversation(userId) {
  const response = await fetch(`${API_BASE_URL}/messages/${userId}`, {
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to load conversation');
  }

  return response.json();
}

export async function sendMessage(userId, body) {
  const response = await fetch(`${API_BASE_URL}/messages/${userId}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to send message');
  }

  const data = await response.json();
  return data.message;
}
