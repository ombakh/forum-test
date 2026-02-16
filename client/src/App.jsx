import { useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import PageMotion from './components/PageMotion.jsx';
import SceneBackdrop from './components/SceneBackdrop.jsx';
import HomePage from './pages/HomePage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import BoardPage from './pages/BoardPage.jsx';
import BoardsPage from './pages/BoardsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import MyPostsSidebar from './components/MyPostsSidebar.jsx';
import PostPage from './pages/PostPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ThreadPage from './pages/ThreadPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import ModerationPage from './pages/ModerationPage.jsx';
import { getCurrentUser, logout } from './services/authService.js';
import { fetchChatUsers } from './services/chatService.js';
import { fetchUnreadNotificationCount } from './services/notificationService.js';
import { applyTheme, getPreferredTheme } from './services/themeService.js';

const CHAT_UNREAD_UPDATE_EVENT = 'pinboard:chat-unread-update';
const NOTIFICATIONS_UNREAD_UPDATE_EVENT = 'pinboard:notifications-unread-update';

function App() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [myPostsVersion, setMyPostsVersion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const menuRef = useRef(null);
  const closeMenuTimeoutRef = useRef(null);

  function clearCloseMenuTimeout() {
    if (closeMenuTimeoutRef.current) {
      window.clearTimeout(closeMenuTimeoutRef.current);
      closeMenuTimeoutRef.current = null;
    }
  }

  function openMenu() {
    clearCloseMenuTimeout();
    setMenuOpen(true);
  }

  function queueCloseMenu() {
    clearCloseMenuTimeout();
    closeMenuTimeoutRef.current = window.setTimeout(() => {
      setMenuOpen(false);
      closeMenuTimeoutRef.current = null;
    }, 260);
  }

  useEffect(() => {
    applyTheme(getPreferredTheme());
  }, []);

  useEffect(
    () => () => {
      clearCloseMenuTimeout();
    },
    []
  );

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      try {
        const currentUser = await getCurrentUser();
        if (active) {
          setUser(currentUser);
        }
      } catch (_error) {
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setAuthLoading(false);
        }
      }
    }

    loadCurrentUser();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let intervalId = null;

    async function loadUnreadMessages() {
      if (!user) {
        if (active) {
          setUnreadMessages(0);
        }
        return;
      }

      try {
        const chatUsers = await fetchChatUsers();
        if (!active) {
          return;
        }
        const unreadTotal = chatUsers.reduce(
          (sum, chatUser) => sum + Number(chatUser.unreadCount || 0),
          0
        );
        setUnreadMessages(unreadTotal);
      } catch (_error) {
        if (active) {
          setUnreadMessages(0);
        }
      }
    }

    loadUnreadMessages();
    if (user) {
      intervalId = window.setInterval(loadUnreadMessages, 7000);
    }

    return () => {
      active = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [user]);

  useEffect(() => {
    let active = true;
    let intervalId = null;

    async function loadUnreadNotifications() {
      if (!user) {
        if (active) {
          setUnreadNotifications(0);
        }
        return;
      }

      try {
        const unreadCount = await fetchUnreadNotificationCount();
        if (active) {
          setUnreadNotifications(Math.max(0, Number(unreadCount || 0)));
        }
      } catch (_error) {
        if (active) {
          setUnreadNotifications(0);
        }
      }
    }

    loadUnreadNotifications();
    if (user) {
      intervalId = window.setInterval(loadUnreadNotifications, 7000);
    }

    return () => {
      active = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [user]);

  useEffect(() => {
    function onUnreadUpdate(event) {
      const total = Number(event?.detail?.total);
      if (!Number.isFinite(total)) {
        return;
      }
      setUnreadMessages(Math.max(0, total));
    }

    window.addEventListener(CHAT_UNREAD_UPDATE_EVENT, onUnreadUpdate);
    return () => {
      window.removeEventListener(CHAT_UNREAD_UPDATE_EVENT, onUnreadUpdate);
    };
  }, []);

  useEffect(() => {
    function onNotificationsUnreadUpdate(event) {
      const total = Number(event?.detail?.total);
      if (!Number.isFinite(total)) {
        return;
      }
      setUnreadNotifications(Math.max(0, total));
    }

    window.addEventListener(NOTIFICATIONS_UNREAD_UPDATE_EVENT, onNotificationsUnreadUpdate);
    return () => {
      window.removeEventListener(NOTIFICATIONS_UNREAD_UPDATE_EVENT, onNotificationsUnreadUpdate);
    };
  }, []);

  useEffect(() => {
    function onPointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        clearCloseMenuTimeout();
        setMenuOpen(false);
      }
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        clearCloseMenuTimeout();
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    clearCloseMenuTimeout();
    setMenuOpen(false);
  }, [location.pathname]);

  async function onLogout() {
    try {
      await logout();
    } finally {
      setUser(null);
      setUnreadMessages(0);
      setUnreadNotifications(0);
      clearCloseMenuTimeout();
      setMenuOpen(false);
      setMyPostsVersion((current) => current + 1);
    }
  }

  function onThreadPosted() {
    setMyPostsVersion((current) => current + 1);
  }

  return (
    <div className="app-shell">
      <SceneBackdrop />
      <div className="app-shell__content">
        <header className="topbar">
          <Link to="/" className="topbar__brand">
            <span className="topbar__brand-mark" aria-hidden="true">
              📌
            </span>
            <span>Pinboard</span>
          </Link>
          <nav className="topbar__nav">
            <Link to="/">Home</Link>
            <Link to="/boards">Boards</Link>
            <Link to="/post">Post</Link>
            {user ? (
              <Link to="/messages" className="topbar-messages-link">
                Messages
                {unreadMessages > 0 ? (
                  <span className="topbar-notification-pill" aria-label={`${unreadMessages} unread messages`}>
                    {unreadMessages > 99 ? '99+' : unreadMessages}
                  </span>
                ) : null}
              </Link>
            ) : null}
            {user ? (
              <Link to="/notifications" className="topbar-messages-link">
                Notifications
                {unreadNotifications > 0 ? (
                  <span className="topbar-notification-pill" aria-label={`${unreadNotifications} unread notifications`}>
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                ) : null}
              </Link>
            ) : null}
            {user && (user.isAdmin || user.isModerator) ? <Link to="/moderation">Moderation</Link> : null}
            {authLoading ? null : user ? (
              <div
                className={`profile-menu ${menuOpen ? 'is-open' : ''}`}
                ref={menuRef}
                onMouseEnter={openMenu}
                onMouseLeave={queueCloseMenu}
                onFocusCapture={openMenu}
                onBlurCapture={(event) => {
                  if (!menuRef.current?.contains(event.relatedTarget)) {
                    queueCloseMenu();
                  }
                }}
              >
                <Link
                  to={`/users/${user.id}`}
                  className="profile-menu__trigger"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  <span className="profile-icon" aria-hidden="true">
                    {user.profileImageUrl ? <img src={user.profileImageUrl} alt="" /> : '👤'}
                  </span>
                  <span>{user.name}</span>
                </Link>
                {menuOpen ? (
                  <div className="profile-menu__dropdown" role="menu">
                    <Link to="/settings" onClick={() => setMenuOpen(false)} role="menuitem">
                      Account settings
                    </Link>
                    {user.isAdmin ? (
                      <Link to="/admin" onClick={() => setMenuOpen(false)} role="menuitem">
                        Admin panel
                      </Link>
                    ) : null}
                    <button type="button" onClick={onLogout} role="menuitem">
                      Logout
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link to="/login">Login</Link>
            )}
          </nav>
        </header>

        <div className="content-grid">
          <main className="main-panel">
            <PageMotion routeKey={location.pathname}>
              <Routes location={location}>
                <Route path="/" element={<HomePage user={user} />} />
                <Route path="/boards" element={<BoardsPage user={user} />} />
                <Route path="/boards/:slug" element={<BoardPage user={user} />} />
                <Route
                  path="/post"
                  element={<PostPage user={user} onThreadPosted={onThreadPosted} />}
                />
                <Route path="/admin" element={<AdminPage user={user} />} />
                <Route path="/login" element={<LoginPage onAuthSuccess={setUser} />} />
                <Route path="/users/:userId" element={<ProfilePage user={user} />} />
                <Route
                  path="/settings"
                  element={<SettingsPage user={user} onUserUpdated={setUser} />}
                />
                <Route path="/threads/:threadId" element={<ThreadPage user={user} />} />
                <Route path="/messages" element={<ChatPage user={user} />} />
                <Route path="/notifications" element={<NotificationsPage user={user} />} />
                <Route path="/moderation" element={<ModerationPage user={user} />} />
              </Routes>
            </PageMotion>
          </main>

          <aside className="sidebar">
            <MyPostsSidebar user={user} version={myPostsVersion} />
          </aside>
        </div>
      </div>
    </div>
  );
}

export default App;
