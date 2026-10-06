import { expect, type Page, test } from '@playwright/test';
import { ADMIN_TOKEN } from '../playwright.config';

async function tick(page: Page, times: number) {
  for (let i = 0; i < times; i++) {
    const response = await page.request.post('/admin/tick', {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(response.ok()).toBe(true);
  }
}

function uniqueName(prefix: string) {
  return `${prefix}${String(Date.now()).slice(-7)}`;
}

async function register(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: /Non hai un account|No account yet/ }).click();
  await page.getByLabel(/Nome giocatore|Player name/).fill(name);
  await page.getByLabel('Password').fill('password-di-prova-lunga');
  await page.getByRole('button', { name: /Crea account|Create account/ }).click();
}

test.beforeEach(async ({ page }) => {
  // Qualsiasi errore in console (incluse violazioni della CSP) fa fallire il test.
  page.on('console', (message) => {
    if (message.type() === 'error') throw new Error(`Errore in console: ${message.text()}`);
  });
  await page.addInitScript(() => localStorage.setItem('locale', 'it'));
});

test('imprenditore: ingresso, decisione, rapporto mensile con i perché', async ({ page }, info) => {
  await register(page, uniqueName('imp'));
  await expect(page.getByRole('heading', { name: 'Scegli da dove partire' })).toBeVisible();
  await page.screenshot({ path: `docs/screenshots/${info.project.name}-1-classe.png` });

  await page.getByRole('radio', { name: /Imprenditore/ }).click();
  await page.getByLabel('Settore').selectOption('retail');
  await page.getByRole('button', { name: 'Entra in città' }).click();
  await expect(page.getByText(/Anno \d+ · Mese \d+ · Settimana \d+/)).toBeVisible();

  await page.getByRole('button', { name: /Azienda/ }).click();
  await page.getByText(/^Prezzo · /).click();
  await page.getByRole('spinbutton', { name: 'Prezzo' }).fill('20');
  await page.getByRole('button', { name: 'Conferma' }).first().click();
  await expect(page.getByRole('status')).toContainText('Decisione registrata');
  await page.screenshot({
    path: `docs/screenshots/${info.project.name}-2-azienda.png`,
    fullPage: true,
  });

  await tick(page, 4);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Rapporto del mese' })).toBeVisible();
  await expect(page.locator('.report-item').first()).toBeVisible();
  const why = page.getByText('Perché?').first();
  if (await why.isVisible()) await why.click();
  await page.screenshot({
    path: `docs/screenshots/${info.project.name}-3-panoramica.png`,
    fullPage: true,
  });

  await page.getByRole('button', { name: /Mercato/ }).click();
  await expect(page.getByRole('heading', { name: 'Economia della città' })).toBeVisible();
  await page.screenshot({
    path: `docs/screenshots/${info.project.name}-4-mercato.png`,
    fullPage: true,
  });
});

test('dipendente: agenda, classifica e cambio lingua', async ({ page }, info) => {
  const name = uniqueName('dip');
  await register(page, name);
  await page.getByRole('radio', { name: /Dipendente/ }).click();
  await page.getByRole('button', { name: 'Entra in città' }).click();
  await expect(page.getByText(/Anno \d+ · Mese/)).toBeVisible();

  await page.getByRole('button', { name: /Agenda/ }).click();
  await expect(page.getByRole('heading', { name: 'Ore del mese' })).toBeVisible();
  await page.screenshot({
    path: `docs/screenshots/${info.project.name}-5-agenda.png`,
    fullPage: true,
  });

  await tick(page, 4);
  await page.getByRole('button', { name: /Classifica/ }).click();
  await expect(page.getByText(`${name} (Tu)`)).toBeVisible();
  await page.screenshot({ path: `docs/screenshots/${info.project.name}-6-classifica.png` });

  await page.getByRole('combobox', { name: 'Lingua' }).selectOption('en');
  await expect(page.getByRole('button', { name: /Overview/ })).toBeVisible();
  await expect(page.getByText(`${name} (You)`)).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('header di sicurezza sulla pagina servita', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response?.headers() ?? {};
  expect(headers['content-security-policy']).toContain("script-src 'self'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  const api = await page.request.get('/api/game/view');
  expect(api.status()).toBe(401);
});
