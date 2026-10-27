ALTER TABLE "Store" ADD COLUMN "ticketUrl" TEXT;
UPDATE "Store" SET "ticketUrl" = 'https://www.tamershop.com.br/?view=ecom/item&ing=46575'
WHERE "id" = 'tamer-shop' OR lower(trim("name")) = 'tamer shop';
