import { useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import PageMotion from './components/PageMotion.jsx';
import HomePage from './pages/HomePage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import BoardPage from './pages/BoardPage.jsx';
import BoardsPage from './pages/BoardsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MyPostsSidebar from './components/MyPostsSidebar.jsx';
import PostPage from './pages/PostPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import ThreadPage from './pages/ThreadPage.jsx';
import { getCurrentUser, logout } from './services/authService.js';

function App() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [myPostsVersion, setMyPostsVersion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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
    function onPointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
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

  async function onLogout() {
    try {
      await logout();
    } finally {
      setUser(null);
      setMenuOpen(false);
      setMyPostsVersion((current) => current + 1);
    }
  }

  function onThreadPosted() {
    setMyPostsVersion((current) => current + 1);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="topbar__brand">
          Pinboard
        </Link>
        <nav className="topbar__nav">
          <Link to="/">Home</Link>
          <Link to="/boards">Boards</Link>
          <Link to="/post">Post</Link>
          {authLoading ? null : user ? (
            <div className="profile-menu" ref={menuRef}>
              <button
                type="button"
                className="profile-menu__trigger"
                onClick={() => setMenuOpen((current) => !current)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="profile-icon" aria-hidden="true">
                  👤
                </span>
                <span>{user.name}</span>
              </button>
              {menuOpen ? (
                <div className="profile-menu__dropdown" role="menu">
                  <Link to={`/users/${user.id}`} onClick={() => setMenuOpen(false)} role="menuitem">
                    Go to my profile
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
              <Route path="/users/:userId" element={<ProfilePage />} />
              <Route path="/threads/:threadId" element={<ThreadPage user={user} />} />
            </Routes>
          </PageMotion>
        </main>

        <aside className="sidebar">
          <MyPostsSidebar user={user} version={myPostsVersion} />
        </aside>
      </div>
    </div>
  );
}

export default App;
