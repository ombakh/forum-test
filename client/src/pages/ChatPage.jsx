import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchChatUsers, fetchConversation, sendMessage } from '../services/chatService.js';

function ChatPage({ user }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedUserId = Number(searchParams.get('userId')) || null;

  const [chatUsers, setChatUsers] = useState([]);
  const [chatUsersLoading, setChatUsersLoading] = useState(true);
  const [chatUsersError, setChatUsersError] = useState('');

  const [conversationUser, setConversationUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    let active = true;

    async function loadChats() {
      if (!user) {
        setChatUsers([]);
        setChatUsersLoading(false);
        setChatUsersError('');
        return;
      }

      setChatUsersLoading(true);
      setChatUsersError('');
      try {
        const users = await fetchChatUsers(userSearch);
        if (active) {
          setChatUsers(users);
          if (!selectedUserId && users.length > 0) {
            setSearchParams({ userId: String(users[0].id) }, { replace: true });
          }
        }
      } catch (error) {
        if (active) {
          setChatUsersError(error.message || 'Could not load chats');
        }
      } finally {
        if (active) {
          setChatUsersLoading(false);
        }
      }
    }

    loadChats();

    return () => {
      active = false;
    };
  }, [user, selectedUserId, setSearchParams, userSearch]);

  useEffect(() => {
    let active = true;

    async function loadConversation() {
      if (!user || !selectedUserId) {
        setConversationUser(null);
        setMessages([]);
        setMessagesError('');
        setMessagesLoading(false);
        return;
      }

      setMessagesLoading(true);
      setMessagesError('');
      try {
        const data = await fetchConversation(selectedUserId);
        if (active) {
          setConversationUser(data.user || null);
          setMessages(data.messages || []);
          setChatUsers((current) =>
            current.map((chatUser) =>
              chatUser.id === selectedUserId ? { ...chatUser, unreadCount: 0 } : chatUser
            )
          );
        }
      } catch (error) {
        if (active) {
          setConversationUser(null);
          setMessages([]);
          setMessagesError(error.message || 'Could not load conversation');
        }
      } finally {
        if (active) {
          setMessagesLoading(false);
        }
      }
    }

    loadConversation();

    return () => {
      active = false;
    };
  }, [user, selectedUserId]);

  useEffect(() => {
    if (!user || !selectedUserId) {
      return undefined;
    }

    const interval = window.setInterval(async () => {
      try {
        const [users, data] = await Promise.all([
          fetchChatUsers(userSearch),
          fetchConversation(selectedUserId)
        ]);
        setChatUsers(users);
        setConversationUser(data.user || null);
        setMessages(data.messages || []);
      } catch (_error) {
        // Quiet background polling failure.
      }
    }, 8000);

    return () => {
      window.clearInterval(interval);
    };
  }, [user, selectedUserId, userSearch]);

  const selectedChatUser = useMemo(
    () => chatUsers.find((chatUser) => chatUser.id === selectedUserId) || null,
    [chatUsers, selectedUserId]
  );

  async function onSendMessage(event) {
    event.preventDefault();

    if (!selectedUserId || sending) {
      return;
    }

    setSending(true);
    setMessagesError('');

    try {
      const created = await sendMessage(selectedUserId, draft);
      setMessages((current) => [...current, created]);
      setDraft('');
      const users = await fetchChatUsers(userSearch);
      setChatUsers(users);
    } catch (error) {
      setMessagesError(error.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  if (!user) {
    return (
      <article className="card">
        <h1 className="page-title">Messages</h1>
        <p className="muted">
          <Link to="/login">Login</Link> to chat with other users.
        </p>
      </article>
    );
  }

  return (
    <section className="chat-layout card">
      <aside className="chat-sidebar">
        <h2>Chats</h2>
        {chatUsersLoading ? <p className="muted">Loading chats...</p> : null}
        {chatUsersError ? <p className="error-text">{chatUsersError}</p> : null}
        <input
          type="search"
          value={userSearch}
          onChange={(event) => setUserSearch(event.target.value)}
          placeholder="Search users..."
          aria-label="Search users"
        />
        {!chatUsersLoading && chatUsers.length === 0 ? (
          <p className="muted">
            {userSearch.trim() ? 'No matching users found.' : 'No other users found yet.'}
          </p>
        ) : null}

        <ul className="chat-user-list">
          {chatUsers.map((chatUser) => {
            const isSelected = chatUser.id === selectedUserId;
            return (
              <li key={chatUser.id}>
                <button
                  type="button"
                  className={`chat-user-btn ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => setSearchParams({ userId: String(chatUser.id) })}
                >
                  <span className="chat-user-name">{chatUser.name}</span>
                  {chatUser.unreadCount > 0 ? (
                    <span className="chat-unread-pill">{chatUser.unreadCount}</span>
                  ) : null}
                  <span className="muted chat-preview">
                    {chatUser.lastMessage
                      ? `${chatUser.lastMessage.slice(0, 48)}${chatUser.lastMessage.length > 48 ? '...' : ''}`
                      : 'No messages yet'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <article className="chat-panel">
        <header className="chat-panel__header">
          <h2>{conversationUser ? conversationUser.name : selectedChatUser?.name || 'Select a chat'}</h2>
        </header>

        {messagesError ? <p className="error-text">{messagesError}</p> : null}
        {messagesLoading ? <p className="muted">Loading conversation...</p> : null}

        {!messagesLoading && selectedUserId && messages.length === 0 ? (
          <p className="muted">No messages yet. Say hello.</p>
        ) : null}

        {!selectedUserId ? <p className="muted">Pick someone from the list to start chatting.</p> : null}

        <ul className="chat-message-list">
          {messages.map((message) => {
            const mine = message.senderUserId === user.id;
            return (
              <li key={message.id} className={`chat-message ${mine ? 'is-mine' : ''}`}>
                <p>{message.body}</p>
                <p className="muted chat-message-meta">
                  {new Date(message.createdAt).toLocaleString()}
                  {mine && message.readAt ? ' • seen' : ''}
                </p>
              </li>
            );
          })}
        </ul>

        {selectedUserId ? (
          <form className="chat-compose" onSubmit={onSendMessage}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a message..."
              rows={3}
              maxLength={2000}
              required
            />
            <button className="btn" type="submit" disabled={sending || !draft.trim()}>
              {sending ? 'Sending...' : 'Send'}
            </button>
          </form>
        ) : null}
      </article>
    </section>
  );
}

export default ChatPage;
