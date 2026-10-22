-- À coller dans Supabase > SQL Editor > New query, puis cliquer sur "Run".
-- Projet Supabase NEUF, dédié à cette application. Peut être relancé sans risque.

-- 1. Administrateurs
create table if not exists public.administrateurs (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.administrateurs enable row level security;

create or replace function public.est_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.administrateurs where user_id = auth.uid());
$$;

-- 2. Table des stages
create table if not exists public.stages (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete set null,
  code_rattachement text unique,
  nom_prenoms       text not null check (char_length(nom_prenoms) between 1 and 200),
  cle_identite      text not null default '',
  filiere           text not null check (char_length(filiere) between 1 and 150),
  type_stage        text not null check (char_length(type_stage) between 1 and 100),
  but_stage         text not null check (char_length(but_stage) between 1 and 1000),
  date_debut        date not null,
  date_fin          date not null,
  created_at        timestamptz not null default now(),
  check (date_fin >= date_debut)
);

-- Université d'étude (ajoutée après coup : les anciens enregistrements restent sans université)
alter table public.stages
  add column if not exists universite text
  check (universite is null or char_length(universite) between 1 and 200);

-- Niveau de formation (ajouté après coup : les anciens enregistrements restent sans niveau)
alter table public.stages
  add column if not exists niveau text
  check (niveau is null or niveau in ('L1','L2','L3','M1','M2'));

create index if not exists stages_cle_identite_idx on public.stages (cle_identite);
create index if not exists stages_user_id_idx on public.stages (user_id);

-- 3. Identité normalisée : sans accents, majuscules ni ponctuation,
--    indépendante de l'ordre des mots ("Jean Dupont" = "DUPONT jean").
create or replace function public.cle_identite(texte text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(array_to_string(array(
    select mot
    from unnest(string_to_array(
      trim(regexp_replace(
        translate(lower(texte),
                  'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ',
                  'aaaaaaceeeeiiiinooooouuuuyyoa'),
        '[^a-z0-9]+', ' ', 'g')),
      ' ')) as mot
    where mot <> ''
    order by mot
  ), ' '), '');
$$;

-- 4. Contrôles à chaque enregistrement : doublon exact et chevauchement
create or replace function public.verifier_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.cle_identite := public.cle_identite(new.nom_prenoms);

  if new.cle_identite = '' then
    raise exception 'NOM_INVALIDE';
  end if;

  perform pg_advisory_xact_lock(hashtext(new.cle_identite));

  -- Mêmes dates de début et de fin : déjà enregistré.
  if exists (
    select 1 from public.stages s
    where s.id <> new.id
      and (s.cle_identite = new.cle_identite
           or (new.user_id is not null and s.user_id = new.user_id))
      and s.date_debut = new.date_debut
      and s.date_fin = new.date_fin
  ) then
    raise exception 'DEJA_ENREGISTRE';
  end if;

  -- Période qui chevauche un autre stage de la même personne.
  if exists (
    select 1 from public.stages s
    where s.id <> new.id
      and (s.cle_identite = new.cle_identite
           or (new.user_id is not null and s.user_id = new.user_id))
      and s.date_debut <= new.date_fin
      and s.date_fin >= new.date_debut
  ) then
    raise exception 'STAGE_CHEVAUCHANT';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_verifier_stage on public.stages;
create trigger trg_verifier_stage
  before insert or update on public.stages
  for each row execute function public.verifier_stage();

-- 5. Enregistrer un stage (ouvert à tous ; rattaché automatiquement si connecté)
--    Retourne un code de rattachement si la personne n'est pas connectée, sinon NULL.
drop function if exists public.enregistrer_stage(text, text, text, text, date, date);
drop function if exists public.enregistrer_stage(text, text, text, text, text, date, date);

create or replace function public.enregistrer_stage(
  p_nom text, p_filiere text, p_niveau text, p_universite text, p_type text, p_but text, p_debut date, p_fin date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
begin
  if char_length(trim(coalesce(p_universite, ''))) = 0 then
    raise exception 'UNIVERSITE_INVALIDE';
  end if;

  if p_niveau is null or p_niveau not in ('L1','L2','L3','M1','M2') then
    raise exception 'NIVEAU_INVALIDE';
  end if;

  if v_uid is null then
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  end if;

  insert into public.stages
    (user_id, code_rattachement, nom_prenoms, filiere, niveau, universite, type_stage, but_stage, date_debut, date_fin)
  values
    (v_uid, v_code, trim(p_nom), trim(p_filiere), p_niveau, trim(p_universite), trim(p_type), trim(p_but), p_debut, p_fin);

  return v_code;
end;
$$;

revoke all on function public.enregistrer_stage(text, text, text, text, text, text, date, date) from public;
grant execute on function public.enregistrer_stage(text, text, text, text, text, text, date, date) to anon, authenticated;

-- 6. Rattacher un stage saisi plus tôt au compte connecté, avec son code (usage unique)
create or replace function public.rattacher_stage(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  n integer;
begin
  if auth.uid() is null then
    raise exception 'NON_CONNECTE';
  end if;

  update public.stages
     set user_id = auth.uid(), code_rattachement = null
   where code_rattachement = v_code
     and user_id is null;

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.rattacher_stage(text) from public;
grant execute on function public.rattacher_stage(text) to authenticated;

-- 7. Règles d'accès
alter table public.stages enable row level security;

revoke all on public.stages from anon, authenticated;
grant select, update, delete on public.stages to authenticated;

drop policy if exists "lecture" on public.stages;
drop policy if exists "modification" on public.stages;
drop policy if exists "suppression" on public.stages;

-- Aucune écriture directe : les ajouts passent uniquement par enregistrer_stage().
-- Un stagiaire voit seulement ses stages ; l'administrateur voit tout.
create policy "lecture"
  on public.stages for select
  to authenticated
  using (user_id = auth.uid() or public.est_admin());

create policy "modification"
  on public.stages for update
  to authenticated
  using (public.est_admin())
  with check (public.est_admin());

create policy "suppression"
  on public.stages for delete
  to authenticated
  using (public.est_admin());
