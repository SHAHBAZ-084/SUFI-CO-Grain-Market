-- Parallel physical-kg tracking alongside bag counts (not derived from bags × constant).
-- Existing rows default to 0 (no historical backfill; same window as bag stock tracking).
ALTER TABLE "StockMovement" ADD COLUMN "kg" DECIMAL NOT NULL DEFAULT 0;
