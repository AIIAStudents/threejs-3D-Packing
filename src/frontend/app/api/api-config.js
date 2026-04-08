const DEFAULT_API_PORT = '8888';
const FALLBACK_HOSTNAME = '127.0.0.1';

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function resolveDefaultOrigin() {
  const hostname = globalThis.location?.hostname || FALLBACK_HOSTNAME;
  return `http://${hostname}:${DEFAULT_API_PORT}`;
}

export function getApiOrigin() {
  const configuredOrigin = globalThis.__APP_API_ORIGIN__;
  if (typeof configuredOrigin === 'string' && configuredOrigin.trim() !== '') {
    return trimTrailingSlash(configuredOrigin.trim());
  }

  return resolveDefaultOrigin();
}

export function buildApiUrl(path = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiOrigin()}${normalizedPath}`;
}
