import { test, expect } from "../fixtures.ts";
import { InventoryPage } from "../pages/inventory.page.ts";
import { CartPage } from "../pages/cart.page.ts";
import { CheckoutPage } from "../pages/checkout.page.ts";
import { PRODUCTS, CHECKOUT_INFO } from "../fixtures.ts";

/**
 * Purchase flows: cart behavior, valid checkout, invalid checkout, and the
 * critical end-to-end journey. Each test logs in via the shared fixture so
 * no test depends on another test's state.
 */
test("adding a product updates the cart", async ({ page }) => {
  const inventory = new InventoryPage(page);
  await inventory.addToCart(PRODUCTS.backpack.slug);
  await expect(page.locator("[data-test='remove-sauce-labs-backpack']")).toBeVisible();
  await expect(page.locator("[data-test='shopping-cart-badge']")).toHaveText("1");
  await inventory.openCart();
  const cart = new CartPage(page);
  await expect(cart.cartItem(PRODUCTS.backpack.name)).toBeVisible();
});

test("valid checkout completes the order", async ({ page }) => {
  const inventory = new InventoryPage(page);
  await inventory.addToCart(PRODUCTS.backpack.slug);
  await inventory.openCart();
  const cart = new CartPage(page);
  await cart.checkout();
  const checkout = new CheckoutPage(page);
  await checkout.fillInfo(
    CHECKOUT_INFO.valid.firstName,
    CHECKOUT_INFO.valid.lastName,
    CHECKOUT_INFO.valid.zip,
  );
  await checkout.continueCheckout();
  await checkout.finish();
  await expect(checkout.completeHeader).toHaveText("Thank you for your order!");
});

test("checkout with missing last name shows an error", async ({ page }) => {
  const inventory = new InventoryPage(page);
  await inventory.addToCart(PRODUCTS.backpack.slug);
  await inventory.openCart();
  const cart = new CartPage(page);
  await cart.checkout();
  const checkout = new CheckoutPage(page);
  await checkout.fillInfo(
    CHECKOUT_INFO.missingLastName.firstName,
    CHECKOUT_INFO.missingLastName.lastName,
    CHECKOUT_INFO.missingLastName.zip,
  );
  await checkout.continueCheckout();
  await expect(checkout.errorMessage).toContainText("Last Name is required");
});

test("critical purchase journey from login to confirmation", async ({ page }) => {
  const inventory = new InventoryPage(page);
  await inventory.addToCart(PRODUCTS.backpack.slug);
  await expect(page.locator("[data-test='remove-sauce-labs-backpack']")).toBeVisible();
  await inventory.addToCart(PRODUCTS.bikeLight.slug);
  await expect(page.locator("[data-test='remove-sauce-labs-bike-light']")).toBeVisible();
  await expect(page.locator("[data-test='shopping-cart-badge']")).toHaveText("2");
  await inventory.openCart();
  const cart = new CartPage(page);
  await expect(cart.cartItem(PRODUCTS.backpack.name)).toBeVisible();
  await expect(cart.cartItem(PRODUCTS.bikeLight.name)).toBeVisible();
  await cart.checkout();
  const checkout = new CheckoutPage(page);
  await checkout.fillInfo(
    CHECKOUT_INFO.valid.firstName,
    CHECKOUT_INFO.valid.lastName,
    CHECKOUT_INFO.valid.zip,
  );
  await checkout.continueCheckout();
  await checkout.finish();
  await expect(checkout.completeHeader).toHaveText("Thank you for your order!");
  await expect(page.locator("[data-test='shopping-cart-badge']")).toHaveCount(0);
});
