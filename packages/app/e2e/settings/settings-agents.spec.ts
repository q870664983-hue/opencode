import { test, expect } from "../fixtures"
import { openSettings } from "../actions"

test("agents settings tab opens without crashing", async ({ page, gotoSession }) => {
  await gotoSession()

  const settings = await openSettings(page)
  await settings.getByRole("tab", { name: "Agents" }).click()

  await expect(settings.getByRole("heading", { name: "Agents", exact: true })).toBeVisible()
  await expect(settings.getByRole("heading", { name: "Main chat agents", exact: true })).toBeVisible()
  await expect(settings.getByRole("button", { name: "Edit agents", exact: true })).toBeVisible()
})

test("agents settings can open manage agents dialog", async ({ page, gotoSession }) => {
  await gotoSession()

  const settings = await openSettings(page)
  await settings.getByRole("tab", { name: "Agents" }).click()
  await settings.getByRole("button", { name: "Edit agents", exact: true }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Manage agents", exact: true })).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Add agent", exact: true })).toBeVisible()
  await dialog.getByRole("tab", { name: "Memory", exact: true }).click()
  await expect(dialog.getByText("Shared memory source", { exact: true })).toBeVisible()
})
