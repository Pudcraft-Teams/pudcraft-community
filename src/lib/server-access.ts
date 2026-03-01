interface ServerAccessOptions {
  status: string;
  ownerId: string | null;
  currentUserId?: string | null;
  currentUserRole?: string | null;
}

export function isApprovedServer(status: string): boolean {
  return status === "approved";
}

export function isServerOwner(ownerId: string | null, currentUserId?: string | null): boolean {
  return !!ownerId && !!currentUserId && ownerId === currentUserId;
}

export function canAccessServer(options: ServerAccessOptions): boolean {
  if (isApprovedServer(options.status)) {
    return true;
  }

  if (options.currentUserRole === "admin") {
    return true;
  }

  return isServerOwner(options.ownerId, options.currentUserId);
}
