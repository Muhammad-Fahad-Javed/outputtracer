import {describe,it,expect} from 'vitest';
import {validPushSubscription,pushSubscriptionError} from './pushValidation';
const keys={p256dh:Buffer.alloc(65,1).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')};
describe('push subscription destination validation',()=>{
 it('accepts supported HTTPS push providers',()=>{for(const host of ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns1.notify.windows.com'])expect(validPushSubscription({endpoint:`https://${host}/push/token`,keys})).toBe(true);});
 it('rejects local, credentialed, spoofed and malformed endpoints or keys',()=>{for(const endpoint of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://fcm.googleapis.com.attacker.com/x','https://user@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x'])expect(validPushSubscription({endpoint,keys})).toBe(false);expect(validPushSubscription({endpoint:'https://fcm.googleapis.com/x',keys:{...keys,auth:'a'}})).toBe(false);});
});

it('distinguishes unsupported services from malformed keys without exposing endpoint tokens',()=>{const endpoint='https://unsupported.example/private-device-token';expect(pushSubscriptionError({endpoint,keys})).toContain('push service is not supported');expect(pushSubscriptionError({endpoint,keys})).not.toContain('private-device-token');expect(pushSubscriptionError({endpoint:'https://fcm.googleapis.com/private-device-token',keys:{...keys,auth:'a'}})).toContain('encryption keys');expect(pushSubscriptionError({endpoint:'https://fcm.googleapis.com/x',keys})).toBeNull();});
