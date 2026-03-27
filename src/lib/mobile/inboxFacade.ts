export interface MobileInboxItem {
  id: string;
  kind: "server" | "forum";
  title: string;
  body: string;
  destination: string | null;
  read: boolean;
  createdAt: string;
}

export function mergeInboxItems(
  serverItems: MobileInboxItem[],
  forumItems: MobileInboxItem[],
): MobileInboxItem[] {
  return [...serverItems, ...forumItems].sort((lhs, rhs) => rhs.createdAt.localeCompare(lhs.createdAt));
}
