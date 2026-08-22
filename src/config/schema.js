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
        item_type ENUM('job', 'post') NOT NULL,
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
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_linkerin_profiles_user FOREIGN KEY (user_id) REFERENCES linkerin_users(id) ON DELETE CASCADE
    )`
];

const columnMigrations = {
    linkerin_items: {
        linkedin_message_draft: 'TEXT NULL'
    }
};

module.exports = { columnMigrations, schemaStatements };
