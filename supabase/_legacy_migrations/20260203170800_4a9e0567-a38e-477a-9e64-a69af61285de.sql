-- Add user_id column to user_passwords to support admin password tracking
ALTER TABLE public.user_passwords 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create unique index for user_id (partial, only where not null)
CREATE UNIQUE INDEX IF NOT EXISTS user_passwords_user_id_unique 
ON public.user_passwords(user_id) WHERE user_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.user_passwords.user_id IS 'References auth.users for admin password tracking (admins are not in vip_subscribers)';