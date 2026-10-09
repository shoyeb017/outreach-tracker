export function adminDate(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";
}
export function adminPageNumber(value: string | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(100000, Math.floor(number))) : 1;
}
export function adminAudience(value: string | null | undefined) {
  const labels: Record<string,string> = { AzureADMyOrg: "This organization only", AzureADMultipleOrgs: "Work or school accounts", AzureADandPersonalMicrosoftAccount: "Work, school, and personal accounts", PersonalMicrosoftAccount: "Personal Microsoft accounts" };
  return value && labels[value] ? labels[value] : "Not automatically verified";
}
export type AdminDirectoryUser = {
  id: string; email: string | null; full_name: string; created_at: string;
  last_sign_in_at: string | null; confirmed: boolean; connected_email: string | null;
  connection_status: string | null; deletion_status: string | null; administrator: boolean;
};
