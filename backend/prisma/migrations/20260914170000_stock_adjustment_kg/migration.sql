-- Optional physical kg on stock adjustments (opening / seed stock alongside bags).
ALTER TABLE "StockAdjustment" ADD COLUMN "kg" DECIMAL NOT NULL DEFAULT 0;
