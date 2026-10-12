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

-- 4. Contrôles à chaque enregistrement : type, durée minimale, doublon, chevauchement, renouvellement
--    Académique : au moins 1 mois. Professionnel : au moins 3 mois, renouvelable une seule fois (2 stages au maximum).
create or replace function public.verifier_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nb integer;
begin
  new.cle_identite := public.cle_identite(new.nom_prenoms);

  if new.cle_identite = '' then
    raise exception 'NOM_INVALIDE';
  end if;

  if new.type_stage not in ('Académique', 'Professionnel') then
    raise exception 'TYPE_INVALIDE';
  end if;

  -- Durée minimale (fin >= début + 1 mois ou + 3 mois ; le 31/01 + 1 mois donne le 28/02).
  if new.type_stage = 'Académique'
     and new.date_fin < (new.date_debut + interval '1 month')::date then
    raise exception 'DUREE_ACADEMIQUE';
  end if;
  if new.type_stage = 'Professionnel'
     and new.date_fin < (new.date_debut + interval '3 months')::date then
    raise exception 'DUREE_PROFESSIONNEL';
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

  -- Stage professionnel : renouvelable une seule fois, donc deux stages professionnels au maximum.
  if new.type_stage = 'Professionnel' then
    select count(*) into v_nb
    from public.stages s
    where s.id <> new.id
      and s.type_stage = 'Professionnel'
      and (s.cle_identite = new.cle_identite
           or (new.user_id is not null and s.user_id = new.user_id));
    if v_nb >= 2 then
      raise exception 'RENOUVELLEMENT_EPUISE';
    end if;
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
create or replace function public.enregistrer_stage(
  p_nom text, p_filiere text, p_type text, p_but text, p_debut date, p_fin date
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
  if v_uid is null then
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  end if;

  insert into public.stages
    (user_id, code_rattachement, nom_prenoms, filiere, type_stage, but_stage, date_debut, date_fin)
  values
    (v_uid, v_code, trim(p_nom), trim(p_filiere), trim(p_type), trim(p_but), p_debut, p_fin);

  return v_code;
end;
$$;

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

revoke all on function public.enregistrer_stage(text, text, text, text, date, date) from public;
grant execute on function public.enregistrer_stage(text, text, text, text, date, date) to anon, authenticated;

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
