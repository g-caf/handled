-- Migration: 001_initial
-- Creates core tables for grocery-deals application

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Offices table
CREATE TABLE offices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Office members (join table with role)
CREATE TABLE office_members (
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (office_id, user_id)
);

-- Shopping carts
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cart items
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit TEXT,
    search_terms TEXT[],
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Price checks
CREATE TABLE price_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    platform TEXT NOT NULL,
    store_query TEXT,
    error TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Price check items (matched products with pricing)
CREATE TABLE price_check_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    price_check_id UUID NOT NULL REFERENCES price_checks(id) ON DELETE CASCADE,
    cart_item_id UUID NOT NULL REFERENCES cart_items(id) ON DELETE CASCADE,
    matched_title TEXT,
    unit_price_cents INTEGER,
    line_total_cents INTEGER,
    currency TEXT DEFAULT 'USD',
    in_stock BOOLEAN,
    confidence REAL,
    raw_extraction JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform sessions (for storing authenticated sessions)
CREATE TABLE platform_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    storage_state_enc TEXT,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    last_validated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_office_members_user_id ON office_members(user_id);
CREATE INDEX idx_carts_office_id ON carts(office_id);
CREATE INDEX idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX idx_price_checks_office_id ON price_checks(office_id);
CREATE INDEX idx_price_checks_cart_id ON price_checks(cart_id);
CREATE INDEX idx_price_check_items_price_check_id ON price_check_items(price_check_id);
CREATE INDEX idx_platform_sessions_office_id ON platform_sessions(office_id);
CREATE INDEX idx_platform_sessions_platform ON platform_sessions(platform);
