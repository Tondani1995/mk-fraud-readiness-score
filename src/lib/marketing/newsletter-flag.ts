/**
 * Build-time switch for every visible newsletter surface (footer form, publication page,
 * confirmation page). Off unless NEXT_PUBLIC_MK_NEWSLETTER_ENABLED is exactly "true", so merging
 * this code changes nothing on the live site until the owner enables it. The server routes have
 * their own, independent switch (MK_MARKETING_MODE).
 */
export const NEWSLETTER_ENABLED = process.env.NEXT_PUBLIC_MK_NEWSLETTER_ENABLED === 'true';
