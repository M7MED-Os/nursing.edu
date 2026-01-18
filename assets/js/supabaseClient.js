import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://bxmmrkcodhwuxwutmauq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4bW1ya2NvZGh3dXh3dXRtYXVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODY3MzgsImV4cCI6MjA4NDI2MjczOH0.Pfy3W_Fh4eCXIzOCnl8rK83A8dnMbAyhUxMkVd97rwE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
