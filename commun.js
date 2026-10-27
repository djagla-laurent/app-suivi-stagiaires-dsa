const $ = (id) => document.getElementById(id);
const dateFr = (d) => (d ? d.split("-").reverse().join("/") : "");
const aujourdhui = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-JJ
const formaterCode = (c) => (c ? c.slice(0, 5) + "-" + c.slice(5) : "");

function dire(id, texte, classe) {
  const el = $(id);
  el.textContent = texte;
  el.className = "message " + (classe || "");
}

function messageErreur(error) {
  const m = (error && error.message) || "";
  if (/DEJA_ENREGISTRE/.test(m)) return "Vous êtes déjà enregistré avec ces mêmes dates de début et de fin.";
  if (/STAGE_CHEVAUCHANT/.test(m)) return "Un stage est déjà enregistré sur une période qui chevauche celle-ci. Il n'est pas possible d'échelonner deux stages.";
  if (/NOM_INVALIDE/.test(m)) return "Le nom saisi n'est pas valide.";
  if (/UNIVERSITE_INVALIDE/.test(m)) return "L'université est obligatoire.";
  if (/NIVEAU_INVALIDE/.test(m)) return "Le niveau de formation est obligatoire.";
  if (/ADMIN_REQUIS/.test(m)) return "Action réservée à l'administrateur.";
  if (/TYPE_INVALIDE/.test(m)) return "Le type de stage n'est pas valide.";
  if (/INFOS_INVALIDES/.test(m)) return "Renseignez tous les champs obligatoires.";
  if (/AUCUN_STAGE_A_COMPLETER/.test(m)) return "Aucun stage à compléter sur votre compte.";
  if (/ACTION_INTERDITE/.test(m)) return "Cette action n'est pas autorisée dans l'état actuel.";
  if (/SEMAINE_FUTURE/.test(m)) return "Vous ne pouvez pas rédiger le bilan d'une semaine à venir.";
  if (/SEMAINE_HORS_STAGE/.test(m)) return "Cette semaine est en dehors de la période de votre stage.";
  if (/HORS_PERIODE_STAGE/.test(m)) return "Les dates doivent se situer dans la période de votre stage.";
  if (/ACTIVITE_REQUISE/.test(m)) return "Choisissez au moins une activité réalisée.";
  if (/MOIS_HORS_STAGE/.test(m)) return "Ce mois est en dehors de la période de votre stage.";
  if (/MOIS_FUTUR/.test(m)) return "Vous ne pouvez pas rédiger le bilan d'un mois à venir.";
  if (/activites_ext_ok/.test(m)) return "Les activités extérieures saisies ne sont pas valides.";
  if (/memoire_etape_ok|memoire_avancement/.test(m)) return "Le suivi du mémoire n'est pas valide (avancement entre 0 et 100).";
  if (/bilans?_(mensuels_)?activites_liste_ok|violates check constraint/i.test(m)) return "Une des activités choisies n'est pas valide.";
  if (/duplicate key/i.test(m)) return "Cet enregistrement existe déjà.";
  if (/row-level security/i.test(m)) return "Action refusée. Vérifiez que votre stage est bien rattaché à votre compte.";
  if (/invalid login credentials/i.test(m)) return "Adresse e-mail ou mot de passe incorrect.";
  if (/already registered/i.test(m)) return "Un compte existe déjà avec cette adresse e-mail. Connectez-vous.";
  if (/password/i.test(m)) return "Le mot de passe est trop court ou trop faible.";
  if (/failed to fetch|network/i.test(m)) return "Connexion impossible. Vérifiez votre connexion internet.";
  return "L'opération a échoué. Vérifiez les informations et réessayez.";
}

/* ---------- Calcul des jours restants ---------- */
function jourUTC(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, j);
}
const joursEntre = (debut, fin) => Math.round((jourUTC(fin) - jourUTC(debut)) / 86400000);
const jours = (n) => n + " jour" + (n > 1 ? "s" : "");

function messageStage(s) {
  const t = aujourdhui();
  const periode = dateFr(s.date_debut) + " - " + dateFr(s.date_fin);
  if (t < s.date_debut) {
    return "Votre stage à la DSA commence dans " + jours(joursEntre(t, s.date_debut)) + ", période " + periode + ".";
  }
  if (t > s.date_fin) {
    return "Votre stage à la DSA est terminé, période " + periode + ".";
  }
  const n = joursEntre(t, s.date_fin);
  if (n === 0) {
    return "Aujourd'hui est le dernier jour de votre stage à la DSA, période " + periode + ".";
  }
  return "Il vous reste " + jours(n) + " pour finir votre stage à la DSA, période " + periode + ".";
}

