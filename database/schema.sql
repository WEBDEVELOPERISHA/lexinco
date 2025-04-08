CREATE DATABASE IF NOT EXISTS lexicon;
USE lexicon;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE otps (
    email VARCHAR(255) PRIMARY KEY,
    otp VARCHAR(6) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE notices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_name VARCHAR(255) NOT NULL,
    sender_address TEXT NOT NULL,
    sender_contact VARCHAR(20) NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255) NOT NULL,
    recipient_address TEXT NOT NULL,
    recipient_contact VARCHAR(20),
    recipient_email VARCHAR(255),
    relationship_type VARCHAR(50) NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_place VARCHAR(255),
    contract_details TEXT NOT NULL,
    issue_description TEXT NOT NULL,
    key_events TEXT NOT NULL,
    damages_suffered TEXT NOT NULL,
    laws_violated TEXT NOT NULL,
    specific_demand TEXT NOT NULL,
    compensation_amount VARCHAR(50),
    compliance_timeframe VARCHAR(50) NOT NULL,
    signature_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);