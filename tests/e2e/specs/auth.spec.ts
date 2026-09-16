import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page.ts";
import { InventoryPage } from "../pages/inventory.page.ts";
import { USERS } from "../fixtures.ts";

/** Auth: valid login reaches inventory; invalid credentials stay with an error. */
test("valid login reaches the product inventory", async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(USERS.standard.username, USERS.standard.password);
  await expect(page).toHaveURL(/inventory/);
  const inventory = new InventoryPage(page);
  await expect(inventory.productNames.first()).toBeVisible();
});

test("invalid login shows an error and stays on the login page", async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(USERS.invalid.username, USERS.invalid.password);
  await expect(login.errorMessage).toContainText(
    "Username and password do not match any user in this service",
  );
  await expect(page).toHaveURL(/saucedemo\.com\/?$/);
});
