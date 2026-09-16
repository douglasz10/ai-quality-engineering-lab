import { test as base, type Page } from "@playwright/test";
import { LoginPage } from "./pages/login.page.ts";

export const USERS = {
  standard: { username: "standard_user", password: "secret_sauce" },
  invalid: { username: "no_such_user", password: "wrong_password" },
} as const;

export const PRODUCTS = {
  backpack: { name: "Sauce Labs Backpack", slug: "sauce-labs-backpack" },
  bikeLight: { name: "Sauce Labs Bike Light", slug: "sauce-labs-bike-light" },
} as const;

export const CHECKOUT_INFO = {
  valid: { firstName: "John", lastName: "Doe", zip: "12345" },
  missingLastName: { firstName: "John", lastName: "", zip: "12345" },
} as const;

/**
 * Per-test isolated context already provided by Playwright; this fixture
 * adds a logged-in page so each test starts from inventory independently.
 */
export const test = base.extend<{ page: Page }>({
  page: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const login = new LoginPage(page);
    await login.goto();
    await login.login(USERS.standard.username, USERS.standard.password);
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
