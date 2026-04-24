"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ImageUpload } from "@/components/ImageUpload";
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
 * Profile editor page — edit display name, bio, and avatar.
 */
export default function ProfileSettingsPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const { toast } = useToast();
  const t = useTranslations("user.settings");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [savedImageUrl, setSavedImageUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploadResetKey, setAvatarUploadResetKey] = useState(0);

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
          setName(payload.data.name ?? "");
          setEmail(payload.data.email);
          setBio(payload.data.bio ?? "");
          setSavedImageUrl(payload.data.image);
          setAvatarUploadResetKey((prev) => prev + 1);
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

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    if (name.trim().length < 2 || name.trim().length > 20) {
      toast.error(t("nameRange"));
      return;
    }

    if (bio.trim().length > 200) {
      toast.error(t("bioMax"));
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("name", name.trim());
      formData.set("bio", bio.trim());
      if (avatarFile) {
        formData.set("avatar", avatarFile);
      }

      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as CurrentUserProfileResponse &
        ApiErrorPayload;

      if (!response.ok || !payload.data) {
        toast.error(extractApiError(payload) ?? t("saveFailed"));
        return;
      }

      setName(payload.data.name ?? "");
      setBio(payload.data.bio ?? "");
      setSavedImageUrl(payload.data.image);
      setAvatarFile(null);
      setAvatarUploadResetKey((prev) => prev + 1);
      toast.success(t("saveSuccess"));

      await update({
        name: payload.data.name ?? null,
        image: payload.data.image ?? null,
      });
      router.refresh();
    } catch {
      toast.error(t("networkSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

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
        <p className="mt-2 text-sm text-warm-600">{t("subtitle")}</p>

        <form className="mt-6 space-y-5" onSubmit={handleSaveProfile} noValidate>
          <fieldset disabled={isSaving} className="space-y-5 disabled:opacity-90">
            <div>
              <p className="text-sm text-warm-700">{t("avatarLabel")}</p>
              <div className="mt-2">
                <ImageUpload
                  key={`profile-avatar-upload-${avatarUploadResetKey}`}
                  value={savedImageUrl}
                  onChange={(file) => setAvatarFile(file)}
                  shape="circle"
                  size={96}
                  outputSize={256}
                  maxFileSize={10 * 1024 * 1024}
                  placeholder={
                    <UserAvatar
                      src={null}
                      name={name || session?.user?.name}
                      email={email || session?.user?.email}
                      className="h-24 w-24"
                      fallbackClassName="bg-gradient-to-br from-coral to-coral-amber text-white"
                    />
                  }
                />
              </div>
            </div>

            <label className="block text-sm text-warm-700">
              {t("nameLabel")}
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="m3-input mt-2 w-full"
                placeholder={t("namePlaceholder")}
                maxLength={20}
              />
            </label>

            <label className="block text-sm text-warm-700">
              {t("emailLabel")}
              <input
                type="text"
                value={email}
                readOnly
                className="m3-input mt-2 w-full cursor-not-allowed bg-warm-100 text-warm-500"
              />
            </label>

            <label className="block text-sm text-warm-700">
              {t("bioLabel")}
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={200}
                rows={4}
                className="m3-input mt-2 min-h-[120px] w-full"
                placeholder={t("bioPlaceholder")}
              />
              <p className="mt-1 text-right text-xs text-warm-500">{t("bioCounter", { count: bio.length })}</p>
            </label>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? t("saving") : t("save")}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
