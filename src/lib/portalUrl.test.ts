import { validatePortalUrl } from './portalUrl';

test.each(['https://tenant.appfolio.com/connect', 'http://example.com', ' HTTPS://Portal.Example.com:8443/a?b=1#c ', 'https://localhost'])(
  'accepts %p',
  (url) => {
    expect(validatePortalUrl(url)).toBe(url.trim());
  },
);

test.each(['', 'example.com', 'javascript:alert(1)', 'ftp://example.com', 'tel:5551234', 'https://', 'https:///path', 'https://a b.com', 'https://user@evil.com', 'https://.com', 'appfolio://x'])(
  'rejects %p',
  (url) => {
    expect(validatePortalUrl(url)).toBeNull();
  },
);
