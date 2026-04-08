import { buildApiUrl } from './api-config.js';

function isJsonResponse(response) {
  return response.headers.get('content-type')?.includes('application/json');
}

async function parseResponseBody(response) {
  if (response.status === 204) {
    return null;
  }

  if (isJsonResponse(response)) {
    return response.json();
  }

  return response.text();
}

async function request(path, options = {}) {
  const response = await fetch(buildApiUrl(path), options);
  const payload = await parseResponseBody(response);

  if (!response.ok) {
    const message = typeof payload === 'string' && payload.trim() !== ''
      ? payload
      : `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function withJsonBody(method, path, body) {
  return request(path, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

export const apiClient = {
  request,
  get(path, options = {}) {
    return request(path, { method: 'GET', ...options });
  },
  post(path, body, options = {}) {
    return withJsonBody(options.method || 'POST', path, body);
  },
  put(path, body, options = {}) {
    return withJsonBody(options.method || 'PUT', path, body);
  },
  delete(path, options = {}) {
    return request(path, { method: 'DELETE', ...options });
  }
};
