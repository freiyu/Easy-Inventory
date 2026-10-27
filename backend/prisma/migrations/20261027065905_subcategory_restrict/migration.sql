-- DropForeignKey
ALTER TABLE `items` DROP FOREIGN KEY `items_subcategory_id_fkey`;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_subcategory_id_fkey` FOREIGN KEY (`subcategory_id`) REFERENCES `subcategories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
