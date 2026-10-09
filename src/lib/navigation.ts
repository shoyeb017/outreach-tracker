export function safeNextPath(value: string | null | undefined, fallback = "/dashboard") {
  return value && value.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u0020]/.test(value) ? value : fallback;
}
