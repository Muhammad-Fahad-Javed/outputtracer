/**
 * messagingService.ts
 *
 * Core service for:
 * 1. Private teacher-student DMs
 * 2. Classroom-wide group messaging
 * 3. Message read status tracking and unread counts
 */

import { isUuid } from "@/lib/cloud/roles";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthConfigured } from "@/lib/supabase/env";
import { getClassroom } from "./classroomService";
import type {
  ClassroomMessage,
  SendMessageInput,
} from "./communicationTypes";

// ==============================================================================
// In-Memory Fallback Stores (Unit tests & offline operation)
// ==============================================================================
const memMessages = new Map<string, ClassroomMessage[]>(); // conversationKey -> messages

export function _resetMessagingMemory(): void {
  memMessages.clear();
}

function getConversationKey(classroomId: string, userAId?: string, userBId?: string): string {
  if (!userAId || !userBId) {
    return `${classroomId}:group`;
  }
  const [first, second] = [userAId, userBId].sort();
  return `${classroomId}:dm:${first}:${second}`;
}

// ==============================================================================
// 1. Send Message
// ==============================================================================

export async function sendMessage(
  classroomId: string,
  senderId: string,
  input: SendMessageInput
): Promise<{ success: boolean; message?: ClassroomMessage; error?: string }> {
  const content = typeof input.content==="string"?input.content.trim():"";
  if(isAuthConfigured()&&input.clientRequestId&&!isUuid(input.clientRequestId))return {success:false,error:"Invalid message request ID."};
  if (!content || content.length > 5000) {
    return { success: false, error: "Message content must be between 1 and 5000 characters." };
  }

  const access = await getClassroom(senderId, classroomId);
  if (!access.success) {
    return { success: false, error: "Access denied. You are not a member of this classroom." };
  }

  const isTeacher = !!access.isTeacher;
  const isGroupMessage = !input.recipientId;

  // If DM, verify recipient is in the classroom and permitted
  if (input.recipientId) {
    const recipientAccess = await getClassroom(input.recipientId, classroomId);
    if (!recipientAccess.success) {
      return { success: false, error: "Recipient is not a member of this classroom." };
    }

    // Teacher can DM any member. Student can DM their teacher.
    if (!isTeacher && !recipientAccess.isTeacher) {
      return { success: false, error: "Students can privately message their instructor or use the classroom group chat." };
    }
  }

  if (isAuthConfigured()) {
    const admin = createAdminClient();
    if (admin) {
      const { data, error } = await admin.rpc("send_classroom_message",{
        actor:senderId,cid:classroomId,body:content,recipient:input.recipientId||null,request_id:input.clientRequestId||randomUUID(),
      });
      if (!error && data) {
        const row = data as Record<string, unknown>;
        const senderProfile = row.sender as Record<string, unknown> | null;

        const message: ClassroomMessage = {
          id: String(row.id),
          classroomId: String(row.classroom_id),
          senderId: String(row.sender_id),
          senderName: String(row.senderName || senderProfile?.display_name || "Class member"),
          recipientId: row.recipient_id ? String(row.recipient_id) : undefined,
          recipientName: row.recipientName ? String(row.recipientName) : undefined,
          content: String(row.content),
          isGroupMessage: Boolean(row.is_group_message),
          isRead: Boolean(row.is_read),
          createdAt: String(row.created_at),
        };
        return { success: true, message };
      }
    }
  }

  if (isAuthConfigured()) return {success:false,error:"Message could not be saved. Please retry."};

  // Fallback to in-memory store
  const convKey = getConversationKey(classroomId, senderId, input.recipientId);
  const existing = memMessages.get(convKey) || [];

  const fallbackMessage: ClassroomMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    classroomId,
    senderId,
    senderName: isTeacher ? "Instructor" : "Student",
    recipientId: input.recipientId,
    recipientName: input.recipientId ? "Recipient" : undefined,
    content,
    isGroupMessage,
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  existing.push(fallbackMessage);
  memMessages.set(convKey, existing);

  return { success: true, message: fallbackMessage };
}

// ==============================================================================
// 2. List Messages
// ==============================================================================

