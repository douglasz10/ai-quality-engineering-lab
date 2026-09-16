import type { Locator, Page } from "@playwright/test";

/** Cart page. */
export class CartPage {
  readonly page: Page;
  readonly checkoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.checkoutButton = page.getByRole("button", { name: "Checkout" });
  }

  cartItem(productName: string): Locator {
    return this.page.locator("[data-test='inventory-item-name']").filter({ hasText: productName });
  }

  async checkout(): Promise<void> {
    await this.checkoutButton.click();
  }
}
