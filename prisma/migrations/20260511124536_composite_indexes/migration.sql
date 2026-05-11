-- CreateIndex
CREATE INDEX "customers_companyId_name_idx" ON "customers"("companyId", "name");

-- CreateIndex
CREATE INDEX "inventory_stock_companyId_itemId_idx" ON "inventory_stock"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "items_companyId_name_idx" ON "items"("companyId", "name");

-- CreateIndex
CREATE INDEX "payments_companyId_paymentDate_idx" ON "payments"("companyId", "paymentDate");

-- CreateIndex
CREATE INDEX "purchases_companyId_status_purchaseDate_idx" ON "purchases"("companyId", "status", "purchaseDate");

-- CreateIndex
CREATE INDEX "sales_companyId_saleDate_idx" ON "sales"("companyId", "saleDate");

-- CreateIndex
CREATE INDEX "sales_companyId_paymentStatus_dueDate_idx" ON "sales"("companyId", "paymentStatus", "dueDate");

-- CreateIndex
CREATE INDEX "sales_companyId_customerId_saleDate_idx" ON "sales"("companyId", "customerId", "saleDate");

-- CreateIndex
CREATE INDEX "sales_companyId_saleStatus_saleDate_idx" ON "sales"("companyId", "saleStatus", "saleDate");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_type_createdAt_idx" ON "stock_movements"("companyId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_itemId_createdAt_idx" ON "stock_movements"("companyId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_referenceType_referenceId_idx" ON "stock_movements"("companyId", "referenceType", "referenceId");
