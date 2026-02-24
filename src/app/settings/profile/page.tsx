"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
 * 用户资料编辑页。
 * 支持修改昵称、简介和头像。
 */
export default function ProfileSettingsPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const { toast } = useToast();

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
            toast.error(extractApiError(payload) ?? "资料加载失败");
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
          toast.error("网络异常，资料加载失败");
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
  }, [status, toast]);

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    if (name.trim().length < 2 || name.trim().length > 20) {
      toast.error("昵称长度需在 2-20 个字符之间");
      return;
    }

    if (bio.trim().length > 200) {
      toast.error("简介最多 200 字");
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
        toast.error(extractApiError(payload) ?? "保存失败，请稍后重试");
        return;
      }

      setName(payload.data.name ?? "");
      setBio(payload.data.bio ?? "");
      setSavedImageUrl(payload.data.image);
      setAvatarFile(null);
      setAvatarUploadResetKey((prev) => prev + 1);
      toast.success("资料已更新");

      await update({
        name: payload.data.name ?? null,
        image: payload.data.image ?? null,
      });
      router.refresh();
    } catch {
      toast.error("网络异常，保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  if (status === "loading" || isLoading) {
    return <PageLoading text="资料加载中..." />;
  }

  if (status === "unauthenticated") {
    return <div className="py-12 text-center text-sm text-slate-500">正在跳转到登录页...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4">
      <div className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-slate-900">个人资料设置</h1>
        <p className="mt-2 text-sm text-slate-600">设置头像、昵称和一句话简介。</p>

        <form className="mt-6 space-y-5" onSubmit={handleSaveProfile} noValidate>
          <fieldset disabled={isSaving} className="space-y-5 disabled:opacity-90">
            <div>
              <p className="text-sm text-slate-700">头像</p>
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
                      fallbackClassName="bg-teal-600 text-white"
                    />
                  }
                />
              </div>
            </div>

            <label className="block text-sm text-slate-700">
              昵称
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="m3-input mt-2 w-full"
                placeholder="输入昵称（2-20 字）"
                maxLength={20}
              />
            </label>

            <label className="block text-sm text-slate-700">
              邮箱（不可修改）
              <input
                type="text"
                value={email}
                readOnly
                className="m3-input mt-2 w-full cursor-not-allowed bg-slate-100 text-slate-500"
              />
            </label>

            <label className="block text-sm text-slate-700">
              个人简介
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={200}
                rows={4}
                className="m3-input mt-2 min-h-[120px] w-full"
                placeholder="一句话介绍自己..."
              />
              <p className="mt-1 text-right text-xs text-slate-500">{bio.length}/200</p>
            </label>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "保存中..." : "保存修改"}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
