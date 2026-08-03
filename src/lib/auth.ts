import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 ore
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.catId = (user as { catId?: string | null }).catId ?? null;
        token.refreshedAt = Date.now();
      }

      // Aggiorna ruolo e CAT dal DB al massimo ogni 60s: evita query
      // concorrenti su ogni richiesta (proxy + API + session) che causavano
      // sessioni intermittenti e 403 sul cambio stato.
      if (token.id) {
        const now = Date.now();
        const lastRefresh = (token.refreshedAt as number | undefined) ?? 0;
        if (now - lastRefresh > 60_000) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, catId: true, active: true },
          });
          if (!dbUser?.active) return null;
          token.role = dbUser.role;
          token.catId = dbUser.catId ?? null;
          token.refreshedAt = now;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.catId = (token.catId as string | null) ?? null;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        try {
          const parsed = loginSchema.safeParse(credentials);
          if (!parsed.success) return null;

          const { email, password } = parsed.data;

          const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              name: true,
              email: true,
              passwordHash: true,
              role: true,
              active: true,
              catId: true,
            },
          });

          if (!user || !user.active) return null;

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) return null;

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            catId: user.catId,
          };
        } catch (error) {
          console.error("[auth] authorize failed:", error);
          return null;
        }
      },
    }),
  ],
});