// Période affichée par défaut : en cours, sinon la prochaine, sinon la plus récente.
// La liste est triée du plus récent au plus ancien (date de début).
function periodeParDefaut(liste) {
  const t = aujourdhui();
  const enCours = liste.find((s) => s.date_debut <= t && t <= s.date_fin);
  if (enCours) return enCours;
  const aVenir = liste.filter((s) => s.date_debut > t).sort((a, b) => (a.date_debut < b.date_debut ? -1 : 1));
  if (aVenir.length) return aVenir[0];
  return liste[0];
}

/* ---------- Semaines, mouvements et bilans ---------- */
const hm = (h) => (h ? h.slice(0, 5) : "");
const maintenantHM = () => new Date().toTimeString().slice(0, 5);
const ajouterJours = (iso, n) => new Date(jourUTC(iso) + n * 86400000).toISOString().slice(0, 10);
const lundiDe = (iso) => ajouterJours(iso, -((new Date(jourUTC(iso)).getUTCDay() + 6) % 7));
const periodeSemaine = (lundi) => dateFr(lundi) + " au " + dateFr(ajouterJours(lundi, 6));

const TYPES_MOUVEMENT = {
  sortie: "Sortie / permission",
  weekend: "Sortie de week-end",
  absence: "Absence",
  retard: "Retard",
  mission: "Mission / déplacement"
};
const AVEC_RETOUR = ["sortie", "weekend", "mission"];
const STATUTS_MOUVEMENT = { en_attente: "En attente", approuve: "Approuvée", refuse: "Refusée" };
const STATUTS_BILAN = {
  brouillon: "Brouillon",
  soumis: "Soumis, en attente de visa",
  vise: "Visé",
  a_corriger: "À corriger"
};

function periodeMouvement(m) {
  const hd = hm(m.heure_depart);
  const hr = hm(m.heure_retour);
  if (m.date_debut === m.date_fin) {
    let t = "Le " + dateFr(m.date_debut);
    if (hd && hr) t += " de " + hd + " à " + hr;
    else if (hd) t += " à partir de " + hd;
    else if (hr) t += ", retour prévu à " + hr;
    return t;
  }
  return "Du " + dateFr(m.date_debut) + (hd ? " à " + hd : "") +
    " au " + dateFr(m.date_fin) + (hr ? " à " + hr : "");
}

const enMinuscule = (t) => t.charAt(0).toLowerCase() + t.slice(1);

// Sortie approuvée dont le retour n'est pas confirmé alors que l'heure prévue est dépassée.
function retourEnRetard(m) {
  if (m.statut !== "approuve" || m.retour_confirme_le || !AVEC_RETOUR.includes(m.type)) return false;
  const t = aujourdhui();
  if (m.date_fin < t) return true;
  return m.date_fin === t && !!m.heure_retour && maintenantHM() > hm(m.heure_retour);
}

/* ---------- Pastilles de statut ---------- */
const TON_MOUVEMENT = { en_attente: "attente", approuve: "ok", refuse: "ko" };
const TON_BILAN = { brouillon: "neutre", soumis: "attente", vise: "ok", a_corriger: "ko" };

function pastille(texte, ton) {
  const s = document.createElement("span");
  s.className = "pastille " + (ton || "neutre");
  s.textContent = texte;
  return s;
}

/* ---------- Période d'un stage et ses semaines ---------- */
// Lundis de toutes les semaines du stage : de la semaine du début jusqu'à la semaine de la date de fin.
function semainesDuStage(s) {
  const liste = [];
  for (let l = lundiDe(s.date_debut); l <= s.date_fin; l = ajouterJours(l, 7)) liste.push(l);
  return liste;
}
const periodeStage = (s) => dateFr(s.date_debut) + " - " + dateFr(s.date_fin);
const lienStage = (page, s) => page + "?stage=" + encodeURIComponent(s.id);
const bornerDate = (iso, min, max) => (iso < min ? min : iso > max ? max : iso);

// Stage demandé dans l'adresse (?stage=...), sinon le stage affiché par défaut.
function stageDemande(stages) {
  const id = new URLSearchParams(location.search).get("stage");
  return stages.find((x) => x.id === id) || periodeParDefaut(stages);
}

