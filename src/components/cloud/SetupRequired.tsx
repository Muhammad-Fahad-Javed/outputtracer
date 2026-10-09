import Link from "next/link";
import { missingCloudEnv } from "@/lib/supabase/env";

export default function SetupRequired() {
  const missing = missingCloudEnv();
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <Link href="/" className="text-sm font-semibold">OutputTracer</Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Connect Supabase to turn on accounts</h1>
      <p className="mt-3 text-sm leading-relaxed text-[#666666]">
        The playground still runs without an account. Shared projects need a new Supabase
        project and three environment variables on the EC2 server. Do not reuse the old ChatT database.
      </p>
      {missing.length > 0 && (
        <ul className="mt-4 list-disc pl-5 font-mono text-sm">
          {missing.map((name) => <li key={name}>{name}</li>)}
        </ul>
      )}
      <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[#333333]">
        <li>Create a Supabase project and run <span className="font-mono">supabase/migrations/0001_cloud_ide.sql</span> in the SQL editor.</li>
        <li>In Authentication, add this site URL and <span className="font-mono">/auth/callback</span> as a redirect URL. Enable Email and, if you want it, Google.</li>
        <li>Put the URL, anon key, and service role key in <span className="font-mono">.env</span> on the server, then recreate the Docker container with <span className="font-mono">--env-file .env</span>.</li>
      </ol>
    </main>
  );
}
