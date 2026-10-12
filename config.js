// Remplacez ces deux valeurs par celles du NOUVEAU projet Supabase de cette application
// (Supabase > Project Settings > API Keys).
// La clé publique (publishable / anon) peut être visible. N'utilisez JAMAIS la clé secret / service_role.
const SUPABASE_URL = "https://VOTRE-PROJET.supabase.co";
const SUPABASE_ANON_KEY = "VOTRE-CLE-PUBLIQUE";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
