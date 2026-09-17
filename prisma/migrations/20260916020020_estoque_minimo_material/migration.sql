-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Material" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '',
    "costPerKg" REAL NOT NULL,
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "unitWeightGrams" REAL NOT NULL DEFAULT 1000,
    "stockGrams" REAL NOT NULL DEFAULT 0,
    "lowStockThresholdGrams" REAL NOT NULL DEFAULT 200,
    "purchaseDate" DATETIME,
    "purchaseLink" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Material" ("active", "brand", "color", "costPerKg", "createdAt", "id", "name", "purchaseDate", "purchaseLink", "stockGrams", "type", "unitPrice", "unitWeightGrams", "updatedAt") SELECT "active", "brand", "color", "costPerKg", "createdAt", "id", "name", "purchaseDate", "purchaseLink", "stockGrams", "type", "unitPrice", "unitWeightGrams", "updatedAt" FROM "Material";
DROP TABLE "Material";
ALTER TABLE "new_Material" RENAME TO "Material";
CREATE UNIQUE INDEX "Material_name_key" ON "Material"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
