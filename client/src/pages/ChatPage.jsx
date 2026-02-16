import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchChatUsers, fetchConversation, sendMessage } from '../services/chatService.js';
import { formatDateTime } from '../utils/dateTime.js';
import { renderMentions } from '../utils/renderMentions.jsx';

const CHAT_UNREAD_UPDATE_EVENT = 'pinboard:chat-unread-update';

function unreadTotal(users) {
  return users.reduce((sum, chatUser) => sum + Number(chatUser.unreadCount || 0), 0);
}

function ChatPage({ user }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedUserId = Number(searchParams.get('userId')) || null;
  const sharedThreadId = Number(searchParams.get('shareThreadId')) || null;
  const sharedThreadTitle = String(searchParams.get('shareThreadTitle') || '').trim();

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
  const messageListRef = useRef(null);

  useEffect(() => {
    if (user && chatUsersLoading) {
      return;
    }
    const total = user ? unreadTotal(chatUsers) : 0;
    window.dispatchEvent(
      new CustomEvent(CHAT_UNREAD_UPDATE_EVENT, {
        detail: { total }
      })
    );
  }, [chatUsers, user, chatUsersLoading]);

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
            const nextParams = new URLSearchParams();
            nextParams.set('userId', String(users[0].id));
            if (sharedThreadId) {
              nextParams.set('shareThreadId', String(sharedThreadId));
            }
            if (sharedThreadTitle) {
              nextParams.set('shareThreadTitle', sharedThreadTitle);
            }
            setSearchParams(nextParams, { replace: true });
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
  }, [user, selectedUserId, setSearchParams, userSearch, sharedThreadId, sharedThreadTitle]);

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

  useEffect(() => {
    if (!messageListRef.current) {
      return;
    }
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [messages, selectedUserId]);

  async function onSendMessage(event) {
    event.preventDefault();

    if (!selectedUserId || sending || (!draft.trim() && !sharedThreadId)) {
      return;
    }

    setSending(true);
    setMessagesError('');

    try {
      const created = await sendMessage(selectedUserId, {
        body: draft,
        ...(sharedThreadId ? { sharedThreadId } : {})
      });
      setMessages((current) => [...current, created]);
      setDraft('');
      if (sharedThreadId) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('shareThreadId');
        nextParams.delete('shareThreadTitle');
        setSearchParams(nextParams, { replace: true });
      }
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
                  onClick={() => {
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.set('userId', String(chatUser.id));
                    setSearchParams(nextParams);
                  }}
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

        {sharedThreadId ? (
          <div className="chat-share-banner">
            <p>
              Sharing post:{' '}
              <Link to={`/threads/${sharedThreadId}`}>
                {sharedThreadTitle || `Thread #${sharedThreadId}`}
              </Link>
            </p>
            <p className="muted">
              {selectedUserId
                ? 'This post will be attached to your next message in this chat.'
                : 'Pick a user to send this shared post.'}
            </p>
            <p>
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => {
                  const nextParams = new URLSearchParams(searchParams);
                  nextParams.delete('shareThreadId');
                  nextParams.delete('shareThreadTitle');
                  setSearchParams(nextParams, { replace: true });
                }}
              >
                Cancel Share
              </button>
            </p>
          </div>
        ) : null}

        {messagesError ? <p className="error-text">{messagesError}</p> : null}
        {messagesLoading ? <p className="muted">Loading conversation...</p> : null}

        {!messagesLoading && selectedUserId && messages.length === 0 ? (
          <p className="muted">No messages yet. Say hello.</p>
        ) : null}

        {!selectedUserId ? <p className="muted">Pick someone from the list to start chatting.</p> : null}

        <ul className="chat-message-list" ref={messageListRef}>
          {messages.map((message) => {
            const mine = message.senderUserId === user.id;
            return (
              <li key={message.id} className={`chat-message ${mine ? 'is-mine' : ''}`}>
                {message.body ? <p>{renderMentions(message.body)}</p> : null}
                {message.sharedThreadId ? (
                  <p className="chat-shared-post">
                    <Link className="chat-shared-post__link" to={`/threads/${message.sharedThreadId}`}>
                      <span className="chat-shared-post__label">Shared post</span>
                      <strong>{message.sharedThreadTitle || `Thread #${message.sharedThreadId}`}</strong>
                      {message.sharedThreadBoardSlug ? (
                        <span className="muted">/{message.sharedThreadBoardSlug}</span>
                      ) : null}
                    </Link>
                  </p>
                ) : null}
                <p className="muted chat-message-meta">
                  {formatDateTime(message.createdAt, user?.timezone)}
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
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={sharedThreadId ? 'Add an optional note...' : 'Write a message...'}
              rows={3}
              maxLength={2000}
              required={!sharedThreadId}
            />
            <button
              className="btn"
              type="submit"
              disabled={sending || (!draft.trim() && !sharedThreadId)}
            >
              {sending ? 'Sending...' : sharedThreadId ? 'Share Post' : 'Send'}
            </button>
          </form>
        ) : null}
      </article>
    </section>
  );
}

export default ChatPage;