/* ---------- Activités réalisées : liste fermée, de la préparation de l'étude à la présentation des résultats ---------- */
const ACTIVITES = [
  "Élaborer une revue de littérature",
  "Rédiger des termes de référence",
  "Élaborer un protocole de recherche ou un document de méthodologie",
  "Concevoir un questionnaire d'enquête",
  "Programmer un questionnaire sur Survey Solutions ou KoboToolbox",
  "Déployer un questionnaire sur smartphone ou tablette",
  "Extraire une base de données d'un serveur dans un format donné",
  "Constituer et organiser des bases de données",
  "Traiter et apurer des données",
  "Réaliser une tabulation",
  "Produire des statistiques descriptives avec Stata ou un autre logiciel statistique",
  "Faire des analyses dans Excel et présenter des résultats dans Word",
  "Choisir un format de tableau ou de graphique adapté à un type de données",
  "Réaliser des tableaux statistiques et des visualisations",
  "Interpréter des données",
  "Faire ressortir des informations d'aide à la décision",
  "Élaborer une fiche d'information statistique",
  "Élaborer une note thématique",
  "Élaborer une note de conjoncture en respectant sa structure",
  "Rédiger un rapport d'étude, d'activité ou d'atelier",
  "Élaborer un annuaire statistique en respectant sa structure",
  "Élaborer un manuel d'instruction",
  "Présenter une thématique avec PowerPoint"
];

// Liste déroulante à cases à cocher. Retourne { get(), set(liste), disable(bool) }.
function listeActivites(zone) {
  const details = document.createElement("details");
  details.className = "multi";
  const resume = document.createElement("summary");
  const panneau = document.createElement("div");
  panneau.className = "multi-liste";
  const puces = document.createElement("div");
  puces.className = "puces";

  const cases = ACTIVITES.map((texte) => {
    const lab = document.createElement("label");
    const c = document.createElement("input");
    c.type = "checkbox";
    c.value = texte;
    c.addEventListener("change", maj);
    const t = document.createElement("span");
    t.textContent = texte;
    lab.append(c, t);
    panneau.appendChild(lab);
    return c;
  });

  const choisies = () => cases.filter((c) => c.checked).map((c) => c.value);
  let inconnues = [];

  function maj() {
    const liste = choisies();
    const n = liste.length;
    resume.textContent = n === 0 ? "Choisir les activités réalisées"
      : n + " activité" + (n > 1 ? "s" : "") + " sélectionnée" + (n > 1 ? "s" : "");
    const puce = (texte, ancienne) => {
      const p = document.createElement("span");
      p.className = "puce" + (ancienne ? " ancienne" : "");
      p.textContent = ancienne ? texte + " (ancienne activité)" : texte;
      return p;
    };
    // Une activité enregistrée avec une formulation qui n'est plus dans la liste reste visible.
    puces.replaceChildren(...liste.map((t) => puce(t, false)), ...inconnues.map((t) => puce(t, true)));
  }

  details.append(resume, panneau);

  // La liste se replie quand on clique en dehors d'elle.
  document.addEventListener("click", (e) => {
    if (details.open && !details.contains(e.target)) details.open = false;
  });
  zone.replaceChildren(details, puces);
  maj();

  return {
    get: choisies,
    set(liste) {
      inconnues = (liste || []).filter((x) => !ACTIVITES.includes(x));
      cases.forEach((c) => { c.checked = (liste || []).includes(c.value); });
      maj();
    },
    disable(oui) { cases.forEach((c) => { c.disabled = oui; }); details.classList.toggle("verrouille", oui); }
  };
}

/* ---------- Mois de stage ---------- */
// Même règle que la base : un mois commence le jour du début du stage, puis le même quantième
// des mois suivants (clampé en fin de mois). Un dernier mois de moins de 7 jours est rattaché au précédent.
function ajouterMoisIso(iso, n) {
  const [a, m, j] = iso.split("-").map(Number);
  const total = (m - 1) + n;
  const an = a + Math.floor(total / 12);
  const mois = total % 12;
  const dernier = new Date(Date.UTC(an, mois + 1, 0)).getUTCDate();
  return an + "-" + String(mois + 1).padStart(2, "0") + "-" + String(Math.min(j, dernier)).padStart(2, "0");
}

