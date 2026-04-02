const REQUIRED_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function validateEnv(): { valid: boolean; missing: string[] } {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.warn(
      `[env] Missing required environment variables: ${missing.join(", ")}`,
    );
    console.warn("[env] Copy .env.example to .env.local and fill in the values");
  }

  return { valid: missing.length === 0, missing };
}

// Run validation on import (server-side only)
if (typeof window === "undefined") {
  validateEnv();
}
