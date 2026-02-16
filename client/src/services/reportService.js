const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export async function createReport(payload) {
  const response = await fetch(`${API_BASE_URL}/reports`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to submit report');
  }

  const data = await response.json();
  return data.report;
}

export async function fetchReports(options = {}) {
  const params = new URLSearchParams();
  if (options.status) {
    params.set('status', options.status);
  }
  if (options.entityType) {
    params.set('entityType', options.entityType);
  }
  if (options.limit) {
    params.set('limit', String(options.limit));
  }

  const response = await fetch(`${API_BASE_URL}/reports${params.toString() ? `?${params.toString()}` : ''}`, {
    credentials: 'include'
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to load reports');
  }

  const data = await response.json();
  return {
    reports: data.reports || [],
    summary: data.summary || { open: 0, resolved: 0, dismissed: 0, total: 0 }
  };
}

export async function reviewReport(reportId, payload) {
  const response = await fetch(`${API_BASE_URL}/reports/${reportId}/review`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to review report');
  }

  const data = await response.json();
  return data.report;
}
