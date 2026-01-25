import NextAuth, { type DefaultSession } from "next-auth";

type RoundtableProvider = "google" | "linkedin" | "microsoft";

type ProviderIdentity = {
  email?: string | null;
  accountId?: string | null;
};

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
      provider?: RoundtableProvider;
      token?: string;
      connections?: RoundtableProvider[];
      identities?: Partial<Record<RoundtableProvider, ProviderIdentity>>;
      professionalProfileVerified?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    provider?: RoundtableProvider;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    provider?: RoundtableProvider;
    professionalProfileVerified?: boolean;
    connections?: RoundtableProvider[];
    identities?: Partial<Record<RoundtableProvider, ProviderIdentity>>;
    identitiesCachedAt?: number;
  }
}
