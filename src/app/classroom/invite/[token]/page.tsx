"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  GraduationCap,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  LogIn,
} from "lucide-react";
import type { ClassroomInvitation } from "@/lib/classroom/communicationTypes";

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<ClassroomInvitation | null>(null);
  const [classroomName, setClassroomName] = useState<string>("");
  const [teacherName, setTeacherName] = useState<string>("");
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchInvitation() {
      try {
        const res = await fetch(`/api/classroom/invite/${token}`);
        const data = await res.json();
        if (active) {
          if (data.success) {
            setInvitation(data.invitation);
            setClassroomName(data.classroomName);
            setTeacherName(data.teacherName);
          } else {
            setError(data.error || "Invalid or expired invitation link.");
          }
        }
      } catch {
        if (active) setError("Failed to verify invitation link.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (token) {
      fetchInvitation();
    }

    return () => {
      active = false;
    };
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);

    try {
      const res = await fetch(`/api/classroom/invite/${token}`, {
        method: "POST",
      });

      const data = await res.json();
      if (res.status === 401) {
        setError("You must be logged in to accept this invitation.");
        return;
      }

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to join classroom.");
      } else {
        setSuccess(true);
        setTimeout(() => {
          router.push(`/classroom/${data.classroomId}`);
        }, 1500);
      }
    } catch {
      setError("Network error accepting invitation.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans">
      <Header />

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-5">
            <GraduationCap className="w-7 h-7" />
          </div>

          <h1 className="text-xl font-bold text-white tracking-tight">Classroom Invitation</h1>
          <p className="text-xs text-gray-400 mt-1">
            You have been invited to join an OutputTracer classroom.
          </p>

          {loading ? (
            <div className="py-12 text-sm text-gray-500">Checking invitation validity...</div>
          ) : error ? (
            <div className="my-6 p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-300 text-xs text-left flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="font-semibold text-red-200">Invitation Error</p>
                <p className="mt-0.5 leading-relaxed">{error}</p>
                {error.includes("logged in") && (
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-900 text-white font-medium"
                  >
                    <LogIn className="w-3.5 h-3.5" /> Log in to OutputTracer
                  </Link>
                )}
              </div>
            </div>
          ) : success ? (
            <div className="my-6 p-4 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
              <span>Invitation accepted! Redirecting to classroom...</span>
            </div>
          ) : (
            <div className="my-6 space-y-4 text-left">
              <div className="p-4 rounded-xl bg-gray-950 border border-gray-800 space-y-2">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-gray-500">Classroom</span>
                  <p className="text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
                    <BookOpen className="w-4 h-4 text-blue-400" /> {classroomName}
                  </p>
                </div>

                <div className="pt-2 border-t border-gray-900 flex justify-between items-center text-xs">
                  <span className="text-gray-400">Instructor:</span>
                  <span className="font-medium text-gray-200">{teacherName}</span>
                </div>

                {invitation && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400">Expires:</span>
                    <span className="font-medium text-gray-300 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-yellow-400" />
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={handleAccept}
                disabled={accepting || invitation?.status !== "pending"}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <span>{accepting ? "Joining Classroom..." : "Accept Invitation & Join Class"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="pt-4 border-t border-gray-800/80">
            <Link href="/classroom" className="text-xs text-gray-500 hover:text-gray-300 transition">
              Go to Classroom Hub
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
