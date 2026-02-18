import { useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import PageMotion from './components/PageMotion.jsx';
import SceneBackdrop from './components/SceneBackdrop.jsx';
import VerifiedName from './components/VerifiedName.jsx';
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
import {
  getCurrentUser,
  logout,
  requestEmailVerification,
  verifyEmailToken
} from './services/authService.js';
import { fetchChatUsers } from './services/chatService.js';
import { fetchUnreadNotificationCount } from './services/notificationService.js';
import { applyTheme, getPreferredTheme } from './services/themeService.js';

const CHAT_UNREAD_UPDATE_EVENT = 'pinboard:chat-unread-update';
const NOTIFICATIONS_UNREAD_UPDATE_EVENT = 'pinboard:notifications-unread-update';

function App() {
  const location = useLocation();
  const allowFreePageScroll =
    location.pathname === '/' ||
    location.pathname === '/boards' ||
    location.pathname.startsWith('/boards/');
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [myPostsVersion, setMyPostsVersion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [verificationToken, setVerificationToken] = useState('');
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [devVerificationToken, setDevVerificationToken] = useState('');
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

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    if (allowFreePageScroll) {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    } else {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [allowFreePageScroll]);

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

  useEffect(() => {
    if (!user || user.isEmailVerified) {
      setVerificationToken('');
      setVerificationError('');
      setVerificationMessage('');
      setDevVerificationToken('');
    }
  }, [user]);

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
      setVerificationToken('');
      setVerificationError('');
      setVerificationMessage('');
      setDevVerificationToken('');
    }
  }

  function onThreadPosted() {
    setMyPostsVersion((current) => current + 1);
  }

  async function onRequestVerification() {
    if (!user || verificationBusy) {
      return;
    }

    setVerificationBusy(true);
    setVerificationError('');
    setVerificationMessage('');
    try {
      const result = await requestEmailVerification();
      setVerificationMessage(result?.message || 'Verification request sent.');
      if (result?.isEmailVerified) {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
        setVerificationToken('');
        setDevVerificationToken('');
        return;
      }
      const nextDevToken = String(result?.devVerificationToken || '').trim();
      setDevVerificationToken(nextDevToken);
      if (nextDevToken) {
        setVerificationToken(nextDevToken);
      }
    } catch (error) {
      setVerificationError(error.message || 'Could not request verification');
    } finally {
      setVerificationBusy(false);
    }
  }

  async function onSubmitVerification(event) {
    event.preventDefault();
    if (!user || verificationBusy) {
      return;
    }

    const token = verificationToken.trim();
    if (!token) {
      setVerificationError('Verification token is required');
      return;
    }

    setVerificationBusy(true);
    setVerificationError('');
    setVerificationMessage('');
    try {
      const updatedUser = await verifyEmailToken(token);
      if (updatedUser) {
        setUser(updatedUser);
      } else {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      }
      setVerificationToken('');
      setVerificationMessage('Email verified successfully.');
      setDevVerificationToken('');
    } catch (error) {
      setVerificationError(error.message || 'Could not verify token');
    } finally {
      setVerificationBusy(false);
    }
  }

  return (
    <div className={`app-shell${allowFreePageScroll ? ' app-shell--free-scroll' : ''}`}>
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
                  <VerifiedName name={user.name} isVerified={user.isEmailVerified} />
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
            {user && !user.isEmailVerified ? (
              <div className="verification-banner" role="region" aria-label="Email verification">
                <div className="verification-banner__content">
                  <p className="verification-banner__title">Verify your email address</p>
                  <p className="verification-banner__text">
                    Verified accounts show a check next to your name.
                  </p>
                  {verificationMessage ? (
                    <p className="verification-banner__feedback">{verificationMessage}</p>
                  ) : null}
                  {verificationError ? (
                    <p className="verification-banner__feedback verification-banner__feedback--error">
                      {verificationError}
                    </p>
                  ) : null}
                  {devVerificationToken ? (
                    <p className="verification-banner__dev-token">
                      Dev token: <code>{devVerificationToken}</code>
                    </p>
                  ) : null}
                </div>
                <div className="verification-banner__actions">
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={onRequestVerification}
                    disabled={verificationBusy}
                  >
                    {verificationBusy ? 'Sending...' : 'Send verification email'}
                  </button>
                  <form className="verification-banner__form" onSubmit={onSubmitVerification}>
                    <input
                      type="text"
                      value={verificationToken}
                      onChange={(event) => setVerificationToken(event.target.value)}
                      placeholder="Paste verification token"
                      aria-label="Verification token"
                    />
                    <button className="btn" type="submit" disabled={verificationBusy || !verificationToken.trim()}>
                      {verificationBusy ? 'Verifying...' : 'Verify'}
                    </button>
                  </form>
                </div>
              </div>
            ) : null}
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
