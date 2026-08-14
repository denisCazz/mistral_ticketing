import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { normalizeLoginIdentifier } from "@/lib/dipendente-user";
import { checkRateLimit, recordFailure, resetFailures } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
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
        token.id = user.id ?? token.sub;
        token.role = (user as { role?: string }).role;
        token.mustChangePassword = Boolean(
          (user as { mustChangePassword?: boolean }).mustChangePassword
        );
        token.refreshedAt = Date.now();
      } else if (!token.id && token.sub) {
        token.id = token.sub;
      }

      // Aggiorna ruolo dal DB al massimo ogni 60s: evita query
      // concorrenti su ogni richiesta (proxy + API + session).
      if (token.id) {
        const now = Date.now();
        const lastRefresh = (token.refreshedAt as number | undefined) ?? 0;
        if (now - lastRefresh > 60_000 || user) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, active: true, mustChangePassword: true },
          });
          if (!dbUser?.active) return null;
          token.role = dbUser.role;
          token.mustChangePassword = dbUser.mustChangePassword;
          token.refreshedAt = now;
        }
      }

      return token;
    },
    async session({ session, token }) {
      const id = (token?.id ?? token?.sub) as string | undefined;
      if (!id) return session;
      session.user = {
        ...(session.user ?? { name: null, email: null, image: null }),
        id,
        role: token.role as string | undefined,
        mustChangePassword: Boolean(token.mustChangePassword),
      };
      return session;
    },
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        try {
          const parsed = loginSchema.safeParse(credentials);
          if (!parsed.success) return null;

          const { email: rawEmail, password } = parsed.data;
          const email = normalizeLoginIdentifier(rawEmail);

          if (!checkRateLimit(email)) {
            return null;
          }

          const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              name: true,
              email: true,
              passwordHash: true,
              role: true,
              active: true,
              mustChangePassword: true,
            },
          });

          if (!user || !user.active) {
            recordFailure(email);
            return null;
          }

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) {
            recordFailure(email);
            return null;
          }

          resetFailures(email);

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            mustChangePassword: user.mustChangePassword,
          };
        } catch (error) {
          console.error("[auth] authorize failed:", error);
          return null;
        }
      },
    }),
  ],
});
