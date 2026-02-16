const THEME_STORAGE_KEY = 'pinboard.theme';

function isValidTheme(value) {
  return value === 'light' || value === 'dark';
}

export function getPreferredTheme() {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isValidTheme(savedTheme)) {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') {
    return;
  }
  const safeTheme = isValidTheme(theme) ? theme : 'light';
  document.documentElement.setAttribute('data-theme', safeTheme);
}

export function setPreferredTheme(theme) {
  if (typeof window !== 'undefined') {
    const safeTheme = isValidTheme(theme) ? theme : 'light';
    window.localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
    applyTheme(safeTheme);
  }
}

