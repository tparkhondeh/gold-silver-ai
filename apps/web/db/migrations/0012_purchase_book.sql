BEGIN;

-- Legacy holdings remain opening positions. Exact purchase inputs are a separate
-- versioned document; NULL means no purchase book, not an invented migration.
-- The existing parent row's forced RLS, version lock and backup coverage apply.
ALTER TABLE user_portfolios ADD COLUMN purchase_book jsonb;

ALTER TABLE user_portfolios ADD CONSTRAINT user_portfolios_purchase_book_shape CHECK (
  purchase_book IS NULL OR COALESCE(
    jsonb_typeof(purchase_book) = 'object'
    AND purchase_book->>'version' = 'asha.purchase_book.v1'
    AND CASE WHEN jsonb_typeof(purchase_book->'lots') = 'array'
      THEN jsonb_array_length(purchase_book->'lots') <= 500 ELSE false END
    AND CASE WHEN jsonb_typeof(purchase_book->'imports') = 'array'
      THEN jsonb_array_length(purchase_book->'imports') <= 500 ELSE false END,
    false
  )
);

COMMIT;
