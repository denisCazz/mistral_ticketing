export {};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
      mustChangePassword?: boolean;
    };
  }

  interface User {
    id?: string;
    role?: string;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    mustChangePassword?: boolean;
    refreshedAt?: number;
  }
}
