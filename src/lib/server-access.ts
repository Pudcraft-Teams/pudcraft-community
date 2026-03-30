interface ServerAccessOptions {
  status: string;
  ownerId: string | null;
  currentUserId?: string | null;
  currentUserRole?: string | null;
}

interface ServerVisibilityAccessOptions extends ServerAccessOptions {
  visibility: string;
  isMember?: boolean;
}

export function isApprovedServer(status: string): boolean {
  return status === "approved";
}

export function isServerOwner(ownerId: string | null, currentUserId?: string | null): boolean {
  return !!ownerId && !!currentUserId && ownerId === currentUserId;
}

export function isServerAdmin(currentUserRole?: string | null): boolean {
  return currentUserRole === "admin";
}

export function isPrivilegedServerViewer(options: ServerAccessOptions & { isMember?: boolean }): boolean {
  if (isServerAdmin(options.currentUserRole)) {
    return true;
  }

  if (isServerOwner(options.ownerId, options.currentUserId)) {
    return true;
  }

  return options.isMember === true;
}

export function canAccessServer(options: ServerAccessOptions): boolean {
  if (isApprovedServer(options.status)) {
    return true;
  }

  return isPrivilegedServerViewer(options);
}

export function canViewServerDetails(options: ServerVisibilityAccessOptions): boolean {
  if (!canAccessServer(options)) {
    return false;
  }

  if (options.visibility === "public") {
    return true;
  }

  return isPrivilegedServerViewer(options);
}

export function canListServerInPublicOwnerContext(options: ServerVisibilityAccessOptions): boolean {
  if (!canAccessServer(options)) {
    return false;
  }

  if (isPrivilegedServerViewer(options)) {
    return true;
  }

  return options.visibility === "public";
}

export function shouldExposeServerOwnerId(options: ServerVisibilityAccessOptions): boolean {
  return isPrivilegedServerViewer(options);
}

export function getInitialServerSubmissionState(): {
  status: "pending";
  reviewStatus: "unreviewed";
} {
  return {
    status: "pending",
    reviewStatus: "unreviewed",
  };
}

export function toPublicUserLookupId(uid: number): string {
  return String(uid);
}
