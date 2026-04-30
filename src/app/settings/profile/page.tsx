"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { PageLoading } from "@/components/PageLoading";
import { UserAvatar } from "@/components/UserAvatar";
import { useToast } from "@/hooks/useToast";
import type { CurrentUserProfileResponse } from "@/lib/types";

interface ApiErrorPayload {
  error?: string;
}

function extractApiError(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const maybeError = (payload as ApiErrorPayload).error;
  return typeof maybeError === "string" ? maybeError : undefined;
}

/**
 * Profile page — read-only display of the synced Misskey profile. Local
 * profile fields (name / image / bio / handle) are overwritten on every
 * MiAuth login, so this page is purely informational.
 */
export default function ProfileSettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const t = useTranslations("user.settings");

  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState<string | null>(null);
  const [misskeyId, setMisskeyId] = useState<string>("");
  const [misskeyUsername, setMisskeyUsername] = useState<string>("");
  const [bio, setBio] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?callbackUrl=%2Fsettings%2Fprofile");
    }
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      if (status !== "loading") {
        setIsLoading(false);
      }
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    async function fetchProfile() {
      try {
        const response = await fetch("/api/user/profile");
        const payload = (await response.json().catch(() => ({}))) as CurrentUserProfileResponse &
          ApiErrorPayload;

        if (!response.ok || !payload.data) {
          if (!cancelled) {
            toast.error(extractApiError(payload) ?? t("loadFailed"));
          }
          return;
        }

        if (!cancelled) {
          setName(payload.data.name);
          setMisskeyId(payload.data.misskeyId);
          setMisskeyUsername(payload.data.misskeyUsername);
          setBio(payload.data.bio);
          setImageUrl(payload.data.image);
        }
      } catch {
        if (!cancelled) {
          toast.error(t("networkLoadFailed"));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [status, t, toast]);

  if (status === "loading" || isLoading) {
    return <PageLoading text={t("loadingText")} />;
  }

  if (status === "unauthenticated") {
    return <div className="py-12 text-center text-sm text-warm-500">{t("redirectingToLogin")}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4">
      <div className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-warm-800">{t("heading")}</h1>
        <p className="mt-2 text-sm text-warm-600">{t("misskeySyncNotice")}</p>

        <div className="mt-6 space-y-5">
          <div>
            <p className="text-sm text-warm-700">{t("avatarLabel")}</p>
            <div className="mt-2">
              <UserAvatar
                src={imageUrl}
                name={name || session?.user?.name}
                handle={misskeyUsername}
                className="h-24 w-24"
                fallbackClassName="bg-gradient-to-br from-coral to-coral-amber text-white"
              />
            </div>
          </div>

          <div className="block text-sm text-warm-700">
            {t("nameLabel")}
            <p className="m3-input mt-2 w-full cursor-not-allowed bg-warm-100 text-warm-700">
              {name || t("namePlaceholder")}
            </p>
          </div>

          <div className="block text-sm text-warm-700">
            {t("misskeyHandleLabel")}
            <p className="m3-input mt-2 w-full cursor-not-allowed bg-warm-100 text-warm-700">
              @{misskeyUsername}
            </p>
          </div>

          <div className="block text-sm text-warm-700">
            {t("misskeyIdLabel")}
            <p className="m3-input mt-2 w-full cursor-not-allowed break-all bg-warm-100 font-mono text-warm-500">
              {misskeyId}
            </p>
          </div>

          <div className="block text-sm text-warm-700">
            {t("bioLabel")}
            <p className="m3-input mt-2 min-h-[120px] w-full cursor-not-allowed whitespace-pre-wrap bg-warm-100 text-warm-700">
              {bio || t("bioPlaceholder")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
