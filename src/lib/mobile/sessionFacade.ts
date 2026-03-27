export interface MobileSessionUser {
  id: string;
  uid: number;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
}

export function toMobileSessionUser(user: MobileSessionUser): MobileSessionUser {
  return user;
}
