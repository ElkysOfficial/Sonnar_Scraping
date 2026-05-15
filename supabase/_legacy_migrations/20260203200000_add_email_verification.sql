-- Add email verification columns to vip_subscribers
ALTER TABLE vip_subscribers
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Add user_id column to user_passwords for admin lookup
ALTER TABLE user_passwords
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create email_verification_tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES vip_subscribers(id) ON DELETE CASCADE,
  token VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_subscriber_id
ON email_verification_tokens(subscriber_id);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token
ON email_verification_tokens(token);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at
ON email_verification_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_vip_subscribers_email_verified
ON vip_subscribers(email_verified);

-- Enable RLS on the new table
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access only (no client access)
CREATE POLICY "Service role can manage verification tokens"
ON email_verification_tokens
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Add comment for documentation
COMMENT ON TABLE email_verification_tokens IS 'Stores email verification tokens for new subscribers';
COMMENT ON COLUMN email_verification_tokens.token IS '6-digit verification code sent to user email';
COMMENT ON COLUMN email_verification_tokens.expires_at IS 'Token expiration time (15 minutes from creation)';
COMMENT ON COLUMN email_verification_tokens.verified_at IS 'When the token was successfully verified';
