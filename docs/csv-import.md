# Product CSV import

Open **Commerce → Import CSV** in the editor. Imports are atomic: if any row is
invalid, no products or variants from the file are saved.

Required columns:

```csv
product_title,product_slug,vendor,status,description_html,sku,variant_title,price_cents,currency,stock,position
Canvas Bag,canvas-bag,Dukafi,active,"<p>A durable bag.</p>",BAG-BLACK,Black,12900,USD,8,0
Canvas Bag,canvas-bag,Dukafi,active,"<p>A durable bag.</p>",BAG-NATURAL,Natural,12900,USD,5,1
```

`price_cents`, `stock`, and `position` are integers. Status is `draft` or
`active`. `currency` is a required column, but its value is ignored — v1 is
single-currency, so every imported variant is always saved with the store's
configured currency (**Commerce → Settings**), never what the file says.
Re-importing a product slug updates that product, and re-importing one of its
SKUs updates the variant. A row with a blank SKU imports the product without
a variant.

Product slugs must be lowercase words separated by single hyphens. Status is
`draft` or `active`; only active products are published to storefront routes.
Prices are integer minor units (`12900` means USD 129.00), never decimal
currency strings. Stock and position must be non-negative integers.

The importer sanitizes `description_html`. After an import, review collection
membership in the Commerce workspace and publish the site before expecting new
product URLs in the baked storefront.