function moisDuStage(s) {
  const liste = [];
  for (let k = 0; k < 120; k++) {
    const debut = ajouterMoisIso(s.date_debut, k);
    if (debut > s.date_fin) break;
    if (k > 0 && joursEntre(debut, s.date_fin) < 6) break;
    liste.push({ debut });
  }
  liste.forEach((m, i) => { m.fin = i < liste.length - 1 ? ajouterJours(liste[i + 1].debut, -1) : s.date_fin; });
  return liste;
}
const periodeMois = (m) => dateFr(m.debut) + " au " + dateFr(m.fin);

/* ---------- Suivi du mémoire (stage académique) ---------- */
const ETAPES_MEMOIRE = [
  "Choix et délimitation du sujet",
  "Revue de littérature",
  "Problématique et méthodologie",
  "Collecte des données",
  "Traitement et analyse des données",
  "Rédaction",
  "Relecture et corrections",
  "Dépôt et préparation de la soutenance"
];

/* ---------- Activités extérieures, sur instruction de la DSA ---------- */
// Retourne { get(), set(liste), bornes(min, max), disable(bool) }.
// get() retourne null si une activité est incomplète (date et objet obligatoires) ou hors des bornes.
function listeExterieures(zone) {
  const lignes = document.createElement("div");
  const ajout = document.createElement("button");
  ajout.type = "button";
  ajout.textContent = "Ajouter une activité extérieure";
  let verrou = false, min = "", max = "";

  function champ(libelle, type, valeur, longueur) {
    const label = document.createElement("label");
    const saisie = document.createElement("input");
    saisie.type = type;
    saisie.value = valeur || "";
    if (longueur) saisie.maxLength = longueur;
    label.append(libelle, saisie);
    return { label, saisie };
  }

  function appliquer(carte) {
    const c = carte._champs;
    c.date.min = min;
    c.date.max = max;
    Object.values(c).forEach((e) => { e.disabled = verrou; });
  }

  function ajouterLigne(v) {
    const carte = document.createElement("div");
    carte.className = "card";
    carte.style.marginBottom = "10px";
    const d = champ("Date", "date", v.date);
    const o = champ("Objet de l'activité", "text", v.objet, 300);
    const l = champ("Lieu ou structure d'accueil", "text", v.lieu, 150);
    const i = champ("Instruction donnée par la DSA", "text", v.instruction, 150);
    const retirer = document.createElement("button");
    retirer.type = "button";
    retirer.textContent = "Retirer";
    retirer.className = "danger";
    retirer.addEventListener("click", () => carte.remove());
    carte.append(d.label, o.label, l.label, i.label, retirer);
    carte._champs = { date: d.saisie, objet: o.saisie, lieu: l.saisie, instruction: i.saisie, retirer };
    appliquer(carte);
    lignes.appendChild(carte);
  }

  ajout.addEventListener("click", () => ajouterLigne({}));
  zone.replaceChildren(lignes, ajout);

  return {
    get() {
      const res = [];
      for (const carte of lignes.children) {
        const c = carte._champs;
        const v = { date: c.date.value, objet: c.objet.value.trim(), lieu: c.lieu.value.trim(), instruction: c.instruction.value.trim() };
        if (!v.date && !v.objet && !v.lieu && !v.instruction) continue;
        if (!v.date || !v.objet) return null;
        if ((min && v.date < min) || (max && v.date > max)) return null;
        res.push(v);
      }
      return res;
    },
    set(liste) { lignes.replaceChildren(); (liste || []).forEach(ajouterLigne); },
    bornes(a, b) { min = a; max = b; [...lignes.children].forEach(appliquer); },
    disable(oui) { verrou = oui; ajout.hidden = oui; [...lignes.children].forEach(appliquer); }
  };
}

/* ---------- Bilan mensuel généré à partir des bilans hebdomadaires ---------- */
// Une semaine appartient au mois où tombe son lundi ; les semaines qui commencent avant le début
// du stage sont rattachées au premier mois.
function semainesDuMoisStage(semaines, mois, i) {
  const m = mois[i];
  return semaines.filter((l) => (i === 0 ? l <= m.fin : l >= m.debut && l <= m.fin));
}

