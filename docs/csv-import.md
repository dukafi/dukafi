# Product CSV import

Open **Commerce → Import CSV** in the editor. Imports are atomic: if any row is
invalid, no products or variants from the file are saved.

Required columns:

```csv
product_title,product_slug,vendor,status,description_html,sku,variant_title,price_cents,currency,stock,position
Canvas Bag,canvas-bag,Dukafy,active,"<p>A durable bag.</p>",BAG-BLACK,Black,12900,USD,8,0
Canvas Bag,canvas-bag,Dukafy,active,"<p>A durable bag.</p>",BAG-NATURAL,Natural,12900,USD,5,1
```

`price_cents`, `stock`, and `position` are integers. Status is `draft` or
`active`; currency is a three-letter uppercase code. Re-importing a product
slug updates that product, and re-importing one of its SKUs updates the variant.
A row with a blank SKU imports the product without a variant.
