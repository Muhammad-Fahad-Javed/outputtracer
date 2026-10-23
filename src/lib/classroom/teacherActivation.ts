/** Activation deliberately accepts no target user or role: the RPC uses auth.uid(). */
export async function activateTeacherProfile(client: {
  rpc: (name: 'activate_teacher_profile') => PromiseLike<{ error: { message: string } | null }>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await client.rpc('activate_teacher_profile');
    if (error) return { success: false, error: 'Teacher activation is unavailable or your access is restricted. Contact an administrator if this persists.' };
    return { success: true };
  } catch {
    return { success: false, error: 'Teacher activation is temporarily unavailable.' };
  }
}
