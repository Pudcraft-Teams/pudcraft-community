/**
 * Maps a server's mode tag (Chinese) to its corresponding cover gradient class
 * defined in src/styles/globals.css. Shared across server-card surfaces and the
 * marketing-hero featured-server preview so a tagged server picks a consistent
 * mode color regardless of where it appears.
 */
export const TAG_TO_COVER: Record<string, string> = {
  生存: "cover-survival",
  创造: "cover-creative",
  RPG: "cover-rpg",
  PVP: "cover-pvp",
  科技: "cover-tech",
  模组: "cover-mod",
  空岛: "cover-sky",
  原版: "cover-vanilla",
  小游戏: "cover-mini",
};

export const TAG_TO_SWATCH: Record<string, string> = {
  生存: "var(--mode-survival)",
  创造: "var(--mode-creative)",
  RPG: "var(--mode-rpg)",
  PVP: "var(--mode-pvp)",
  科技: "var(--mode-tech)",
  模组: "var(--mode-mod)",
  空岛: "var(--mode-sky)",
  原版: "var(--mode-vanilla)",
  小游戏: "var(--mode-mini)",
};

export function pickCoverClass(tags: string[]): string {
  for (const tag of tags) {
    const cls = TAG_TO_COVER[tag];
    if (cls) return cls;
  }
  return "cover-vanilla";
}
