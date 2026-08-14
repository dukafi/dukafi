# 09 — Orders admin screen

**Depends on:** 07 (orders must exist to list)

## Scope

Add an **Orders** section to the Commerce workspace (see
`dukafi-editor/src/admin/pages/commerce/CommercePage.tsx` — currently
Products / Collections / Import; this is a 4th section, same
`workspaceNavigation` pattern already used there).

- List: order id/date, customer email, status, total. Reuse `DataTable`
  (same component `ProductsSection.tsx`'s variants table already uses).
- Detail: line items, addresses, status history, a manual status transition
  (`paid → fulfilled → shipped`), refund action calling the Stripe API.
- Ruby API: `GET/PATCH /admin/api/cms/commerce/orders(/:id)` mirroring the
  existing products/collections endpoints in `dukafi/routes/admin_api.rb`
  (`commerce_product_payload`-style serializer, `require_admin!` guard).

## Acceptance

- Manual: a paid order from task 07 appears in the list, detail shows correct
  line items/addresses, marking `fulfilled` persists and shows in the list,
  refund actually calls Stripe (test mode) and updates status.
- No storefront-facing admin routes — matches
  `docs/architecture/admin-store.md`'s existing rule that all merchant admin
  lives in the Commerce workspace, never on the public host.
