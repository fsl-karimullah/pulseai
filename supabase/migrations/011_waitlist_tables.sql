-- Create waitlist_internal table
CREATE TABLE IF NOT EXISTS public.waitlist_internal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.waitlist_internal ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public inserts
CREATE POLICY "Allow public insert to waitlist_internal" 
ON public.waitlist_internal 
FOR INSERT 
WITH CHECK (true);

-- Create policy to allow only authenticated reads (if needed)
CREATE POLICY "Allow admin read waitlist_internal" 
ON public.waitlist_internal 
FOR SELECT 
TO authenticated 
USING (true);


-- Create waitlist_hr table
CREATE TABLE IF NOT EXISTS public.waitlist_hr (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.waitlist_hr ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public inserts
CREATE POLICY "Allow public insert to waitlist_hr" 
ON public.waitlist_hr 
FOR INSERT 
WITH CHECK (true);

-- Create policy to allow only authenticated reads (if needed)
CREATE POLICY "Allow admin read waitlist_hr" 
ON public.waitlist_hr 
FOR SELECT 
TO authenticated 
USING (true);
