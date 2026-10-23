import {
  mailTemplate,
  renderBrandedEmailHtml,
  resolveGlobalBrandContext,
} from '../Utils.js';

const BRAND_ENV_KEYS = ['APP_NAME', 'APP_BRAND_KEY', 'APP_EMAIL_LOGO_URL', 'APP_EMAIL_ACCENT_COLOR'];

const storedBranding = values => ({ toJSON: () => values });

describe('global email branding', () => {
  let savedEnv;
  let firstSpy;

  beforeEach(() => {
    savedEnv = Object.fromEntries(BRAND_ENV_KEYS.map(key => [key, process.env[key]]));
    BRAND_ENV_KEYS.forEach(key => delete process.env[key]);
    firstSpy = spyOn(Parse.Query.prototype, 'first').and.resolveTo(undefined);
  });

  afterEach(() => {
    BRAND_ENV_KEYS.forEach(key => {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    });
  });

  describe('renderBrandedEmailHtml', () => {
    it('wraps the body in the default template when no branding is saved', async () => {
      const html = await renderBrandedEmailHtml({
        htmlBody: '<p>Body</p>',
        headerText: 'Digital Signature Request',
        footerText: '',
      });

      expect(html).toContain('<p>Body</p>');
      expect(html).toContain('Digital Signature Request');
      expect(html).toContain('https://qikinnovation.ams3.digitaloceanspaces.com/logo.png');
      expect(html).toContain('#47a3ad');
      expect(html).toContain('This is an automated email from OpenSign™.');
      expect(html).not.toMatch(/__[A-Z_]+__/);
      expect(html).not.toContain('complaints@opensignlabs.com');
    });

    it('applies logo, color, footer and wrapper saved in partners_GlobalSettings', async () => {
      firstSpy.and.resolveTo(
        storedBranding({
          logoUrl: 'https://cdn.example.com/logo.png',
          primaryColor: '#112233',
          footerText: 'Cargofort footer',
          wrapperHtml:
            '<div data-wrapper>__APP_NAME__|__LOGO_URL__|__PRIMARY_COLOR__|__HEADER_TEXT__|__FOOTER_TEXT__|__EMAIL_BODY__</div>',
        })
      );

      const html = await renderBrandedEmailHtml({
        htmlBody: '<html><body><p>Inner</p></body></html>',
        headerText: 'Document Copy',
        footerText: '',
      });

      expect(html).toBe(
        '<div data-wrapper>OpenSign™|https://cdn.example.com/logo.png|#112233|Document Copy|Cargofort footer|<p>Inner</p></div>'
      );
    });

    it('prefers the per-email footer and strips tags from header and footer', async () => {
      const html = await renderBrandedEmailHtml({
        htmlBody: '<p>Body</p>',
        headerText: '<b>Header</b>',
        footerText: '<i>Contact sender</i>',
      });

      expect(html).toContain('Header');
      expect(html).not.toContain('<b>Header</b>');
      expect(html).toContain('Contact sender');
      expect(html).not.toContain('<i>Contact sender</i>');
    });

    it('uses APP_NAME as the product name', async () => {
      process.env.APP_NAME = 'Cargofort Sign';

      const html = await renderBrandedEmailHtml({ htmlBody: '<p>Body</p>' });

      expect(html).toContain('This is an automated email from Cargofort Sign.');
    });
  });

  describe('resolveGlobalBrandContext', () => {
    it('keeps the upstream certificate branding when no branding is saved', async () => {
      const brand = await resolveGlobalBrandContext();

      expect(brand.assets.useBundledCertificateLogo).toBe(true);
      expect(brand.assets.certificateLogoUrl).toBe('');
      expect(brand.colors.certificatePrimary).toBe('#003366');
    });

    it('applies the saved logo and color to certificates', async () => {
      firstSpy.and.resolveTo(
        storedBranding({ logoUrl: 'https://cdn.example.com/logo.png', primaryColor: '#112233' })
      );

      const brand = await resolveGlobalBrandContext();

      expect(brand.assets.emailLogoUrl).toBe('https://cdn.example.com/logo.png');
      expect(brand.assets.certificateLogoUrl).toBe('https://cdn.example.com/logo.png');
      expect(brand.assets.useBundledCertificateLogo).toBe(false);
      expect(brand.colors.emailAccent).toBe('#112233');
      expect(brand.colors.certificatePrimary).toBe('#112233');
    });

    it('falls back to defaults when the settings lookup fails', async () => {
      firstSpy.and.rejectWith(new Error('db down'));

      const brand = await resolveGlobalBrandContext();

      expect(brand.assets.emailLogoUrl).toBe(
        'https://qikinnovation.ams3.digitaloceanspaces.com/logo.png'
      );
      expect(brand.colors.emailAccent).toBe('#47a3ad');
    });
  });

  describe('mailTemplate', () => {
    it('returns an unwrapped body with user values escaped', async () => {
      const { subject, body } = await mailTemplate({
        senderName: 'Jane <script>',
        senderMail: 'jane@example.com',
        title: 'Contract "A"',
        organization: 'Org',
        localExpireDate: 'May 1, 2027',
        note: '<img src=x>',
        signingUrl: 'https://app.example.com/login/abc',
      });

      expect(subject).toBe('Jane <script> has requested you to sign "Contract "A""');
      expect(body).not.toContain('<html>');
      expect(body).toContain('Jane &lt;script&gt;');
      expect(body).toContain('&lt;img src=x&gt;');
      expect(body).toContain('https://app.example.com/login/abc');
    });
  });
});
