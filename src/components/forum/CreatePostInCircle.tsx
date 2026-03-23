"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { CreatePostForm } from "@/components/forum/CreatePostForm";
import { PageLoading } from "@/components/PageLoading";

import type { CircleDetail, SectionItem } from "@/lib/types";

interface CreatePostInCircleProps {
  slug: string;
}

/**
 * Wrapper that fetches circle detail + sections,
 * then renders CreatePostForm pre-configured for that circle.
 */
export function CreatePostInCircle({ slug }: CreatePostInCircleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status: sessionStatus } = useSession();

  const [circle, setCircle] = useState<CircleDetail | null>(null);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.replace(
        `/login?callbackUrl=${encodeURIComponent(pathname ?? `/c/${slug}/new`)}`,
      );
    }
  }, [sessionStatus, router, pathname, slug]);

  // Fetch circle + sections
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const circleRes = await fetch(`/api/circles/${slug}`);
      if (!circleRes.ok) {
        if (circleRes.status === 404) {
          setError("圈子不存在");
        } else {
          setError("加载圈子失败");
        }
        return;
      }

      const circleJson = (await circleRes.json()) as { data: CircleDetail };
      const circleData = circleJson.data;
      setCircle(circleData);

      // Check membership
      if (!circleData.isMember) {
        setError("你还不是该圈子的成员，请先加入圈子后再发帖");
        return;
      }

      // Fetch sections
      try {
        const sectionsRes = await fetch(
          `/api/circles/${circleData.id}/sections`,
        );
        if (sectionsRes.ok) {
          const sectionsJson = (await sectionsRes.json()) as {
            sections: SectionItem[];
          };
          setSections(sectionsJson.sections);
        }
      } catch {
        // Sections are optional, continue without them
      }
    } catch {
      setError("网络异常，加载失败");
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    void fetchData();
  }, [fetchData, sessionStatus]);

  // ── Loading state ──
  if (sessionStatus === "loading" || isLoading) {
    return <PageLoading />;
  }

  if (sessionStatus === "unauthenticated") {
    return (
      <div className="py-12 text-center text-sm text-warm-400">
        正在跳转到登录页...
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="m3-alert-error text-center">{error}</div>
        <div className="mt-4 text-center">
          <Link href={`/c/${slug}`} className="m3-link text-sm">
            &larr; 返回圈子
          </Link>
        </div>
      </div>
    );
  }

  if (!circle) {
    return <PageLoading />;
  }

  return (
    <div className="mx-auto max-w-2xl py-4">
      <nav className="mb-4 flex items-center gap-2 text-sm text-warm-400">
        <Link href={`/c/${slug}`} className="m3-link">
          &larr; {circle.name}
        </Link>
      </nav>

      <CreatePostForm
        circleId={circle.id}
        circleName={circle.name}
        circleSlug={slug}
        sections={sections}
      />
    </div>
  );
}