// Bloc « titre + tableau ». Chaque ligne est un tableau de cellules (texte ou liste de lignes),
// ou { cells: [...], gras: true } pour une ligne de synthèse.
function tableauBloc(titre, entetes, lignes) {
  const d = document.createElement("div");
  d.className = "champ";
  const t = document.createElement("span");
  t.className = "etiquette";
  t.textContent = titre;
  const zone = document.createElement("div");
  zone.className = "tableau compact";
  const table = document.createElement("table");
  const hr = table.createTHead().insertRow();
  entetes.forEach((e) => {
    const th = document.createElement("th");
    th.textContent = e;
    hr.appendChild(th);
  });
  const corps = table.createTBody();
  lignes.forEach((l) => {
    const cells = Array.isArray(l) ? l : l.cells;
    const tr = corps.insertRow();
    cells.forEach((c, k) => {
      const td = tr.insertCell();
      if (k > 0) { td.className = "long"; td.style.minWidth = "140px"; td.style.whiteSpace = "pre-wrap"; }
      (Array.isArray(c) ? c : [c]).forEach((ligne) => {
        const x = document.createElement("div");
        x.textContent = ligne;
        td.appendChild(x);
      });
      if (!Array.isArray(l) && l.gras) td.style.fontWeight = "700";
    });
  });
  zone.appendChild(table);
  d.append(t, zone);
  return d;
}

// Blocs de synthèse d'un mois : un tableau par rubrique, une ligne par semaine.
// « pris » : bilans hebdomadaires soumis ou visés du mois, classés par semaine.
function syntheseMensuelle(pris, academique) {
  const sem = (b) => ["Du " + dateFr(b.semaine_debut), "au " + dateFr(ajouterJours(b.semaine_debut, 6))];
  const blocs = [];

  // Activités réalisées
  const compte = new Map();
  const lignesAct = [];
  pris.forEach((b) => {
    const liste = b.activites_liste || [];
    liste.forEach((a) => compte.set(a, (compte.get(a) || 0) + 1));
    const lignes = liste.length ? liste.map((a) => "• " + a) : (b.activites && b.activites.trim() ? [b.activites.trim()] : []);
    if (lignes.length) lignesAct.push([sem(b), lignes]);
  });
  if (lignesAct.length) {
    if (compte.size) {
      const ordre = (a) => { const k = ACTIVITES.indexOf(a); return k < 0 ? 999 : k; };
      const synthese = [...compte.keys()].sort((a, b) => ordre(a) - ordre(b)).map((a) => "• " + a);
      lignesAct.push([["Synthèse", "du mois"], synthese]);
    }
    blocs.push(tableauBloc("Activités réalisées", ["Semaine", "Activités"], lignesAct));
  }

  const texte = (titre, champ, entete) => {
    const l = pris.filter((b) => b[champ] && String(b[champ]).trim()).map((b) => [sem(b), String(b[champ]).trim()]);
    if (l.length) blocs.push(tableauBloc(titre, ["Semaine", entete], l));
  };
  texte("Autres tâches hors liste", "autres_taches", "Tâches");
  texte("Travaux personnels", "travaux_perso", "Travaux");

  // Activités extérieures
  const ext = [];
  pris.forEach((b) => (b.activites_ext || []).forEach((a) => ext.push(a)));
  ext.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (ext.length) {
    blocs.push(tableauBloc("Activités extérieures sur instruction de la DSA",
      ["Date", "Objet", "Lieu ou structure", "Instruction donnée par"],
      ext.map((a) => [dateFr(a.date), a.objet, a.lieu || "—", a.instruction || "—"])));
  }

  // Suivi du mémoire (stage académique)
  const aAv = (b) => b.memoire_avancement !== null && b.memoire_avancement !== undefined;
  const avec = pris.filter((b) => b.memoire_etape || aAv(b) || (b.memoire_commentaire && b.memoire_commentaire.trim()));
  if (academique && avec.length) {
    const av = (b) => (aAv(b) ? b.memoire_avancement + " %" : "—");
    const lignes = avec.map((b) => [sem(b), b.memoire_etape || "—", av(b), (b.memoire_commentaire || "").trim() || "—"]);
    const d = avec[avec.length - 1];
    lignes.push({ cells: [["Situation", "actuelle"], d.memoire_etape || "—", av(d), ""], gras: true });
    blocs.push(tableauBloc("Suivi du mémoire ou des travaux académiques", ["Semaine", "Étape", "Avancement", "Travaux réalisés"], lignes));
  }

  texte("Compétences ou connaissances acquises", "acquis", "Contenu");
  texte("Difficultés rencontrées", "difficultes", "Contenu");
  texte("Objectifs", "objectifs", "Contenu");
  return blocs;
}
