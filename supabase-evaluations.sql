-- À coller dans Supabase > SQL Editor > New query (projet stages-dsa), puis cliquer sur "Run".
-- Prérequis : supabase-stages.sql, supabase-mouvements.sql et supabase-periodes.sql déjà exécutés.
-- Peut être relancé sans risque. N'efface aucune donnée : les anciens bilans (activités en texte libre) sont conservés.

-- =========================================================
-- 1. LISTE DES ACTIVITÉS AUTORISÉES
--    Pour modifier la liste plus tard : changer les lignes ci-dessous et relancer ce script.
-- =========================================================
create or replace function public.activites_autorisees()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'Élaborer une revue de littérature',
    'Rédiger des termes de référence',
    'Élaborer un protocole de recherche ou un document de méthodologie',
    'Concevoir un questionnaire d''enquête',
    'Programmer un questionnaire sur Survey Solutions ou KoboToolbox',
    'Déployer un questionnaire sur smartphone ou tablette',
    'Extraire une base de données du serveur dans un format donné',
    'Constituer et organiser des bases de données',
    'Traiter et apurer des données',
    'Réaliser une tabulation',
    'Produire des statistiques descriptives avec Stata ou un autre logiciel statistique',
    'Faire des analyses dans Excel et présenter des résultats dans Word',
    'Choisir un format de tableau ou de graphique adapté à un type de données',
    'Réaliser des tableaux statistiques et des visualisations',
    'Interpréter des données',
    'Faire ressortir des informations d''aide à la décision',
    'Élaborer une fiche d''information statistique',
    'Élaborer une note thématique',
    'Élaborer une note de conjoncture en respectant sa structure',
    'Rédiger un rapport d''étude, d''activité ou d''atelier',
    'Élaborer un annuaire statistique en respectant sa structure',
    'Élaborer un manuel d''instruction',
    'Présenter une thématique avec PowerPoint'
  ]::text[];
$$;

-- =========================================================
-- 2. BILANS HEBDOMADAIRES : activités choisies dans la liste
--    (la colonne « activites » en texte reste : elle est remplie automatiquement
--     à partir de la liste, et contient l'ancienne saisie libre pour les anciens bilans)
-- =========================================================
alter table public.bilans
  add column if not exists activites_liste text[] not null default '{}'::text[];

alter table public.bilans drop constraint if exists bilans_activites_liste_ok;
alter table public.bilans
  add constraint bilans_activites_liste_ok
  check (activites_liste <@ public.activites_autorisees());

create or replace function public.maj_activites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(cardinality(new.activites_liste), 0) > 0 then
    new.activites := array_to_string(new.activites_liste, E'\n');
  elsif not public.est_admin() then
    -- Un stagiaire doit choisir au moins une activité pour créer ou soumettre un bilan.
    if tg_op = 'INSERT' or new.statut = 'soumis' then
      raise exception 'ACTIVITE_REQUISE';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activites_bilan on public.bilans;
create trigger trg_activites_bilan
  before insert or update on public.bilans
  for each row execute function public.maj_activites();

-- =========================================================
-- 3. BILANS MENSUELS
--    Un « mois de stage » commence le jour du début du stage, puis le même quantième
--    des mois suivants (05/10, 05/11, 05/12...). Un dernier mois de moins de 7 jours
--    est rattaché au mois précédent.
-- =========================================================
create table if not exists public.bilans_mensuels (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  mois_debut        date not null,
  activites         text not null default '' check (char_length(activites) <= 3000),
  activites_liste   text[] not null default '{}'::text[] check (activites_liste <@ public.activites_autorisees()),
  acquis            text not null default '' check (char_length(acquis) <= 2000),
  difficultes       text not null default '' check (char_length(difficultes) <= 2000),
  objectifs         text not null default '' check (char_length(objectifs) <= 2000),
  statut            text not null default 'brouillon' check (statut in ('brouillon','soumis','vise','a_corriger')),
  commentaire_admin text check (char_length(commentaire_admin) <= 1000),
  soumis_le         timestamptz,
  vise_le           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, mois_debut)
);

alter table public.bilans_mensuels enable row level security;
revoke all on public.bilans_mensuels from anon, authenticated;
grant select, insert, update, delete on public.bilans_mensuels to authenticated;

drop trigger if exists trg_activites_mensuel on public.bilans_mensuels;
create trigger trg_activites_mensuel
  before insert or update on public.bilans_mensuels
  for each row execute function public.maj_activites();

create or replace function public.controle_bilan_mensuel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not public.est_admin() then
      if new.statut not in ('brouillon','soumis') then
        raise exception 'ACTION_INTERDITE';
      end if;

      -- Le mois doit être un mois d'un stage de ce stagiaire.
      if not exists (
        select 1
          from public.stages s
          cross join generate_series(0, 60) k
         where s.user_id = new.user_id
           and (s.date_debut + (k * interval '1 month'))::date = new.mois_debut
           and (k = 0 or s.date_fin - new.mois_debut >= 6)
      ) then
        raise exception 'MOIS_HORS_STAGE';
      end if;

      if new.mois_debut > current_date + 1 then
        raise exception 'MOIS_FUTUR';
      end if;

      new.commentaire_admin := null;
      new.vise_le := null;
    end if;
  else
    if not public.est_admin() then
      if old.statut not in ('brouillon','a_corriger') or new.statut not in ('brouillon','soumis') then
        raise exception 'ACTION_INTERDITE';
      end if;
      new.user_id := old.user_id;
      new.mois_debut := old.mois_debut;
      new.commentaire_admin := old.commentaire_admin;
      new.vise_le := old.vise_le;
    end if;
  end if;

  if new.statut = 'soumis' and (tg_op = 'INSERT' or old.statut is distinct from 'soumis') then
    new.soumis_le := now();
  end if;
  if new.statut = 'vise' and (tg_op = 'INSERT' or old.statut is distinct from 'vise') then
    new.vise_le := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_controle_mensuel on public.bilans_mensuels;
create trigger trg_controle_mensuel
  before insert or update on public.bilans_mensuels
  for each row execute function public.controle_bilan_mensuel();

drop policy if exists "mensuel lecture" on public.bilans_mensuels;
drop policy if exists "mensuel ajout" on public.bilans_mensuels;
drop policy if exists "mensuel modification" on public.bilans_mensuels;
drop policy if exists "mensuel suppression" on public.bilans_mensuels;

create policy "mensuel lecture"
  on public.bilans_mensuels for select
  to authenticated
  using (user_id = auth.uid() or public.est_admin());

create policy "mensuel ajout"
  on public.bilans_mensuels for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.stages s where s.user_id = auth.uid())
  );

create policy "mensuel modification"
  on public.bilans_mensuels for update
  to authenticated
  using (public.est_admin() or (user_id = auth.uid() and statut in ('brouillon','a_corriger')))
  with check (public.est_admin() or user_id = auth.uid());

create policy "mensuel suppression"
  on public.bilans_mensuels for delete
  to authenticated
  using (public.est_admin());
