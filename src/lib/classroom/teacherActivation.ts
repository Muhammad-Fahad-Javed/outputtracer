/** Compatibility helper for older imports. Teacher access now requires admin review. */
export async function activateTeacherProfile(_client: unknown): Promise<{success:boolean;error?:string}> {
 void _client;
 return {success:false,error:"Administrator approval is required. Submit a teacher application."};
}
