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