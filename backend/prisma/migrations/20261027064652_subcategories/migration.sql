-- AlterTable
ALTER TABLE `items` ADD COLUMN `subcategory_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `purchase_request_items` ADD COLUMN `new_item_subcategory_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `subcategories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `code` CHAR(3) NOT NULL,
    `next_item_number` INTEGER NOT NULL DEFAULT 1,
    `description` TEXT NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subcategories_name_key`(`name`),
    UNIQUE INDEX `subcategories_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `items_subcategory_id_idx` ON `items`(`subcategory_id`);

-- CreateIndex
CREATE INDEX `purchase_request_items_new_item_subcategory_id_idx` ON `purchase_request_items`(`new_item_subcategory_id`);

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_subcategory_id_fkey` FOREIGN KEY (`subcategory_id`) REFERENCES `subcategories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_request_items` ADD CONSTRAINT `purchase_request_items_new_item_subcategory_id_fkey` FOREIGN KEY (`new_item_subcategory_id`) REFERENCES `subcategories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
