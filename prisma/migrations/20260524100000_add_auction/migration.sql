-- CreateTable
CREATE TABLE "auctions" (
    "id" TEXT NOT NULL,
    "mieralTypeId" TEXT NOT NULL,
    "round" TEXT,
    "mass" TEXT NOT NULL,
    "unit" "MassUnit" NOT NULL DEFAULT 'Gram',
    "unitPrice" TEXT NOT NULL,
    "priceCurrency" "Currency" NOT NULL DEFAULT 'AFN',
    "royalty" INTEGER,

    CONSTRAINT "auctions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_mieralTypeId_fkey" FOREIGN KEY ("mieralTypeId") REFERENCES "MineralType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

