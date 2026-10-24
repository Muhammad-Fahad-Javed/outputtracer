import webpush from 'web-push';
import {createAdminClient} from './supabase/admin';
import {validPushSubscription} from './classroom/pushValidation';
/** One worker per process; database claims serialize delivery/report work across releases. */
export function startBackgroundJobs(){
 if(process.env.NODE_ENV!=='production'||process.env.DISABLE_BACKGROUND_JOBS==='1')return;
 let pushing=false,comparing=false;
 const pushTick=async()=>{if(pushing)return;const a=createAdminClient(),pub=process.env.VAPID_PUBLIC_KEY||process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,priv=process.env.VAPID_PRIVATE_KEY;if(!a||!pub||!priv)return;pushing=true;
 try{webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:admin@outputtracer.com',pub,priv);const {data,error}=await a.rpc('claim_push_jobs');if(error)throw error;
 for(const job of data||[]){try{const subscription=await a.from('push_subscriptions').select('*').eq('id',job.subscription_id).maybeSingle();const notification=await a.from('classroom_notifications').select('id,recipient_id,is_read,link').eq('id',job.notification_id).maybeSingle();if(subscription.error||notification.error)throw Error('Delivery lookup failed');const s=subscription.data,n=notification.data;
 if(!s||!n||n.is_read||s.user_id!==n.recipient_id){await a.from('push_outbox').update({state:'sent'}).eq('id',job.id);continue;}
 const pref=await a.from('notification_preferences').select('push_enabled').eq('user_id',s.user_id).maybeSingle();if(pref.error)throw Error('Preference lookup failed');if(!pref.data?.push_enabled){await a.from('push_outbox').update({state:'sent'}).eq('id',job.id);continue;}
 const payload={endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}};if(!validPushSubscription(payload))throw Error('Invalid subscription');
 await webpush.sendNotification(payload,JSON.stringify({notificationId:n.id,link:n.link}),{TTL:3600,timeout:10000});await a.from('push_outbox').update({state:'sent',last_error:null}).eq('id',job.id);
 }catch(e){const status=(e as {statusCode?:number}).statusCode;if(status===404||status===410){await a.from('push_subscriptions').delete().eq('id',job.subscription_id);}else{await a.from('push_outbox').update({state:job.attempts>=5?'failed':'pending',last_error:'Delivery failed; retry scheduled',next_attempt_at:new Date(Date.now()+Math.min(3600000,15000*2**job.attempts)).toISOString()}).eq('id',job.id);}}}
 }catch{console.warn('Push delivery worker could not claim work.');}finally{pushing=false;}};
 const reportTick=async()=>{if(comparing)return;const a=createAdminClient();if(!a)return;comparing=true;let id:string|undefined;let heartbeat:ReturnType<typeof setInterval>|undefined;
 try{const {data,error}=await a.rpc('claim_similarity_job');if(error)throw error;const job=data?.[0];if(!job)return;id=job.id;heartbeat=setInterval(()=>{void a.from('similarity_jobs').update({locked_at:new Date().toISOString()}).eq('id',job.id).then(()=>{});},30000);heartbeat.unref();const {processSimilarityJob}=await import('./classroom/similarityJobs');await processSimilarityJob(job);
 }catch{if(id)await a.from('similarity_jobs').update({state:'failed',error:'The report could not be completed. Verify teacher approval and retry.',finished_at:new Date().toISOString()}).eq('id',id);else console.warn('Similarity worker could not claim work.');}finally{if(heartbeat)clearInterval(heartbeat);comparing=false;}};
 const p=setInterval(()=>void pushTick(),5000),r=setInterval(()=>void reportTick(),5000);p.unref();r.unref();void pushTick();void reportTick();return()=>{clearInterval(p);clearInterval(r);};
}
