import { expect, test } from '@playwright/test';

test('legal document keeps authenticated cabinet navigation after refresh', async ({ page }) => {
  const user = {
    id: 420,
    public_id: 420,
    email: 'qa@example.com',
    name: 'QA',
    avatar: null,
    providers: [],
    role: 'user',
    plan_code: 'start',
    email_verified: true,
    pending_email: null,
    phone: null,
    phone_verified: false,
    date_of_birth: '1990-01-01',
  };
  const respond = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  await page.route('**/me', route => route.fulfill(respond(user)));
  await page.route('**/me/settings', route =>
    route.fulfill(
      respond({
        profile: { two_factor_enabled: false },
        interface: { theme: 'system', density: 'comfortable', font_size: 'medium' },
        agent: {
          enabled: false,
          mode: 'advisor',
          data_policy: 'minimal',
          allow_send_text_to_ai: false,
        },
      })
    )
  );
  await page.route('**/api/user/security/sessions', route => route.fulfill(respond([])));
  await page.route('**/privacy/deletion-request', route =>
    route.fulfill(respond({ status: 'none' }))
  );
  await page.route('**/privacy/optional-consents', route =>
    route.fulfill(respond({ advertising_consent: false }))
  );
  await page.route('**/legal/account', route =>
    route.fulfill(
      respond({
        current_documents: [
          {
            id: 1,
            doc_type: 'public_offer',
            slug: 'public-offer',
            version: '1.0',
            status: 'published',
            title: 'Публичная оферта',
            content_sha256: '',
            published_at: '2026-10-10T00:00:00Z',
            archived_at: null,
          },
        ],
        archived_documents: [],
        accepted: [],
        purchase_snapshots: [],
        consent_history: [
          {
            doc_type: 'public_offer',
            doc_version: '1.0',
            accepted_at: '2026-10-10T00:00:00Z',
            revision_id: 1,
            confirmation_result: 'accepted',
          },
        ],
      })
    )
  );
  await page.route('**/legal/documents/public-offer', route =>
    route.fulfill(
      respond({
        id: 1,
        doc_type: 'public_offer',
        slug: 'public-offer',
        version: '1.0',
        status: 'published',
        title: 'Публичная оферта',
        body_markdown: '# Текст оферты',
        content_sha256: '',
        published_at: '2026-10-10T00:00:00Z',
        archived_at: null,
      })
    )
  );
  await page.addInitScript(() => localStorage.setItem('auth_token', 'qa-session-token'));

  await page.goto('/dashboard/settings');
  await page.getByRole('button', { name: 'Конфиденциальность' }).click();
  await page.getByRole('link', { name: 'Открыть действующие условия и историю согласий' }).click();
  await expect(page.getByTestId('account-legal-consent-history')).toContainText('Принято');
  await page.getByTestId('account-legal-read-public-offer').click();
  await expect(page.getByRole('heading', { name: 'Публичная оферта' })).toBeVisible();
  await expect(page.getByTestId('dashboard-sidebar')).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/account\/legal\/public-offer$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Публичная оферта' })).toBeVisible();
  await expect(page.getByTestId('dashboard-sidebar')).toBeVisible();
  await page.getByRole('link', { name: 'Юридические документы' }).last().click();
  await expect(page.getByTestId('account-legal-consent-history')).toBeVisible();
  await page.getByTestId('dashboard-sidebar').getByRole('link', { name: 'Настройки' }).click();
  await expect(page.getByRole('button', { name: 'Конфиденциальность' })).toBeVisible();
  await page
    .getByTestId('site-header-nav-desktop')
    .getByRole('link', { name: 'Личный кабинет' })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('site-header-nav-desktop')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('direct public legal page restores valid account through /me on cabinet click', async ({
  page,
}) => {
  let meCalls = 0;
  await page.route('**/me', route => {
    meCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 421,
        email: 'qa@example.com',
        name: 'QA',
        avatar: null,
        providers: [],
        role: 'user',
        plan_code: 'start',
      }),
    });
  });
  await page.route('**/legal/documents/public-offer', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        doc_type: 'public_offer',
        slug: 'public-offer',
        version: '1.0',
        status: 'published',
        title: 'Публичная оферта',
        body_markdown: '# Текст оферты',
        content_sha256: '',
        published_at: '2026-10-10T00:00:00Z',
        archived_at: null,
      }),
    })
  );
  await page.addInitScript(() => localStorage.setItem('auth_token', 'qa-session-token'));
  await page.goto('/legal/public-offer');
  await expect(page.getByRole('heading', { name: 'Публичная оферта' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Публичная оферта' })).toBeVisible();
  await page
    .getByTestId('site-header-nav-desktop')
    .getByRole('link', { name: 'Личный кабинет' })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(meCalls).toBeGreaterThan(0);
});

test('public document remains readable with expired token but cabinet still requires login', async ({
  page,
}) => {
  await page.route('**/me', route =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Invalid token' }),
    })
  );
  await page.route('**/legal/documents/public-offer', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        doc_type: 'public_offer',
        slug: 'public-offer',
        version: '1.0',
        status: 'published',
        title: 'Публичная оферта',
        body_markdown: '# Текст оферты',
        content_sha256: '',
        published_at: '2026-10-10T00:00:00Z',
        archived_at: null,
      }),
    })
  );
  await page.addInitScript(() => localStorage.setItem('auth_token', 'expired-qa-token'));
  await page.goto('/legal/public-offer');
  await expect(page.getByRole('heading', { name: 'Публичная оферта' })).toBeVisible();
  await page
    .getByTestId('site-header-nav-desktop')
    .getByRole('link', { name: 'Личный кабинет' })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('dashboard-sidebar')).toHaveCount(0);
});
