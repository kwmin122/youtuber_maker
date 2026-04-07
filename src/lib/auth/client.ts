import { createAuthClient } from "better-auth/react";
import { nextCookies } from "better-auth/next-js";

export const { signIn, signUp, signOut, useSession, getSession } =
  createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "",
    plugins: [nextCookies()],
  });
