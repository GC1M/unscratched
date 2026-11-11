export const shortDate = (at: number, locale?: string) => new Date(at).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
