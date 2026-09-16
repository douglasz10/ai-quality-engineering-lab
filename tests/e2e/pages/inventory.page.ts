import type { Locator, Page } from "@playwright/test";

/**
 * Inventory page. Sauce Demo renders inventory items asynchronously after
 * login, so assertions target the item-name locator (stable once loaded).
 * When E2E_DEMO_FAILURE=true the locator is intentionally wrong so exactly
 * one assertion fails with clear locator evidence. Normal runs are
 * unaffected. All locators use explicit `[data-test='...']` selectors
 * because Sauce Demo's `data-test` attribute is not matched by
 * Playwright's default getByTestId.
 */
export class InventoryPage {
  readonly page: Page;
  readonly productNames: Locator;
  readonly cartBadge: Locator;
  readonly cartLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.productNames =
      process.env["E2E_DEMO_FAILURE"] === "true"
        ? page.locator("[data-test='demo-broken-product-list']")
        : page.locator("[data-test='inventory-item-name']");
    this.cartBadge = page.locator("[data-test='shopping-cart-badge']");
    this.cartLink = page.locator("[data-test='shopping-cart-link']");
  }

  productTitle(productName: string): Locator {
    return this.page.locator("[data-test='inventory-item-name']").filter({ hasText: productName });
  }

  addToCartButton(productSlug: string): Locator {
    return this.page.locator(`[data-test='add-to-cart-${productSlug}']`);
  }

  async addToCart(productSlug: string): Promise<void> {
    await this.addToCartButton(productSlug).click();
  }

  async openCart(): Promise<void> {
    await this.page.locator("[data-test='shopping-cart-link']").click();
  }

  async removeFromCart(productSlug: string): Promise<void> {
    await this.page.locator(`[data-test='remove-${productSlug}']`).click();
  }
}
