-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(20) NOT NULL,

    UNIQUE INDEX `roles_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role_id` INTEGER NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'Active',
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_role_id_idx`(`role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sessions_user_id_idx`(`user_id`),
    INDEX `sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `code` CHAR(3) NOT NULL,
    `next_item_number` INTEGER NOT NULL DEFAULT 1,
    `description` TEXT NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_name_key`(`name`),
    UNIQUE INDEX `categories_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `contact_person` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(50) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `address` TEXT NOT NULL,
    `notes` TEXT NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'Active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `suppliers_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `category_id` INTEGER NOT NULL,
    `unit` VARCHAR(20) NOT NULL,
    `current_stock` INTEGER NOT NULL DEFAULT 0,
    `minimum_stock` INTEGER NOT NULL DEFAULT 0,
    `last_purchase_price` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `supplier_id` INTEGER NULL,
    `location` VARCHAR(100) NOT NULL DEFAULT '',
    `status` VARCHAR(10) NOT NULL DEFAULT 'Active',
    `notes` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `items_code_key`(`code`),
    INDEX `items_name_idx`(`name`),
    INDEX `items_category_id_idx`(`category_id`),
    INDEX `items_supplier_id_idx`(`supplier_id`),
    INDEX `items_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transaction_number` VARCHAR(30) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'Posted',
    `transaction_date` DATE NOT NULL,
    `user_id` INTEGER NOT NULL,
    `supplier_id` INTEGER NULL,
    `destination` VARCHAR(200) NOT NULL DEFAULT '',
    `reason` TEXT NOT NULL,
    `notes` TEXT NOT NULL,
    `reversal_of_id` INTEGER NULL,
    `loan_id` INTEGER NULL,
    `client_request_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `stock_transactions_transaction_number_key`(`transaction_number`),
    UNIQUE INDEX `stock_transactions_reversal_of_id_key`(`reversal_of_id`),
    UNIQUE INDEX `stock_transactions_client_request_id_key`(`client_request_id`),
    INDEX `stock_transactions_transaction_date_idx`(`transaction_date`),
    INDEX `stock_transactions_type_status_idx`(`type`, `status`),
    INDEX `stock_transactions_user_id_idx`(`user_id`),
    INDEX `stock_transactions_supplier_id_idx`(`supplier_id`),
    INDEX `stock_transactions_loan_id_idx`(`loan_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_transaction_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transaction_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `quantity_change` INTEGER NOT NULL,
    `balance_after` INTEGER NOT NULL,
    `unit_price` DECIMAL(14, 2) NULL,
    `total` DECIMAL(14, 2) NULL,

    INDEX `stock_transaction_items_transaction_id_idx`(`transaction_id`),
    INDEX `stock_transaction_items_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `loans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `loan_number` VARCHAR(30) NOT NULL,
    `borrower_id` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `loan_date` DATE NOT NULL,
    `expected_return_date` DATE NOT NULL,
    `purpose` TEXT NOT NULL,
    `notes` TEXT NOT NULL,
    `reject_reason` TEXT NOT NULL,
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `issued_by` INTEGER NULL,
    `issued_at` DATETIME(3) NULL,
    `returned_at` DATE NULL,
    `received_by` INTEGER NULL,
    `return_notes` TEXT NOT NULL,
    `client_request_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `loans_loan_number_key`(`loan_number`),
    UNIQUE INDEX `loans_client_request_id_key`(`client_request_id`),
    INDEX `loans_status_idx`(`status`),
    INDEX `loans_borrower_id_idx`(`borrower_id`),
    INDEX `loans_loan_date_idx`(`loan_date`),
    INDEX `loans_approved_by_idx`(`approved_by`),
    INDEX `loans_issued_by_idx`(`issued_by`),
    INDEX `loans_received_by_idx`(`received_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `loan_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `loan_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,

    INDEX `loan_items_loan_id_idx`(`loan_id`),
    INDEX `loan_items_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `request_number` VARCHAR(30) NOT NULL,
    `requester_id` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `needed_by` DATE NOT NULL,
    `reason` TEXT NOT NULL,
    `notes` TEXT NOT NULL,
    `reject_reason` TEXT NOT NULL,
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `received_by` INTEGER NULL,
    `received_at` DATE NULL,
    `transaction_id` INTEGER NULL,
    `client_request_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `purchase_requests_request_number_key`(`request_number`),
    UNIQUE INDEX `purchase_requests_transaction_id_key`(`transaction_id`),
    UNIQUE INDEX `purchase_requests_client_request_id_key`(`client_request_id`),
    INDEX `purchase_requests_status_idx`(`status`),
    INDEX `purchase_requests_requester_id_idx`(`requester_id`),
    INDEX `purchase_requests_approved_by_idx`(`approved_by`),
    INDEX `purchase_requests_received_by_idx`(`received_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_request_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchase_request_id` INTEGER NOT NULL,
    `item_id` INTEGER NULL,
    `quantity` INTEGER NOT NULL,
    `new_item_name` VARCHAR(150) NULL,
    `new_item_category_id` INTEGER NULL,
    `new_item_unit` VARCHAR(20) NULL,

    INDEX `purchase_request_items_purchase_request_id_idx`(`purchase_request_id`),
    INDEX `purchase_request_items_item_id_idx`(`item_id`),
    INDEX `purchase_request_items_new_item_category_id_idx`(`new_item_category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `action` VARCHAR(100) NOT NULL,
    `module` VARCHAR(50) NOT NULL,
    `reference` VARCHAR(200) NOT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_logs_created_at_idx`(`created_at`),
    INDEX `activity_logs_module_idx`(`module`),
    INDEX `activity_logs_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `number_sequences` (
    `key` VARCHAR(30) NOT NULL,
    `value` INTEGER NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transactions` ADD CONSTRAINT `stock_transactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transactions` ADD CONSTRAINT `stock_transactions_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transactions` ADD CONSTRAINT `stock_transactions_reversal_of_id_fkey` FOREIGN KEY (`reversal_of_id`) REFERENCES `stock_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transactions` ADD CONSTRAINT `stock_transactions_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transaction_items` ADD CONSTRAINT `stock_transaction_items_transaction_id_fkey` FOREIGN KEY (`transaction_id`) REFERENCES `stock_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transaction_items` ADD CONSTRAINT `stock_transaction_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `loans` ADD CONSTRAINT `loans_borrower_id_fkey` FOREIGN KEY (`borrower_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `loans` ADD CONSTRAINT `loans_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `loans` ADD CONSTRAINT `loans_issued_by_fkey` FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `loans` ADD CONSTRAINT `loans_received_by_fkey` FOREIGN KEY (`received_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `loan_items` ADD CONSTRAINT `loan_items_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `loan_items` ADD CONSTRAINT `loan_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_requests` ADD CONSTRAINT `purchase_requests_requester_id_fkey` FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_requests` ADD CONSTRAINT `purchase_requests_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_requests` ADD CONSTRAINT `purchase_requests_received_by_fkey` FOREIGN KEY (`received_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_requests` ADD CONSTRAINT `purchase_requests_transaction_id_fkey` FOREIGN KEY (`transaction_id`) REFERENCES `stock_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_request_items` ADD CONSTRAINT `purchase_request_items_purchase_request_id_fkey` FOREIGN KEY (`purchase_request_id`) REFERENCES `purchase_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_request_items` ADD CONSTRAINT `purchase_request_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_request_items` ADD CONSTRAINT `purchase_request_items_new_item_category_id_fkey` FOREIGN KEY (`new_item_category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Stock can never go below zero (BR-03), also at database level (PRD 7.3).
ALTER TABLE `items` ADD CONSTRAINT `items_current_stock_not_negative` CHECK (`current_stock` >= 0);

-- The two fixed roles (PRD 3.1, 6.1).
INSERT INTO `roles` (`name`) VALUES ('Admin'), ('Staff');
