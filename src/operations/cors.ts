export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const values = [env.FRONTEND_URL, ...(env.CORS_ORIGINS || '').split(',')];
  if (env.NODE_ENV !== 'production') values.push('http://localhost:4200', 'http://127.0.0.1:4200');
  return new Set(values.filter((value): value is string => Boolean(value?.trim())).map(value => {
    try {
      const url = new URL(value.trim());
      return ['http:', 'https:'].includes(url.protocol) && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password ? url.origin : '';
    } catch { return ''; }
  }).filter(Boolean));
}
export function originAllowed(origin: string | undefined, origins: Set<string>): boolean {
  // Native clients and provider webhooks do not supply an Origin header.
  return !origin || origins.has(origin);
}
