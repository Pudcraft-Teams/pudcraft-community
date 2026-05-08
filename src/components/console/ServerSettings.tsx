"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  OwnerFormConfig,
  ServerJoinMode,
  ServerVisibility,
} from "@/lib/types";

const VISIBILITY_OPTION_KEYS: ServerVisibility[] = ["public", "private", "unlisted"];
const JOIN_MODE_OPTION_KEYS: ServerJoinMode[] = ["open", "apply", "invite", "apply_and_invite"];

interface ServerSettingsProps {
  serverId: string;
  initialVisibility: string;
  initialDiscoverable: boolean;
  initialJoinMode: string;
  /**
   * Read-only here. The application form is edited on the dedicated /console/{id}/form
   * page; this panel only reports the current field count so the owner can see at a glance
   * whether the form needs configuring.
   */
  initialApplicationForm: OwnerFormConfig | null;
  onSaved?: () => void;
}

function isValidVisibility(value: string): value is ServerVisibility {
  return value === "public" || value === "private" || value === "unlisted";
}

function isValidJoinMode(value: string): value is ServerJoinMode {
  return (
    value === "open" ||
    value === "apply" ||
    value === "invite" ||
    value === "apply_and_invite"
  );
}

function joinModeIncludesApply(joinMode: ServerJoinMode): boolean {
  return joinMode === "apply" || joinMode === "apply_and_invite";
}

function resolveVisibilityCopy(
  value: ServerVisibility,
  t: ReturnType<typeof useTranslations>,
): { label: string; description: string } {
  if (value === "public") {
    return { label: t("visibilityPublicLabel"), description: t("visibilityPublicDescription") };
  }
  if (value === "private") {
    return { label: t("visibilityPrivateLabel"), description: t("visibilityPrivateDescription") };
  }
  return { label: t("visibilityUnlistedLabel"), description: t("visibilityUnlistedDescription") };
}

function resolveJoinModeCopy(
  value: ServerJoinMode,
  t: ReturnType<typeof useTranslations>,
): { label: string; description: string } {
  if (value === "open") {
    return { label: t("joinModeOpenLabel"), description: t("joinModeOpenDescription") };
  }
  if (value === "apply") {
    return { label: t("joinModeApplyLabel"), description: t("joinModeApplyDescription") };
  }
  if (value === "invite") {
    return { label: t("joinModeInviteLabel"), description: t("joinModeInviteDescription") };
  }
  return {
    label: t("joinModeApplyInviteLabel"),
    description: t("joinModeApplyInviteDescription"),
  };
}

/**
 * Privacy and join-flow settings panel. Application-form field editing lives on
 * its own dedicated page (`/console/{serverId}/form`) — this panel only configures
 * visibility / discoverable / joinMode and links to the form editor when relevant.
 */