export async function listMessages(
  classroomId: string,
  userId: string,
  opts?: { recipientId?: string; limit?: number; offset?: number }
): Promise<{ success: boolean; messages: ClassroomMessage[]; error?: string }> {
  const access = await getClassroom(userId, classroomId);
  if (!access.success) {
    return { success: false, messages: [], error: "Access denied." };
  }

  if(opts?.recipientId&&((isAuthConfigured()&&!isUuid(opts.recipientId))||(!access.isTeacher&&opts.recipientId!==access.classroom?.teacherId)))return {success:false,messages:[],error:"Conversation access denied."};
  const limit = Math.min(Math.max(Number.isFinite(opts?.limit)?Math.floor(opts!.limit!):50, 1), 100);
  const offset = Math.max(Number.isFinite(opts?.offset)?Math.floor(opts!.offset!):0, 0);

  if (isAuthConfigured()) {
    const admin = createAdminClient();
    if (admin) {
      let query = admin
        .from("classroom_messages")
        .select(`
          id,
          classroom_id,
          sender_id,
          recipient_id,
          content,
          is_group_message,
          is_read,
          created_at,
          sender:profiles!classroom_messages_sender_id_fkey(display_name),
          recipient:profiles!classroom_messages_recipient_id_fkey(display_name)
        `)
        .eq("classroom_id", classroomId);

      if (opts?.recipientId) {
        // DM thread between userId and recipientId
        query = query
          .eq("is_group_message", false)
          .or(`and(sender_id.eq.${userId},recipient_id.eq.${opts.recipientId}),and(sender_id.eq.${opts.recipientId},recipient_id.eq.${userId})`);
      } else {
        // Classroom group messages
        query = query.eq("is_group_message", true);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (!error && data) {
        const {data:readRows,error:readError}=await admin.from('classroom_notifications').select('message_id,is_read').eq('recipient_id',userId).in('message_id',data.map(row=>row.id));
        if(readError)return {success:false,messages:[],error:'Message read state could not be loaded.'};
        const readByMessage=new Map((readRows||[]).map(n=>[n.message_id,n.is_read]));
        const messages: ClassroomMessage[] = [...data].reverse().map((item: unknown) => {
          const row = item as Record<string, unknown>;
          const senderProfile = row.sender as Record<string, unknown> | null;
          const recipientProfile = row.recipient as Record<string, unknown> | null;
          return {
            id: String(row.id),
            classroomId: String(row.classroom_id),
            senderId: String(row.sender_id),
            senderName: String(senderProfile?.display_name || "Class member"),
            recipientId: row.recipient_id ? String(row.recipient_id) : undefined,
            recipientName: recipientProfile ? String(recipientProfile.display_name || "Class member") : undefined,
            content: String(row.content),
            isGroupMessage: Boolean(row.is_group_message),
            isRead: readByMessage.get(String(row.id))??false,
            createdAt: String(row.created_at),
          };
        });
        return { success: true, messages };
      }
    }
  }

  if (isAuthConfigured()) return {success:false,messages:[],error:"Messages could not be loaded."};
  // Memory fallback
  const convKey = getConversationKey(classroomId, opts?.recipientId ? userId : undefined, opts?.recipientId);
  const list = memMessages.get(convKey) || [];
  return { success: true, messages: list.slice(offset, offset + limit) };
}

// ==============================================================================
// 3. List Conversations
// ==============================================================================

export interface ConversationSummary {
  partnerId?: string;
  partnerName?: string;
  isGroup: boolean;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
}

export async function listConversations(
  classroomId: string,
  userId: string
): Promise<{ success: boolean; conversations: ConversationSummary[]; error?: string }> {
  const access = await getClassroom(userId, classroomId);
  if (!access.success) {
    return { success: false, conversations: [], error: "Access denied." };
  }

  const isTeacher = !!access.isTeacher;

  if (isAuthConfigured()) {
    const admin = createAdminClient();
    if (admin) {
      // 1. Group conversation preview
      const { data: groupLastMsg } = await admin
        .from("classroom_messages")
        .select("content, created_at")
        .eq("classroom_id", classroomId)
        .eq("is_group_message", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const conversations: ConversationSummary[] = [
        {
          isGroup: true,
          partnerName: "Classroom Group Chat",
          lastMessage: groupLastMsg?.content || "No messages yet",
          lastMessageAt: groupLastMsg?.created_at,
          unreadCount: 0,
        },
      ];

      // 2. DM threads (Teachers see all students they've chatted with or members in classroom)
      if (isTeacher) {
        // Fetch roster to show potential DM partners
        const { data: members } = await admin
          .from("classroom_members")
          .select(`
            user_id,
            profile:profiles(id, display_name)
          `)
          .eq("classroom_id", classroomId);

        if (members) {
          for (const m of members as Record<string, unknown>[]) {
            const memberId = String(m.user_id);
            if (memberId === userId) continue;

            const profile = m.profile as Record<string, unknown> | null;
            const partnerName = String(profile?.display_name || "Student");

            const { data: lastMsg } = await admin
              .from("classroom_messages")
              .select("content, created_at, is_read, sender_id")
              .eq("classroom_id", classroomId)
              .eq("is_group_message", false)
              .or(`and(sender_id.eq.${userId},recipient_id.eq.${memberId}),and(sender_id.eq.${memberId},recipient_id.eq.${userId})`)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            const { count: unreadCount } = await admin
              .from("classroom_messages")
              .select("id", { count: "exact", head: true })
              .eq("classroom_id", classroomId)
              .eq("sender_id", memberId)
              .eq("recipient_id", userId)
              .eq("is_read", false);

            conversations.push({
              partnerId: memberId,
              partnerName,
              isGroup: false,
              lastMessage: lastMsg?.content || "No messages yet",
              lastMessageAt: lastMsg?.created_at,
              unreadCount: unreadCount || 0,
            });
          }
        }
      } else {
        // Student: Include direct chat thread with classroom instructor
        const teacherId = access.classroom?.teacherId;
        if (teacherId && teacherId !== userId) {
          const { data: teacherProfile } = await admin
            .from("profiles")
            .select("id, display_name")
            .eq("id", teacherId)
            .maybeSingle();

          const teacherName = String(
            teacherProfile?.display_name || "Instructor"
          );

          const { data: lastMsg } = await admin
            .from("classroom_messages")
            .select("content, created_at, is_read, sender_id")
            .eq("classroom_id", classroomId)
            .eq("is_group_message", false)
            .or(`and(sender_id.eq.${userId},recipient_id.eq.${teacherId}),and(sender_id.eq.${teacherId},recipient_id.eq.${userId})`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const { count: unreadCount } = await admin
            .from("classroom_messages")
            .select("id", { count: "exact", head: true })
            .eq("classroom_id", classroomId)
            .eq("sender_id", teacherId)
            .eq("recipient_id", userId)
            .eq("is_read", false);

          conversations.push({
            partnerId: teacherId,
            partnerName: `${teacherName} (Instructor)`,
            isGroup: false,
            lastMessage: lastMsg?.content || "Message your instructor privately",
            lastMessageAt: lastMsg?.created_at,
            unreadCount: unreadCount || 0,
          });
        }
      }

      const {data: unread,error:unreadError}=await admin.from('classroom_notifications').select('link').eq('classroom_id',classroomId).eq('recipient_id',userId).eq('is_read',false).not('message_id','is',null);
      if(unreadError)return {success:false,conversations:[],error:'Could not load unread counts.'};
      for(const conv of conversations){const link=`/classroom/${classroomId}/messages${conv.partnerId?'?recipientId='+conv.partnerId:''}`;conv.unreadCount=(unread||[]).filter(n=>n.link===link).length;}
      return { success: true, conversations };
    }
  }

  if(isAuthConfigured())return {success:false,conversations:[],error:"Conversations could not be loaded."};
  // Memory fallback
  const conversations: ConversationSummary[] = [
    {
      isGroup: true,
      partnerName: "Classroom Group Chat",
      lastMessage: "Welcome to group chat",
      unreadCount: 0,
    },
  ];

  return { success: true, conversations };
}

// ==============================================================================
// 4. Mark Messages Read & Unread Count
// ==============================================================================

export async function markMessagesRead(classroomId:string,userId:string,senderId?:string):Promise<{success:boolean;error?:string}>{
 const access=await getClassroom(userId,classroomId);if(!access.success)return {success:false,error:access.error};
 const admin=createAdminClient();
 if(admin){const link=`/classroom/${classroomId}/messages${senderId?'?recipientId='+senderId:''}`;const {error}=await admin.from('classroom_notifications').update({is_read:true}).eq('classroom_id',classroomId).eq('recipient_id',userId).eq('link',link);return error?{success:false,error:'Could not mark messages read.'}:{success:true};}
 return isAuthConfigured()?{success:false,error:'Notification database unavailable.'}:{success:true};
}

export async function getUnreadMessageCount(userId:string):Promise<number>{const admin=createAdminClient();if(!admin)return 0;const {count,error}=await admin.from('classroom_notifications').select('id',{count:'exact',head:true}).eq('recipient_id',userId).eq('is_read',false).not('message_id','is',null);if(error)throw Error('Could not load unread message count.');return count||0;}
