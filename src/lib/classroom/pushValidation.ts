/** Only recognized browser push providers may be contacted by the delivery worker. */
export function pushSubscriptionError(value: unknown): string | null {
 if (!value || typeof value !== 'object') return 'Invalid browser push subscription';
 const v = value as {endpoint?: unknown; keys?: {p256dh?: unknown; auth?: unknown}};
 if (typeof v.endpoint !== 'string' || v.endpoint.length > 2048 || !v.keys || typeof v.keys.p256dh !== 'string' || typeof v.keys.auth !== 'string') return 'The browser returned an incomplete push subscription. Website notifications remain available.';
 try {
  const u = new URL(v.endpoint);
  const hosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
  if (u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443') return 'The browser returned an unsafe push endpoint. Website notifications remain available.';
  if (!hosts.includes(u.hostname) && !u.hostname.endsWith('.push.services.mozilla.com') && !u.hostname.endsWith('.notify.windows.com')) return 'This browser\u2019s push service is not supported. Try Chrome, Edge, Firefox or Safari. Website notifications remain available.';
  if (!/^[A-Za-z0-9_-]+$/.test(v.keys.p256dh) || !/^[A-Za-z0-9_-]+$/.test(v.keys.auth) || Buffer.from(v.keys.p256dh, 'base64url').length !== 65 || Buffer.from(v.keys.auth, 'base64url').length !== 16) return 'The browser returned invalid push encryption keys. Try another browser. Website notifications remain available.';
  return null;
 } catch { return 'Invalid browser push subscription'; }
}
export function validPushSubscription(value: unknown): value is {endpoint: string; keys: {p256dh: string; auth: string}} {
 return pushSubscriptionError(value) === null;
}
