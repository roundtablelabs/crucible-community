"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  
  useEffect(() => {
    // Check authentication before redirecting
    // Check if auth token exists
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (token) {
      // User is authenticated, redirect to app
      router.replace("/app");
    } else {
      // No token, redirect to login
      router.replace("/auth/login");
    }
  }, [router]);
  
  return (
    <div className="flex min-h-screen items-center justify-center bg-base-bg">
      <div className="text-center">
        <p className="text-base-text">Redirecting...</p>
      </div>
    </div>
  );
}
