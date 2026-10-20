-- À coller dans Supabase > SQL Editor > New query (projet stages-dsa), puis cliquer sur "Run".
-- Prérequis : supabase-stages.sql et supabase-mouvements.sql déjà exécutés.
-- Peut être relancé sans risque. N'efface aucune donnée.

-- =========================================================
-- 1. BILANS : uniquement pour les semaines d'un stage du stagiaire
--    (de la semaine du début du stage jusqu'à la semaine de la date de fin)
-- =========================================================
create or replace function public.controle_bilan()
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

      -- La semaine doit appartenir à un stage de ce stagiaire.
      if not exists (
        select 1 from public.stages s
         where s.user_id = new.user_id
           and new.semaine_debut >= s.date_debut - (extract(isodow from s.date_debut)::int - 1)
           and new.semaine_debut <= s.date_fin
      ) then
        raise exception 'SEMAINE_HORS_STAGE';
      end if;

      if new.semaine_debut > current_date + 1 then
        raise exception 'SEMAINE_FUTURE';
      end if;

      new.commentaire_admin := null;
      new.vise_le := null;
    end if;
  else
    if not public.est_admin() then
      -- Le stagiaire ne modifie que ses brouillons et bilans à corriger.
      if old.statut not in ('brouillon','a_corriger') or new.statut not in ('brouillon','soumis') then
        raise exception 'ACTION_INTERDITE';
      end if;
      new.user_id := old.user_id;
      new.semaine_debut := old.semaine_debut;
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

drop trigger if exists trg_controle_bilan on public.bilans;
create trigger trg_controle_bilan
  before insert or update on public.bilans
  for each row execute function public.controle_bilan();

-- =========================================================
-- 2. MOUVEMENTS : dates comprises dans la période d'un stage du stagiaire
-- =========================================================
create or replace function public.controle_mouvement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    if not exists (
      select 1 from public.stages s
       where s.user_id = new.user_id
         and new.date_debut >= s.date_debut
         and new.date_fin <= s.date_fin
    ) then
      raise exception 'HORS_PERIODE_STAGE';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_controle_mouvement on public.mouvements;
create trigger trg_controle_mouvement
  before insert on public.mouvements
  for each row execute function public.controle_mouvement();
