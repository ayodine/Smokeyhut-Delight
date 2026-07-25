// Map a Supabase auth user (Google identity) to checkout prefill fields.
export function profileToPrefill(user) {
  const m = user?.user_metadata || {};
  const email = m.email || user?.email || '';
  let firstName = m.given_name || '';
  let lastName = m.family_name || '';
  if (!firstName && !lastName && m.full_name) {
    const parts = String(m.full_name).trim().split(/\s+/);
    firstName = parts.shift() || '';
    lastName = parts.join(' ');
  }
  return { firstName, lastName, email };
}
