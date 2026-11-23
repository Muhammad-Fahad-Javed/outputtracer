import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CLASSROOM_LANGUAGES, classroomLanguage } from "@/lib/classroom/languages";
import { dashboardPageNumber, dashboardPageSize, requireTeacherDashboardAdmin } from "../access";
import { DashboardFrame, DashboardNotice, DashboardPager } from "../DashboardFrame";
import AdminCreateClassroom from "@/components/admin/AdminCreateClassroom";

export const metadata: Metadata = { title: "Teacher Dashboard | OutputTracer Admin" };

const directory = "/admin/teacher-dashboards";

export default async function AdminTeacherDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { teacherId } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(teacherId)) notFound();
  const path = `${directory}/${teacherId}`;
  const db = await requireTeacherDashboardAdmin(path);
  const page = dashboardPageNumber((await searchParams).page);
  const start = (page - 1) * dashboardPageSize;
  const [profile, verification, classes] = db
    ? await Promise.all([
      db.from("profiles").select("display_name, email").eq("id", teacherId).maybeSingle(),
      db.from("teacher_profiles").select("status").eq("user_id", teacherId).maybeSingle(),
      db.from("classrooms").select("id, name, subject, language, is_archived", { count: "exact" })
        .eq("teacher_id", teacherId).order("created_at", { ascending: false }).order("id")
        .range(start, start + dashboardPageSize - 1),
    ])
    : [null, null, null];
  const unavailable = !db || !!(profile?.error || verification?.error || classes?.error);
  if (!unavailable && (!profile?.data || (!verification?.data && !classes?.count))) notFound();

  const name = profile?.data?.display_name?.trim() || profile?.data?.email;
  const classList = classes?.data ?? [];
  const classCount = classes?.count ?? 0;
  return (
    <DashboardFrame
      back={directory}
      backLabel="All teacher dashboards"
      title={name ? `${name} · Teacher dashboard` : "Teacher dashboard"}
      description="Open a class to review assignments and submissions, or manage its roster, groups, and class settings."
    >
      {unavailable ? (
        <DashboardNotice error>This teacher dashboard could not be loaded. Try again in a moment.</DashboardNotice>
      ) : (
        <>
          <p className="mb-4 text-sm text-neutral-700">
            {profile?.data?.email && profile.data.email !== name ? `${profile.data.email} · ` : ""}
            {verification?.data && <><span className="capitalize">{verification.data.status.replaceAll("_", " ")}</span> · </>}
            {classCount} {classCount === 1 ? "classroom" : "classrooms"}
          </p>
          {verification?.data?.status === "approved" && <AdminCreateClassroom teacherId={teacherId}/>}
          {classList.length === 0 ? (
            <DashboardNotice>{classCount ? "There are no classrooms on this page." : "This teacher has not created any classrooms."}</DashboardNotice>
          ) : (
            <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
              {classList.map((classroom) => {
                const classPath = `/classroom/${classroom.id}`;
                const language = CLASSROOM_LANGUAGES[classroomLanguage(classroom.language, classroom.subject)].label;
                return (
                  <li key={classroom.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <h2 className="font-semibold">{classroom.name}</h2>
                      <p className="text-sm text-neutral-700">{classroom.subject} · {language} · {classroom.is_archived ? "Archived" : "Active"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm font-medium">
                      <Link href={classPath} prefetch={false} className="rounded border border-neutral-300 px-3 py-2 hover:bg-neutral-100">Open classroom</Link>
                      <Link href={`${classPath}/manage`} prefetch={false} className="rounded bg-black px-3 py-2 text-white hover:bg-neutral-800">Manage class</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <DashboardPager
            page={page}
            previous={page > 1 ? `${path}?page=${page - 1}` : undefined}
            next={page * dashboardPageSize < classCount ? `${path}?page=${page + 1}` : undefined}
          />
        </>
      )}
    </DashboardFrame>
  );
}
