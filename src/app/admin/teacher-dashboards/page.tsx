import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { dashboardPageNumber, dashboardPageSize, requireTeacherDashboardAdmin } from "./access";
import { DashboardFrame, DashboardNotice, DashboardPager } from "./DashboardFrame";

export const metadata: Metadata = { title: "Teacher Dashboards | OutputTracer Admin" };

const path = "/admin/teacher-dashboards";

export default async function TeacherDashboardDirectory({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; field?: string; page?: string }>;
}) {
  const db = await requireTeacherDashboardAdmin(path);
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const field = params.field === "email" ? "email" : "display_name";
  const page = dashboardPageNumber(params.page);
  const start = (page - 1) * dashboardPageSize;
  const query = db?.from("teacher_profiles")
    .select("user_id, status, profile:profiles!teacher_profiles_user_id_fkey!inner(display_name, email)")
    .order("user_id")
    .range(start, start + dashboardPageSize);

  if (search) query?.ilike(`profile.${field}`, `%${search}%`);
  const response = query ? await query : null;
  const teachers = response?.data ?? [];
  const unavailable = !response || !!response.error;

  function pageUrl(target: number) {
    const query = new URLSearchParams({ page: String(target), field });
    if (search) query.set("q", search);
    return `${path}?${query}`;
  }

  return (
    <DashboardFrame
      back="/admin"
      backLabel="Administrator Control Center"
      title="Teacher dashboards"
      description="Open a teacher’s classroom dashboard and manage their classes under your administrator account."
    >
      <form action={path} className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-neutral-200 bg-white p-4">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm font-medium">
          Find a teacher
          <input name="q" defaultValue={search} maxLength={100} className="rounded border border-neutral-300 bg-white px-3 py-2 text-black" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Search by
          <select name="field" defaultValue={field} className="rounded border border-neutral-300 bg-white px-3 py-2 text-black">
            <option value="display_name">Display name</option>
            <option value="email">Email</option>
          </select>
        </label>
        <button type="submit" className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">Search</button>
      </form>

      {unavailable ? (
        <DashboardNotice error>Teacher dashboards could not be loaded. Try again in a moment.</DashboardNotice>
      ) : teachers.length === 0 ? (
        <DashboardNotice>{search ? "No teachers match this search." : "No teacher profiles were found on this page."}</DashboardNotice>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
          {teachers.slice(0, dashboardPageSize).map((teacher) => {
            const profile = Array.isArray(teacher.profile) ? teacher.profile[0] : teacher.profile;
            const name = profile?.display_name?.trim() || profile?.email || "Teacher";
            return (
              <li key={teacher.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{name}</p>
                  <p className="break-words text-sm text-neutral-700">
                    {profile?.email && profile.email !== name ? `${profile.email} · ` : ""}
                    <span className="capitalize">{teacher.status.replaceAll("_", " ")}</span>
                  </p>
                </div>
                <Link href={`${path}/${teacher.user_id}`} prefetch={false} className="inline-flex items-center gap-1.5 rounded border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100">
                  Open teacher dashboard <ArrowRight size={14} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {!unavailable && (
        <DashboardPager page={page} previous={page > 1 ? pageUrl(page - 1) : undefined} next={teachers.length > dashboardPageSize ? pageUrl(page + 1) : undefined} />
      )}
    </DashboardFrame>
  );
}
