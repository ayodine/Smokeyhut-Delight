/**
 * Email validation and typo detection helper.
 * Provides client-side RFC syntax checks and domain typo corrections.
 */

const COMMON_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'live.com',
  'aol.com',
  'ymail.com',
  'mail.com',
];

// Mapping of known frequent typos to correct domains
const DOMAIN_TYPOS = {
  // Gmail typos
  'gmil.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmali.com': 'gmail.com',
  'gmaik.com': 'gmail.com',
  'gmaill.con': 'gmail.com',
  'gmeil.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmai.con': 'gmail.com',
  'gmaul.com': 'gmail.com',
  'gmaill.co': 'gmail.com',

  // Yahoo typos
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yaho.co.uk': 'yahoo.co.uk',
  'yahoo.con': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yaho.com.ng': 'yahoo.com',
  'yahoo.com.ng': 'yahoo.com',
  'yaho.con': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',
  'yaboo.com': 'yahoo.com',

  // Hotmail typos
  'hotmial.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotmali.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmaik.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',

  // Outlook typos
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'ootlook.com': 'outlook.com',
  'outllok.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outloook.com': 'outlook.com',

  // iCloud typos
  'iclud.com': 'icloud.com',
  'icould.com': 'icloud.com',
  'icoud.com': 'icloud.com',
  'icloud.con': 'icloud.com',
  'icloud.co': 'icloud.com',
};

// Levenshtein distance for fuzzy domain matching
function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => []);
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

/**
 * Validates email format and looks for domain typos.
 * @param {string} email
 * @returns {{ isValid: boolean, error?: string, suggestion?: string }}
 */
export function validateEmail(email) {
  const trimmed = (email || '').trim().toLowerCase();
  if (!trimmed) {
    return { isValid: false, error: 'Email address is required' };
  }

  // Standard RFC-compatible regex check
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) {
    return { isValid: false, error: 'Please enter a valid email address (e.g. name@domain.com)' };
  }

  // Check parts
  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }

  const [user, domain] = parts;
  if (!user || !domain) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }

  // Top level domain check (must have at least 2 chars after the dot)
  const domainParts = domain.split('.');
  const tld = domainParts[domainParts.length - 1];
  if (!tld || tld.length < 2) {
    return { isValid: false, error: 'Please enter a valid email domain (e.g. .com)' };
  }

  // Check known typos
  let suggestedDomain = DOMAIN_TYPOS[domain] || null;

  // If not found in explicit dictionary, check distance to common domains
  if (!suggestedDomain && !COMMON_DOMAINS.includes(domain)) {
    for (const target of COMMON_DOMAINS) {
      const dist = levenshtein(domain, target);
      // If 1 character off or transposed on similar length
      if (dist === 1 && Math.abs(domain.length - target.length) <= 1) {
        suggestedDomain = target;
        break;
      }
    }
  }

  const suggestion = suggestedDomain ? `${user}@${suggestedDomain}` : null;

  return {
    isValid: true,
    suggestion,
  };
}

/**
 * Replaces current email domain with suggested domain.
 */
export function applyEmailSuggestion(currentEmail, suggestedFullEmail) {
  return suggestedFullEmail || currentEmail;
}
