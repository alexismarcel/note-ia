// Accounts given testing tools the product does not offer: generating a
// recording's sheet again, editing or pasting a transcript after a recording.
// Used to try prompts on real courses.
const TEST_ACCOUNT_EMAILS = ["alexismarcel89@gmail.com"];

// Case-insensitive, like has_unlimited_access(): the address typed at sign-up
// is not always the casing written here.
export function isTestAccount(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase();
  return !!normalized && TEST_ACCOUNT_EMAILS.includes(normalized);
}