export function ServerSettings({
  serverId,
  initialVisibility,
  initialDiscoverable,
  initialJoinMode,
  initialApplicationForm,
  onSaved,
}: ServerSettingsProps) {
  const t = useTranslations("console.settings");
  const [visibility, setVisibility] = useState<ServerVisibility>(
    isValidVisibility(initialVisibility) ? initialVisibility : "public",
  );
  const [discoverable, setDiscoverable] = useState(initialDiscoverable);
  const [joinMode, setJoinMode] = useState<ServerJoinMode>(
    isValidJoinMode(initialJoinMode) ? initialJoinMode : "open",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (visibility === "public") {
      setJoinMode("open");
      setDiscoverable(false);
    }
  }, [visibility]);

  useEffect(() => {
    if (!saveSuccess) return;
    const id = setTimeout(() => setSaveSuccess(false), 2000);
    return () => clearTimeout(id);
  }, [saveSuccess]);

  const showJoinModeSelector = visibility !== "public";
  const showApplicationFormCard = joinModeIncludesApply(joinMode) && showJoinModeSelector;
  const formFieldCount = initialApplicationForm?.fields.length ?? 0;

  const hasChanges = useMemo(() => {
    const visChanged = visibility !== (isValidVisibility(initialVisibility) ? initialVisibility : "public");
    const discChanged = discoverable !== initialDiscoverable;
    const joinChanged = joinMode !== (isValidJoinMode(initialJoinMode) ? initialJoinMode : "open");
    return visChanged || discChanged || joinChanged;
  }, [visibility, discoverable, joinMode, initialVisibility, initialDiscoverable, initialJoinMode]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const body: Record<string, unknown> = {
        visibility,
        discoverable: showJoinModeSelector ? discoverable : false,
        joinMode: showJoinModeSelector ? joinMode : "open",
      };

      const response = await fetch(`/api/servers/${serverId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result: unknown = await response.json().catch(() => ({}));
      const payload = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};

      if (!response.ok) {
        const errorMessage = typeof payload.error === "string" ? payload.error : t("saveFailed");
        throw new Error(errorMessage);
      }

      setSaveSuccess(true);
      onSaved?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }, [visibility, discoverable, joinMode, serverId, showJoinModeSelector, onSaved, t]);

  return (
    <section className="m3-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-warm-800">{t("title")}</h2>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-warm-800">{t("visibilityHeading")}</h3>
        <div className="mt-3 space-y-2">
          {VISIBILITY_OPTION_KEYS.map((optionKey) => {
            const copy = resolveVisibilityCopy(optionKey, t);
            return (
              <label
                key={optionKey}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  visibility === optionKey
                    ? "border-accent/30 bg-accent-muted/50"
                    : "border-warm-200 bg-surface hover:border-warm-300"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={optionKey}
                  checked={visibility === optionKey}
                  onChange={() => {
                    setVisibility(optionKey);
                  }}
                  className="mt-0.5 h-4 w-4 border-warm-300 text-accent focus:ring-accent-hover"
                />
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      visibility === optionKey ? "text-accent" : "text-warm-800"
                    }`}
                  >
                    {copy.label}
                  </p>
                  <p className="mt-0.5 text-xs text-warm-500">{copy.description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {showJoinModeSelector && (
        <div className="mt-6">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-warm-200 bg-surface p-3 transition-colors hover:border-warm-300">
            <input
              type="checkbox"
              checked={discoverable}
              onChange={(e) => {
                setDiscoverable(e.target.checked);
              }}
              className="mt-0.5 h-4 w-4 rounded border-warm-300 text-accent focus:ring-accent-hover"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-warm-800">{t("discoverableTitle")}</p>
              <p className="mt-0.5 text-xs text-warm-500">{t("discoverableDescription")}</p>
            </div>
          </label>
        </div>
      )}

      {showJoinModeSelector && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-warm-800">{t("joinModeHeading")}</h3>
          <div className="mt-3 space-y-2">
            {JOIN_MODE_OPTION_KEYS.map((optionKey) => {
              const copy = resolveJoinModeCopy(optionKey, t);
              return (
                <label
                  key={optionKey}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    joinMode === optionKey
                      ? "border-accent/30 bg-accent-muted/50"
                      : "border-warm-200 bg-surface hover:border-warm-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="joinMode"
                    value={optionKey}
                    checked={joinMode === optionKey}
                    onChange={() => {
                      setJoinMode(optionKey);
                    }}
                    className="mt-0.5 h-4 w-4 border-warm-300 text-accent focus:ring-accent-hover"
                  />
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        joinMode === optionKey ? "text-accent" : "text-warm-800"
                      }`}
                    >
                      {copy.label}
                    </p>
                    <p className="mt-0.5 text-xs text-warm-500">{copy.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {showApplicationFormCard && (
        <div className="mt-6">
          <Link
            href={`/console/${serverId}/form`}
            className="flex items-center justify-between gap-3 rounded-xl border border-warm-200 bg-warm-50/40 p-4 transition-colors hover:border-accent/40 hover:bg-accent-muted/20"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-warm-800">{t("formCardTitle")}</p>
              <p className="mt-1 text-xs text-warm-500">
                {formFieldCount === 0
                  ? t("formCardEmpty")
                  : t("formCardCount", { count: formFieldCount })}
              </p>
            </div>
            <span className="text-sm text-accent">{t("formCardCta")} →</span>
          </Link>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={isSaving || !hasChanges}
          className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? t("saving") : t("save")}
        </button>

        {saveSuccess && <span className="text-sm text-forest">{t("saved")}</span>}
        {saveError && <span className="text-sm text-accent-hover">{saveError}</span>}
      </div>
    </section>
  );
}
