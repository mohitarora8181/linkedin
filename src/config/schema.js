const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS linkerin_users (
        id CHAR(36) PRIMARY KEY,
        google_subject VARCHAR(255) NOT NULL UNIQUE,
        email VARCHAR(320) NOT NULL UNIQUE,
        name VARCHAR(255) NULL,
        picture_url TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    )`,
    `CREATE TABLE IF NOT EXISTS linkerin_items (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        user_email VARCHAR(320) NOT NULL,
        source_url TEXT NOT NULL,
        source_url_hash CHAR(64) NOT NULL,
        item_type ENUM('job', 'post', 'outreach') NOT NULL,
        content JSON NULL,
        is_pending BOOLEAN NOT NULL DEFAULT TRUE,
        scrape_error TEXT NULL,
        author_name TEXT NULL,
        post_content MEDIUMTEXT NULL,
        job_title TEXT NULL,
        company_name TEXT NULL,
        location TEXT NULL,
        ai_status ENUM('idle', 'queued', 'completed', 'failed') NOT NULL DEFAULT 'idle',
        ai_error TEXT NULL,
        ai_mail JSON NULL,
        linkedin_message_draft TEXT NULL,
        is_job_related BOOLEAN NULL,
        recruiter_email TEXT NULL,
        ai_updated_at DATETIME(3) NULL,
        mail_sent BOOLEAN NOT NULL DEFAULT FALSE,
        mail_send_status ENUM('idle', 'queued', 'sent', 'failed') NOT NULL DEFAULT 'idle',
        mail_send_error TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_linkerin_items_user FOREIGN KEY (user_id) REFERENCES linkerin_users(id) ON DELETE CASCADE,
        UNIQUE KEY linkerin_items_user_source_url_idx (user_id, source_url_hash),
        KEY linkerin_items_user_created_at_idx (user_id, created_at DESC, id DESC),
        KEY linkerin_items_pending_idx (is_pending, created_at),
        KEY linkerin_items_ai_status_idx (ai_status, ai_updated_at)
    )`,
    `CREATE TABLE IF NOT EXISTS linkerin_user_profiles (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL UNIQUE,
        user_email VARCHAR(320) NOT NULL,
        resume_summary JSON NOT NULL,
        resume_file_name TEXT NULL,
        resume_mime_type VARCHAR(255) NULL,
        auto_email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_linkerin_profiles_user FOREIGN KEY (user_id) REFERENCES linkerin_users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS linkerin_gmail_connections (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL UNIQUE,
        google_subject VARCHAR(255) NOT NULL,
        gmail_email VARCHAR(320) NOT NULL,
        encrypted_refresh_token TEXT NOT NULL,
        granted_scopes TEXT NOT NULL,
        connected_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_linkerin_gmail_user FOREIGN KEY (user_id) REFERENCES linkerin_users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS bulk_email_processor (
        id CHAR(36) PRIMARY KEY,
        batch_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        email_to TEXT NOT NULL,
        subject TEXT NULL,
        body_template MEDIUMTEXT NULL,
        column_values JSON NOT NULL,
        status ENUM('preparing', 'queued', 'sending', 'sent', 'failed') NOT NULL DEFAULT 'preparing',
        error_message TEXT NULL,
        email_sent BOOLEAN NOT NULL DEFAULT FALSE,
        email_sent_at DATETIME(3) NULL,
        available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_bulk_email_user FOREIGN KEY (user_id) REFERENCES linkerin_users(id) ON DELETE CASCADE,
        KEY bulk_email_batch_idx (batch_id, status, created_at),
        KEY bulk_email_user_idx (user_id, created_at DESC),
        KEY bulk_email_pending_idx (status, available_at, batch_id)
    )`,
    `CREATE TABLE IF NOT EXISTS linkerin_email_send_limits (
        user_id CHAR(36) PRIMARY KEY,
        sent_on DATE NOT NULL,
        sent_count INT UNSIGNED NOT NULL DEFAULT 0,
        in_flight_count INT UNSIGNED NOT NULL DEFAULT 0,
        last_attempt_at DATETIME(3) NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_email_send_limits_user FOREIGN KEY (user_id) REFERENCES linkerin_users(id) ON DELETE CASCADE
    )`,
];

const columnMigrations = {
    linkerin_items: {
        linkedin_message_draft: 'TEXT NULL',
        mail_send_status: "ENUM('idle', 'queued', 'sent', 'failed') NOT NULL DEFAULT 'idle'",
        mail_send_error: 'TEXT NULL'
    },
    linkerin_user_profiles: {
        auto_email_enabled: 'BOOLEAN NOT NULL DEFAULT FALSE'
    },
    bulk_email_processor: {
        available_at: 'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)'
    }
};

module.exports = { columnMigrations, schemaStatements };
