// Valeurs du projet Supabase "stages-dsa".
// La clé publique (publishable) peut être visible. N'utilisez JAMAIS la clé secret / service_role.
const SUPABASE_URL = "https://hnkrzddxfieigfwibsbx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kF_wYENjojAYmsK9luSg0w_Y4ybawHB";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
