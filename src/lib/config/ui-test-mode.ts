// Internal UI tests opt in explicitly. Ordinary builds compile this flag to false.
// It is deliberately absent from .env.example and must never be set on a deployment.
export function isUiTestMode() {
  return process.env.NEXT_PUBLIC_AUTMAIL_UI_TEST_MODE === "true"
    && !process.env.NEXT_PUBLIC_SUPABASE_URL
    && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
