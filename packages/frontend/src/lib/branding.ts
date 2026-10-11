/**
 * Branding SSOT. The product name and the pre-configuration organisation
 * fallback were previously spelled out in four places across three
 * components and the document metadata, and had drifted into two different
 * spellings. Import from here instead of re-declaring either string.
 */

/** Product name: document metadata and the signed-out login screen. */
export const PRODUCT_NAME = 'Cold Storage Management';

/**
 * Shown before an administrator has configured an organisation name. The
 * header and the sidebar both read this so they cannot disagree.
 */
export const ORG_NAME_FALLBACK = 'Cold Storage';

/**
 * Login page background image URL hosted securely on Cloudinary.
 * Can be overridden via NEXT_PUBLIC_LOGIN_BACKGROUND_URL if needed.
 */
export const LOGIN_BACKGROUND_IMAGE_URL =
  process.env.NEXT_PUBLIC_LOGIN_BACKGROUND_URL ||
  'https://res.cloudinary.com/x5lea85k/image/upload/v1791726394/cold_storage/branding/login_bg_3d.jpg';