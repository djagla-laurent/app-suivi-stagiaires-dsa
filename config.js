// Remplacez ces deux valeurs par celles du NOUVEAU projet Supabase de cette application
// (Supabase > Project Settings > API Keys).
// La clé publique (publishable / anon) peut être visible. N'utilisez JAMAIS la clé secret / service_role.
const SUPABASE_URL = "https://VOTRE-PROJET.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kF_wYENjojAYmsK9luSg0w_Y4ybawHB";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
